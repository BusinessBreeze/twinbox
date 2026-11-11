// Task registry singleton.
// Holds task classes (not instances): the runner creates one object per task per run.
// Filled by static imports, so it is complete as soon as anything imports this module.
// Adding a task type = new folder + one line below.
import CreateArtifactTask from './create_artifact';
import ChatterboxTask from './chatterbox';
import NotificationTask from './notification';
import { mimeMatches } from './items';
import type { TaskClass } from './base_task';
import { SOURCE_INPUT, type TaskDefinition, type TaskInstance } from './types';

const registry = new Map<string, TaskClass>();

for (const TaskCls of [CreateArtifactTask, ChatterboxTask, NotificationTask] as TaskClass[]) {
    const type = TaskCls.definition?.type;
    if (!type) throw new Error(`Task class ${TaskCls.name} has no static definition`);
    if (registry.has(type)) throw new Error(`Duplicate task type registered: ${type}`);
    registry.set(type, TaskCls);
}

export const getTaskClass = (type: string): TaskClass | undefined => registry.get(type);

export const getTaskDefinition = (type: string): TaskDefinition | undefined => registry.get(type)?.definition;

/** What the task chooser needs. */
export const listTaskDefinitions = (): TaskDefinition[] => [...registry.values()].map((c) => c.definition);

/** Mime type a configured task feeds to later tasks; the source mime for SOURCE_INPUT. */
const outputMimeOf = (inputId: string, tasks: TaskInstance[], sourceMime: string | null): string | null => {
    if (inputId === SOURCE_INPUT) return sourceMime;
    const producer = tasks.find((t) => t.id === inputId);
    return producer ? getTaskDefinition(producer.type)?.output?.mime ?? null : null;
};

/**
 * Generic checks for an automation's task list. Returns error keys per task id (empty = valid).
 * Used by the server on save and by the chooser for instant feedback.
 */
export const validateTasks = (tasks: TaskInstance[], sourceMime: string | null): Record<string, string[]> => {
    const errors: Record<string, string[]> = {};
    const seen = new Set<string>();
    const labels = new Set<string>();

    tasks.forEach((task, index) => {
        const list: string[] = [];
        const def = getTaskDefinition(task.type);

        if (!task.id || seen.has(task.id)) list.push('table.automation.rules.tasks.id.duplicate');
        seen.add(task.id);

        // Labels name the outputs (files, message sections): required and unique (case-insensitive). The browser
        // picks a free name; the server only refuses.
        const label = typeof task.label === 'string' ? task.label.trim().toLowerCase() : '';
        if (!label) list.push('table.automation.rules.tasks.label.required');
        else if (labels.has(label)) list.push('table.automation.rules.tasks.label.duplicate');
        labels.add(label);

        if (!def) {
            errors[task.id] = [...list, 'table.automation.rules.tasks.type.unknown'];
            return;
        }

        const earlierIds = new Set(tasks.slice(0, index).map((t) => t.id));
        const { min, max, accepts } = def.inputs;
        if (task.inputs.length < min) list.push('table.automation.rules.tasks.inputs.too_few');
        if (max !== null && task.inputs.length > max) list.push('table.automation.rules.tasks.inputs.too_many');

        for (const inputId of task.inputs) {
            if (inputId !== SOURCE_INPUT && !earlierIds.has(inputId)) {
                list.push('table.automation.rules.tasks.inputs.not_found');
                continue;
            }
            if (inputId === SOURCE_INPUT && !sourceMime) continue;   // source unknown (deleted): nothing to check against
            const mime = outputMimeOf(inputId, tasks, sourceMime);
            if (!mime) list.push('table.automation.rules.tasks.inputs.no_output');
            else if (!mimeMatches(mime, accepts)) list.push('table.automation.rules.tasks.inputs.wrong_type');
        }

        for (const arg of def.args) {
            for (const rule of arg.rules || []) {
                const res = rule(task.args?.[arg.key] ?? arg.default);
                if (res !== true) list.push(res);
            }
        }

        if (list.length > 0) errors[task.id] = list;
    });

    return errors;
};
