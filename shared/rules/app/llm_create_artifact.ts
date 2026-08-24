import { z } from 'zod';

export const zod_rules = {
  name: z.string({
    errorMap: () => ({ message: "rules.llm_create_artifact.name.invalid" })
  }).min(1, "rules.llm_create_artifact.name.min").max(100, "rules.llm_create_artifact.name.max"),

  prompt: z.string({
    errorMap: () => ({ message: "rules.llm_create_artifact.prompt.invalid" })
  }).min(1, "rules.llm_create_artifact.prompt.min"),

  description: z.string({
    errorMap: () => ({ message: "rules.llm_create_artifact.description.invalid" })
  }).min(1, "rules.llm_create_artifact.description.min").max(500, "rules.llm_create_artifact.description.max")
};
