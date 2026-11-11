import { z } from 'zod';
import { limits } from '../../limits';

const flag = z.union([z.boolean(), z.number()]).transform((val) => val === true || val === 1).optional();
/** A whole number from 0 (forms may send it as text, or empty for none). */
const count = (message: string) => z.union([z.number(), z.string().trim().regex(/^\d*$/, message)], { errorMap: () => ({ message }) })
  .transform((v) => (v === '' ? 0 : Number(v))).pipe(z.number().int(message).min(0, message).max(100000, message)).nullable().optional();

/** One configured task (stored in automations.tasks). Source of the TaskInstance type (shared/types). */
export const taskInstanceSchema = z.object({
  id: z.string().min(1),
  type: z.string().min(1),
  version: z.number().int().default(1),
  label: z.string().default(''),
  inputs: z.array(z.string()).default([]),
  args: z.record(z.any()).default({}),
  aggregate: z.boolean().optional(),
});

/**
 * Settings stored in automations.options. Only the engine's own options are known here (they work for every source);
 * the source type's options (IMAP: mark_read, mark_important) pass through and are checked by the type.
 * Booleans may arrive as 0/1 from forms.
 */
export const automationOptionsSchema = z.object({
  // The limit is read on each check: in the browser it is the server's (set at startup)
  filter_prompt: z.string().nullable().optional()
    .refine((v) => !v || v.length <= limits.llm.max_prompt_chars, "table.automation.rules.options.filter_prompt.too_long"),
  add_source_links: flag,
  // Retention of the artifacts this automation delivered to the local channel (0 or empty: keep all)
  artifact_keep_days: count("table.automation.rules.options.artifact_keep_days"),
  artifact_keep_last: count("table.automation.rules.options.artifact_keep_last"),
}, {
  errorMap: () => ({ message: "table.automation.rules.options.invalid" })
}).passthrough();

export const zod_rules = {
  name: z.string({
    errorMap: () => ({ message: "table.automation.rules.name.invalid" })
  }).trim().min(1, "table.automation.rules.name.min").max(100, "table.automation.rules.name.max")
    .regex(/^[^\p{Cc}]*$/u, "table.automation.rules.name.control"),   // no control characters (a NUL would cut the stored name)

  active: z.union([z.boolean(), z.literal(0), z.literal(1)], {
    errorMap: () => ({ message: "table.automation.rules.active.type" })
  }).transform((val) => {
    if (typeof val === 'boolean') {
      return val ? 1 : 0;
    }
    return val === 1 ? 1 : 0;
  }).default(1),

  // What the automation subscribes to; the source type decodes it (staging '<id>', IMAP '<id>:<folder>:<searchId>').
  // source_id is derived from it by the server.
  source_key: z.string({
    errorMap: () => ({ message: "table.automation.rules.source_key.invalid" })
  }).min(1, "table.automation.rules.source_key.required"),

  options: automationOptionsSchema.nullable().optional()
    .transform(val => val ?? {})
    .default({}),

  // The server also checks references, types and args with validateTasks().
  tasks: z.array(taskInstanceSchema, {
    errorMap: () => ({ message: "table.automation.rules.tasks.invalid" })
  }).nullable().optional()
    .transform(val => val ?? [])
    .default([])
};
