// Task runner.
// Creates one task object per configured task, runs them in order over the source items and returns the run.
//
// Failure handling (inside BaseTask.process):
// - ItemError: those inputs become an error notice that later tasks pass through
//   and delivery tasks send to the user. The run continues.
// - Any other error: the task ends 'failed' and the run stops. Every source item gets outcome
//   'retry', and the source must not save, flag or advance its checkpoint.
import { emitTelemetryEvent, EventScope, EventLevel } from '../deps';
import { getTaskClass } from './registry';
import { PipelineRun, InputUnavailableError } from './pipeline_run';
import type { TaskContext, TaskInstance, TaskItem } from './types';

export interface RunTasksOptions {
    tasks: TaskInstance[];
    source: TaskItem[];
    ctx: TaskContext;
}

export const runTasks = async ({ tasks, source, ctx }: RunTasksOptions): Promise<PipelineRun> => {
    const run = new PipelineRun(source);
    if (source.length === 0) return run;

    for (const instance of tasks) {
        // A stored task whose type is no longer registered (removed, renamed, imported). Never throw here:
        // that would count as an outage and retry forever. Tasks depending on it are skipped as missing inputs.
        const TaskCls = getTaskClass(instance.type);
        if (!TaskCls) {
            await warn(ctx, instance.id, `Task "${instance.label}" has unknown type "${instance.type}", skipped`);
            continue;
        }

        const task = new TaskCls(instance, ctx);
        run.add(task);

        let inputs: TaskItem[];
        try {
            inputs = task.inputIds.flatMap((id) => run.getInput(id));
        } catch (err) {
            if (!(err instanceof InputUnavailableError)) throw err;
            task.skip(err.message);
            await warn(ctx, task.id, `Task "${task.label}" skipped: ${err.message}`);
            continue;
        }

        await task.process(run, inputs);

        if (task.status === 'failed') {
            run.abort(task.error!);
            await emitTelemetryEvent({
                scope: EventScope.SYSTEM,
                level: EventLevel.ERROR,
                category: 'automation',
                message: `Task "${task.label}" (${task.type}) failed in ${ctx.automationName}, run will be retried: ${task.error?.message}`,
                metadata: { automationId: ctx.automationId, taskId: task.id, error: String(task.error) }
            });
            break;
        }
    }

    return run;
};

const warn = (ctx: TaskContext, taskId: string, message: string) => emitTelemetryEvent({
    scope: EventScope.SYSTEM,
    level: EventLevel.WARN,
    category: 'automation',
    message: `${message} (${ctx.automationName})`,
    metadata: { automationId: ctx.automationId, taskId }
});
