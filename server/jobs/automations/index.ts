// Public API of the automation engine.
// Code outside jobs/automations imports only from here. What the engine needs from the rest of the app
// is listed in ./deps.ts.

// Source runs: the hooks the source layer calls (registered at boot in server/plugins/sources.ts)
export { runSource, subscribedKeys } from './run_source';

// Test runs (deliveries go to the local artifacts), and the prompt templates for code that writes into them (the drafter)
export { testRun, type TestRunResult } from './test_run';
export { filterPrompt, artifactPrompt, promptText, dataTag, fence, type PromptMessages } from './prompts';

// Task definitions and validation: chooser API (GET .../automation/tasks) and the automation service on save
export { listTaskDefinitions, getTaskDefinition, validateTasks } from './tasks';

// The stored task-list format (automations.tasks), for code that writes it: UI schemas, templates, import/export
export { SOURCE_INPUT, EMAIL_MIME, type TaskInstance, type TaskDefinition, type TaskArg } from './tasks';
