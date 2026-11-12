// Base class for all source types (like BaseTask for tasks). One object per source record.
// Automations subscribe to a key that starts with the source id; the type decodes the rest (keys(), parseKey()):
// staging "<sourceId>", IMAP "<sourceId>:<folder>:<searchId>".
// Shared behavior lives here and is used only where a type needs it: run() for every type, prune() for types that
// store what they download (called daily by the source poll manager), start()/stop() for push types (later, IMAP IDLE).
// Scheduling (when to poll, when to prune) is the source poll manager's (server/jobs/cron/source_poll_manager.ts).
// The source layer knows nothing about automations: who runs a source and which keys have subscribers is
// supplied by the automation engine through setSourceHooks() at boot.
import { eq } from 'drizzle-orm';
import { db, sources, jobQueue, emitTelemetryEvent, EventScope, EventLevel, systemMaxItemsPerFetch } from './deps';
import { effectivePruneLimits, systemPruneLimits, type PruneLimits } from './limits';
import type { FilterResults, FetchResult, SourceDefinition, SourceRecord, SourceKeyOption } from './types';

export interface SourceHooks {
    /** Runs one source run (fetch → automations → complete). Provided by the automation engine. */
    run(source: BaseSource, keys: string[]): Promise<void>;
    /** Keys of a source that have at least one active subscribed automation (account not paused). */
    subscribedKeys(sourceId: string): Promise<string[]>;
}

let hooks: SourceHooks | null = null;
export const setSourceHooks = (h: SourceHooks) => { hooks = h; };

/** A source class as the registry holds it: constructor plus its static definition and static helpers. */
export type SourceClass = (new (record: SourceRecord) => BaseSource) & {
    definition: SourceDefinition;
    test(config: Record<string, any>): Promise<{ ok: boolean; reason?: string }>;
    listResources(config: Record<string, any>): Promise<Array<{ value: string; title: string }>>;
    newSettings(settings: Record<string, any>): Record<string, any>;
    normalizeSettings(settings: Record<string, any>, existing: Record<string, any>): Record<string, any>;
};

export abstract class BaseSource {
    static definition: SourceDefinition;

    readonly #record: SourceRecord;

    constructor(record: SourceRecord) {
        this.#record = record;
    }

    get definition(): SourceDefinition { return (this.constructor as SourceClass).definition; }
    get id() { return this.#record.id; }
    get ownerId() { return this.#record.owner_id; }
    get name() { return this.#record.name; }
    get record(): Readonly<SourceRecord> { return this.#record; }
    get pollSeconds() { return this.#record.poll_seconds; }
    /** Items per fetch: the source's own limit, never above the system limit. */
    get maxItems() { return Math.min(this.#record.max_items_per_fetch, systemMaxItemsPerFetch()); }
    /** What prune() keeps: the source's own limits, capped by the SOURCE_* env caps; 0 = no limit. */
    get pruneLimits(): PruneLimits { return effectivePruneLimits(this.#record, systemPruneLimits()); }

    // --- keys: what automations subscribe to ---
    /** All keys a user can subscribe to now (the IMAP type asks the server for its folders). */
    async keys(): Promise<SourceKeyOption[]> {
        return [{ key: this.id, label: this.name, source_id: this.id }];
    }
    /** A key's parts, or null when it doesn't belong to this source or is malformed. Types with more parts override. */
    parseKey(key: string): Record<string, string> | null {
        return key === this.id ? {} : null;
    }
    /** Why a key can't be used (unknown part, deleted search ...), or null. Checked on save, without the server. */
    keyProblem(key: string): string | null {
        return this.parseKey(key) ? null : 'invalid';
    }
    /** Label for a stored key without asking the server (automation table). */
    keyLabel(_key: string): string {
        return this.name;
    }

    // --- static helpers every type provides (connection test, selectable resources) ---
    static async test(_config: Record<string, any>): Promise<{ ok: boolean; reason?: string }> { return { ok: true }; }
    static async listResources(_config: Record<string, any>): Promise<Array<{ value: string; title: string }>> { return []; }
    /** Settings of a new source before they are validated (e.g. an entry every new source starts with). */
    static newSettings(settings: Record<string, any>): Record<string, any> {
        return settings;
    }
    /** Validated settings, before saving (e.g. ids for new entries). Called with the stored settings for reference. */
    static normalizeSettings(settings: Record<string, any>, _existing: Record<string, any>): Record<string, any> {
        const res = this.definition.settingsSchema.safeParse(settings ?? {});
        if (!res.success) {
            const issue = res.error.issues[0];
            const reason = issue?.message && /^[\w.]+$/.test(issue.message) ? issue.message : 'sources.settings.invalid';
            throw createError({ status: 422, statusMessage: `error ${reason}`, data: { field: `settings.${issue?.path.join('.')}`, issues: res.error.issues } });
        }
        return res.data;
    }

    /**
     * Starts a source run for these keys: queued under 'source:<id>', so one source never runs twice at once.
     * Used by the source poll manager, by push listeners and by "run now".
     */
    async run(keys: string[]): Promise<void> {
        if (!hooks || keys.length === 0) return;
        await jobQueue.enqueue({
            id: `source:${this.id}`,
            name: this.name,
            ownerId: this.ownerId,
            task: () => hooks!.run(this, keys),
        });
    }

    /** Keys with at least one active subscribed automation (account not paused). */
    async subscribedKeys(): Promise<string[]> {
        return hooks ? await hooks.subscribedKeys(this.id) : [];
    }

    /** A run of every subscribed key (polls and "run now"). */
    async runSubscribed(): Promise<void> {
        await this.run(await this.subscribedKeys());
    }

    /** Deletes what this source downloaded beyond its pruneLimits; returns how many items were deleted. */
    async prune(): Promise<number> { return 0; }

    // --- runtime state (sources.state): the type's own bookkeeping, e.g. IMAP checkpoints. Only the type writes it;
    // the sources service and the form never do, and runs of one source are serialized by the queue, so a
    // read-modify-write of this column can't lose an update.
    /** The value under `key` of this source's state (read from the database, so it is always current). */
    protected async getState<T = any>(key: string): Promise<T | undefined> {
        const row = await db.select({ state: sources.state }).from(sources).where(eq(sources.id, this.id)).get();
        return (row?.state as Record<string, any> | undefined)?.[key];
    }
    /** Replaces the value under `key`; other keys stay as they are. */
    protected async setState(key: string, value: unknown): Promise<void> {
        const row = await db.select({ state: sources.state }).from(sources).where(eq(sources.id, this.id)).get();
        const state = { ...((row?.state as Record<string, any>) || {}), [key]: value };
        await db.update(sources).set({ state }).where(eq(sources.id, this.id));
    }
    /** Keys that can't be used any more (e.g. their search was deleted): drop what the type keeps for them. */
    async forgetKeys(_keys: string[]): Promise<void> {}

    /** Push types only: open listeners that call run(). */
    async start(): Promise<void> {}
    async stop(): Promise<void> {}

    // --- run steps, called by the source run in this order: fetch → (filter) → afterFilter → (tasks) → afterTasks → complete ---
    /** New items of each key since its checkpoint, at most max_items_per_fetch; no connection stays open. */
    abstract fetch(keys: string[]): Promise<FetchResult>;
    /**
     * After the filter, before the tasks: act on the source according to each automation's options and the items
     * that passed (IMAP: mark read / important, one short session). The engine never interprets these options.
     */
    async afterFilter(_results: FilterResults): Promise<void> {}
    /**
     * After the tasks, the last thing done on the source: act on it according to each automation's options and the
     * items that passed the filter (IMAP: copy / move to a folder, one short session).
     */
    async afterTasks(_results: FilterResults): Promise<void> {}
    /** Store everything fetched and save how far the source got (IMAP: checkpoints); always, see the failure model. */
    abstract complete(): Promise<void>;

    protected warn(message: string, metadata: Record<string, unknown> = {}) {
        return this.event(EventLevel.WARN, message, metadata);
    }

    protected info(message: string, metadata: Record<string, unknown> = {}) {
        return this.event(EventLevel.INFO, message, metadata);
    }

    private event(level: EventLevel, message: string, metadata: Record<string, unknown>) {
        return emitTelemetryEvent({
            scope: EventScope.USER,
            level,
            category: 'source',
            message,
            owner_id: this.ownerId,
            metadata: { source: this.name, source_id: this.id, ...metadata },
        });
    }
}
