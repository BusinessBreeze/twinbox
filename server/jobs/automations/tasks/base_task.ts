// Base class for all task types.
// One object per task per automation run. The base class owns all state in private fields and drives
// the lifecycle; a subclass only sets `static definition` and implements execute(), reading via getters.
import { userMetrics, getExtensionFromMime } from '../deps';
import { EMAIL_MIME, freezeItem, unionRefs } from './items';
import { ItemError, type TaskOutput, type EmailContent, type TaskContext, type TaskDefinition, type TaskInstance, type TaskItem } from './types';
import type { PipelineRun } from './pipeline_run';

export type TaskStatus = 'pending' | 'done' | 'failed' | 'skipped';

/** A task class as the registry holds it: constructor plus its static definition. */
export type TaskClass = (new (instance: TaskInstance, ctx: TaskContext) => BaseTask) & { definition: TaskDefinition };

export abstract class BaseTask {
    /** Set by every subclass (definition.ts, client-safe data). */
    static definition: TaskDefinition;

    readonly #instance: Readonly<TaskInstance>;
    readonly #args: Readonly<Record<string, any>>;
    readonly #ctx: TaskContext;
    #run: PipelineRun | null = null;
    #batchCount = 0;
    #status: TaskStatus = 'pending';
    #outputs: TaskItem[] = [];
    #error: Error | null = null;
    #skipReason: string | null = null;

    constructor(instance: TaskInstance, ctx: TaskContext) {
        this.#instance = Object.freeze({ ...instance });
        this.#args = Object.freeze({ ...instance.args });
        this.#ctx = ctx;
    }

    // --- read access (subclasses, runner, PipelineRun) ---
    get definition(): TaskDefinition { return (this.constructor as TaskClass).definition; }
    get id() { return this.#instance.id; }
    get type() { return this.#instance.type; }
    get label() { return this.#instance.label; }
    get inputIds(): readonly string[] { return this.#instance.inputs; }
    get args() { return this.#args; }
    get ctx() { return this.#ctx; }
    get aggregate(): boolean { return !!this.#instance.aggregate; }
    /** How many times execute() is called in this run (1 when aggregating or with a single item). */
    protected get batchCount() { return this.#batchCount; }
    get status() { return this.#status; }
    get outputs(): readonly TaskItem[] { return this.#outputs; }
    get itemErrors(): readonly TaskItem[] { return this.#outputs.filter((o) => o.error); }
    get error() { return this.#error; }
    get skipReason() { return this.#skipReason; }

    /** Original source item behind a source ref, e.g. for threading headers. */
    protected getSource(ref: string): TaskItem | undefined {
        return this.#run?.getSource(ref);
    }

    /** The only method a task type implements. Called once per item, or once with all items when aggregating. */
    protected abstract execute(inputs: TaskItem[]): Promise<TaskOutput | null>;

    // --- lifecycle, called by the runner (each task object runs at most once) ---
    skip(reason: string) {
        this.#assertPending();
        this.#skipReason = reason;
        this.#status = 'skipped';
    }

    /**
     * Runs the task over its resolved inputs. Never throws: an outage ends in status 'failed'
     * (the runner then aborts the run); ItemErrors become error notices in outputs.
     */
    async process(run: PipelineRun, inputs: TaskItem[]): Promise<void> {
        this.#assertPending();
        this.#run = run;

        // Transforms never see error notices, they forward them. Delivery tasks get everything.
        const delivers = this.definition.output === null;
        const items = delivers ? inputs : inputs.filter((i) => !i.error);
        if (!delivers) this.#outputs.push(...inputs.filter((i) => i.error));

        const batches = this.aggregate ? (items.length > 0 ? [items] : []) : items.map((i) => [i]);
        this.#batchCount = batches.length;

        try {
            for (const batch of batches) {
                await this.#processBatch(batch);
            }
            this.#status = 'done';
        } catch (err) {
            this.#error = err instanceof Error ? err : new Error(String(err));
            this.#status = 'failed';
        }
    }

    async #processBatch(batch: TaskItem[]) {
        try {
            const output = await this.execute(batch);
            userMetrics.recordTaskRun(this.#ctx.ownerId);
            if (output) {
                this.#outputs.push(freezeItem(this.#withDefaults(output, batch)));
                userMetrics.recordArtifactCreated(this.#ctx.ownerId);
            }
        } catch (err) {
            if (!(err instanceof ItemError)) throw err;
            this.#outputs.push(freezeItem(this.#errorNotice(batch, err.message)));
        }
    }

    /**
     * Fills what execute() left out: mime from the definition, label from the task, filename, sourceRefs.
     * The default filename names the source item when there is exactly one, so per-item outputs of the
     * same task don't overwrite each other ("Text to speech - <subject>.mp3").
     */
    #withDefaults(output: TaskOutput, batch: TaskItem[]): TaskItem {
        const mime = output.mime ?? this.definition.output?.mime ?? 'text/plain';
        const label = output.label ?? this.label;
        const sourceRefs = output.sourceRefs?.length ? output.sourceRefs : unionRefs(batch);
        const sourceLabel = sourceRefs.length === 1 ? this.getSource(sourceRefs[0]!)?.label : undefined;
        return {
            ...output,
            mime,
            label,
            filename: output.filename ?? fileName(sourceLabel ? `${label} - ${sourceLabel}` : label, getExtensionFromMime(mime)),
            sourceRefs,
        };
    }

    /** Notice for the user. Failed emails are not saved locally, so it names them instead of linking. */
    #errorNotice(batch: TaskItem[], reason: string): TaskItem {
        const sourceRefs = unionRefs(batch);
        const lines = sourceRefs.map((ref) => {
            const src = this.getSource(ref);
            if (src?.mime !== EMAIL_MIME) return `- ${ref}`;
            const email = src.content as EmailContent;
            return `- "${email.subject}" from ${email.from} (${email.date})`;
        });

        return {
            mime: 'text/markdown',
            content: `**${this.label}** could not process:\n${lines.join('\n')}\n\nReason: ${reason}`,
            label: `${this.label} (error)`,
            filename: `${this.label}-error.md`,
            sourceRefs,
            error: { taskId: this.id, reason },
        };
    }

    #assertPending() {
        if (this.#status !== 'pending') throw new Error(`Task ${this.id} has already run`);
    }
}

/** Filesystem-safe file name: no path or reserved characters, bounded length. */
const fileName = (base: string, ext: string) =>
    `${base.replace(/[/\\?%*:|"<>]/g, '_').replace(/\s+/g, ' ').trim().slice(0, 120)}.${ext}`;
