// Public API of the task module.
// Code outside tasks/ imports only from here. Everything the task module needs from outside
// comes from ../deps.

// Running tasks
export { runTasks, type RunTasksOptions } from './runner';
export { PipelineRun, type ItemOutcome } from './pipeline_run';

// Definitions and validation (chooser API, save validation)
export { listTaskDefinitions, getTaskDefinition, validateTasks } from './registry';

// Data shapes shared with sources
export {
    SOURCE_INPUT,
    type TaskItem,
    type EmailContent,
    type TaskInstance,
    type TaskDefinition,
    type TaskArg,
    type TaskContext,
} from './types';
export { EMAIL_MIME, isTextMime, itemToText } from './items';
