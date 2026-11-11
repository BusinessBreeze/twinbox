// All task objects for one automation run.
import { SOURCE_INPUT, type TaskItem } from './types';
import { freezeItem } from './items';
import type { BaseTask } from './base_task';

export class InputUnavailableError extends Error {}

/** done = fully processed, error = got an error notice, retry = run aborted before it finished. */
export type ItemOutcome = 'done' | 'error' | 'retry';

export class PipelineRun {
    readonly #source: readonly TaskItem[];
    readonly #sourceByRef: ReadonlyMap<string, TaskItem>;
    readonly #tasks = new Map<string, BaseTask>();
    #aborted: Error | null = null;

    constructor(source: TaskItem[]) {
        this.#source = Object.freeze(source.map(freezeItem));
        this.#sourceByRef = new Map(this.#source.flatMap((item) => item.sourceRefs.map((ref) => [ref, item] as const)));
    }

    get tasks(): readonly BaseTask[] { return [...this.#tasks.values()]; }
    get aborted(): Error | null { return this.#aborted; }

    getSource(ref: string): TaskItem | undefined {
        return this.#sourceByRef.get(ref);
    }

    add(task: BaseTask): void {
        if (this.#tasks.has(task.id)) throw new Error(`Duplicate task id ${task.id}`);
        this.#tasks.set(task.id, task);
    }

    abort(error: Error) {
        this.#aborted = error;
    }

    /** Items behind one input reference. Throws InputUnavailableError instead of falling back. */
    getInput(id: string): TaskItem[] {
        if (id === SOURCE_INPUT) return [...this.#source];

        const task = this.#tasks.get(id);
        if (!task) throw new InputUnavailableError(`Input ${id} does not exist`);
        if (task.status !== 'done') {
            throw new InputUnavailableError(`Input "${task.label}" (${id}) is ${task.status}`);
        }
        return [...task.outputs];
    }

    /** Per source ref: what the source should do with it (save/flag, skip, or fetch again). */
    outcomes(): Map<string, ItemOutcome> {
        const failedRefs = new Set(this.tasks.flatMap((t) => t.itemErrors.flatMap((i) => i.sourceRefs)));
        const result = new Map<string, ItemOutcome>();
        for (const ref of this.#sourceByRef.keys()) {
            result.set(ref, this.#aborted ? 'retry' : failedRefs.has(ref) ? 'error' : 'done');
        }
        return result;
    }
}
