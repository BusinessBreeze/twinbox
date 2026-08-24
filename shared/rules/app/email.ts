import { z } from 'zod';

export const zod_rules = {
  from: z.string({ error: () => "rules.email.from.type" })
    .email("rules.email.from.invalid"),

  to: z.string({ error: () => "rules.email.to.type" })
    .email("rules.email.to.invalid"),

  subject: z.string({ error: () => "rules.email.subject.type" })
    .max(255, "rules.email.subject.too_long")
    .optional(),

  text: z.string({ error: () => "rules.email.text.type" }),

  html: z.string({ error: () => "rules.email.html.type" })
    .optional(),

  date: z.string({ error: () => "rules.email.date.type" }),
};
