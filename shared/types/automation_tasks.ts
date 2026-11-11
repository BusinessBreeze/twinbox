// Automation contract shared by the app (task chooser, automation form) and the server (automation engine).
// Stored shapes are derived from the zod schemas, so validation and types cannot disagree.
import type { z } from 'zod';
import type { taskInstanceSchema, automationOptionsSchema } from '../rules/app/automation';

/** One configured task, as stored in automations.tasks (after validation, defaults filled in). */
export type TaskInstance = z.infer<typeof taskInstanceSchema>;

/** Source-side settings, as stored in automations.options. */
export type AutomationOptions = z.infer<typeof automationOptionsSchema>;

/** One task argument as the chooser receives it: one widget, `required` instead of the server's rule functions. */
export interface TaskArgInfo {
    key: string;
    title: string;                                  // i18n key
    set_type: string;                               // widget: 'string_line' | 'boolean' | 'enum' | 'prompt' | 'channel' ...
    default?: unknown;
    enum_values?: string[];
    required?: boolean;
    opts?: { max_chars?: number };                  // options of the widget ('prompt': its character limit)
}

/** A task type as GET /api/v0.1/app/automation/tasks returns it. */
export interface TaskDefinitionInfo {
    type: string;
    version: number;
    title: string;                                  // i18n key
    inputs: { min: number; max: number | null; accepts: string[] };   // min/max count input references, not items; accepts = mime patterns
    output: { mime: string } | null;                // null = delivers instead of producing
    args: TaskArgInfo[];
    summaryArg?: string;                            // arg shown on the collapsed card
}
