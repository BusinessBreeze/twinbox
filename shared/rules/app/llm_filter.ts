import { z } from 'zod';

export const zod_rules = {
  name: z.string({
    errorMap: () => ({ message: "rules.llm_filter.name.invalid" })
  }).min(1, "rules.llm_filter.name.min").max(100, "rules.llm_filter.name.max"),

  prompt: z.string({
    errorMap: () => ({ message: "rules.llm_filter.prompt.invalid" })
  }).min(1, "rules.llm_filter.prompt.min"),

  description: z.string({
    errorMap: () => ({ message: "rules.llm_filter.description.invalid" })
  }).min(1, "rules.llm_filter.description.min").max(500, "rules.llm_filter.description.max")
};
