import { z } from 'zod';

export const zod_rules = {
  name: z.string({
    errorMap: () => ({ message: "rules.automation.name.invalid" })
  }).min(1, "rules.automation.name.min").max(100, "rules.automation.name.max"),

  active: z.union([z.boolean(), z.number()]).transform((val) => {
    if (typeof val === 'boolean') {
      return val ? 1 : 0;
    }
    return val === 1 ? 1 : 0;
  }).default(1),

  imap_connection_id: z.string({
    errorMap: () => ({ message: "rules.automation.imap_connection_id.invalid" })
  }).min(1, "rules.automation.imap_connection_id.required"),

  imap_folder: z.string({
    errorMap: () => ({ message: "rules.automation.imap_folder.invalid" })
  }).min(1, "rules.automation.imap_folder.required"),

  search_id: z.union([
    z.string(),
    z.null(),
    z.undefined()
  ]).transform(val => (val === '' ? null : val)).optional().nullable(),

  llm_filter_id: z.union([
    z.string(),
    z.null(),
    z.undefined()
  ]).transform(val => (val === '' ? null : val)).optional().nullable(),

  tasks: z.union([
    z.object({
      multiple: z.boolean(),
      tasks: z.array(z.object({
        name: z.string(),
        arguments: z.record(z.any())
      }))
    }),
    z.null()
  ], {
    errorMap: () => ({ message: "rules.automation.tasks.invalid" })
  }).optional()
    .transform(val => val ?? { multiple: false, tasks: [] })
    .default({ multiple: false, tasks: [] }),

  poll_seconds: z.union([
    z.number().int(),
    z.string().regex(/^\d+$/, "rules.automation.poll_seconds.invalid")
  ]).transform((val) => Number(val))
    .pipe(
      z.number().int().min(10, "rules.automation.poll_seconds.min")
    ).default(3600),

  last_uid: z.number().int().optional().nullable().default(0)
};
