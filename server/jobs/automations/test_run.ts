// A test run of one automation over given items (the staged emails): its filter, then its tasks, with every delivery
// written to the owner's local artifacts instead of the configured channels. Nothing is stored on the source.
import { filterItems } from './filter';
import { runTasks, type TaskInstance, type TaskItem } from './tasks';

export interface TestRunResult {
    total: number;              // items given
    passed: number;             // items the filter let through
    unjudged: number;           // items the filter could not judge (unusable model answer): not processed
    aborted: string | null;     // why the run stopped (a task failed), else null
}

export const testRun = async (automation: any, items: TaskItem[], lang: string): Promise<TestRunResult> => {
    const { passed, unjudged } = await filterItems(automation.options?.filter_prompt ?? undefined, items);
    const run = await runTasks({
        tasks: (automation.tasks || []) as TaskInstance[],
        source: passed,
        ctx: { ownerId: automation.owner_id, automationId: automation.id, automationName: automation.name, lang, deliverLocally: true },
    });
    return { total: items.length, passed: passed.length, unjudged: unjudged.length, aborted: run.aborted ? run.aborted.message : null };
};
