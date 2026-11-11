import { z } from 'zod';
import { limits } from '../../limits';

// Generic fields of a source record. The type-specific config is validated by the type's shared configSchema
// (shared/source_types/), its settings by the server class.
/** A bound, or a function for one read from limits on each check (in the browser they are the server's, set at startup). */
type Bound = number | (() => number);
const bound = (b: Bound) => (typeof b === 'function' ? b() : b);

/** A whole number in [min, max], also as a string from the form; `messages.invalid` for anything else. */
const wholeNumber = (min: Bound, max: Bound, messages: { invalid: string; min: string; max?: string }) =>
  z.union([z.number().int(), z.string().trim().regex(/^\d+$/, messages.invalid)], { errorMap: () => ({ message: messages.invalid }) })
    .transform((val) => Number(val))
    .refine((n) => n >= bound(min), messages.min)
    .refine((n) => n <= bound(max), messages.max ?? messages.invalid)
    .optional();

export const zod_rules = {
  name: z.string({
    errorMap: () => ({ message: "table.sources.rules.name.invalid" })
  }).trim().min(1, "table.sources.rules.name.min").max(100, "table.sources.rules.name.max")
    .regex(/^[^\p{Cc}]*$/u, "table.sources.rules.name.control"),   // no control characters (a NUL would cut the stored name)

  type: z.string({
    errorMap: () => ({ message: "table.sources.rules.type.invalid" })
  }).min(1, "table.sources.rules.type.required"),

  poll_seconds: wholeNumber(() => limits.sources.min_poll_seconds, () => limits.sources.max_poll_seconds, {
    invalid: "table.sources.rules.poll_seconds.invalid",
    min: "table.sources.rules.poll_seconds.min",
    max: "table.sources.rules.poll_seconds.max",
  }),

  max_items_per_fetch: wholeNumber(1, () => limits.automation.max_emails_per_fetch, {
    invalid: "table.sources.rules.max_items_per_fetch.invalid",
    min: "table.sources.rules.max_items_per_fetch.min",
    max: "table.sources.rules.max_items_per_fetch.max",
  }),

  // Pruning of what the source downloaded; 0 = no limit of its own (the server caps them by the SOURCE_* env)
  retention_days: wholeNumber(0, 100_000, { invalid: "table.sources.rules.limits.invalid", min: "table.sources.rules.limits.invalid" }),
  max_items: wholeNumber(0, 10_000_000, { invalid: "table.sources.rules.limits.invalid", min: "table.sources.rules.limits.invalid" }),
  max_size_mb: wholeNumber(0, 10_000_000, { invalid: "table.sources.rules.limits.invalid", min: "table.sources.rules.limits.invalid" }),

  // Type-specific saved data (IMAP: named searches), validated by the type's settingsSchema
  settings: z.record(z.any(), {
    errorMap: () => ({ message: "table.sources.rules.settings.invalid" })
  }).optional(),
};
