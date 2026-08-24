import { z } from 'zod';

export const zod_rules = {
  name: z.string({
    errorMap: () => ({ message: "rules.imap_search.name.invalid" })
  }).min(1, "rules.imap_search.name.min").max(100, "rules.imap_search.name.max"),

  search: z.union([
    z.string(),
    z.array(z.string()),
    z.record(z.any())
  ], {
    errorMap: () => ({ message: "rules.imap_search.search.invalid" })
  }).optional()
};
