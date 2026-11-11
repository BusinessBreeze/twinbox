import { z } from 'zod';

export const zod_rules = {
  from: z.string({ invalid_type_error: "table.email.rules.from.type", required_error: "table.email.rules.from.required" })
    .email("table.email.rules.from.invalid"),

  to: z.string({ invalid_type_error: "table.email.rules.to.type", required_error: "table.email.rules.to.required" })
    .email("table.email.rules.to.invalid"),

  subject: z.string({ invalid_type_error: "table.email.rules.subject.type" })
    .max(255, "table.email.rules.subject.too_long")
    .optional(),

  text: z.string({ invalid_type_error: "table.email.rules.text.type", required_error: "table.email.rules.text.required" }),

  date: z.string({ invalid_type_error: "table.email.rules.date.type", required_error: "table.email.rules.date.required" }),

  staging_item: z.union([z.literal(0), z.literal(1)], {
    errorMap: () => ({ message: "table.email.rules.staging_item.type" })
  }).optional(),
};
