import { z } from 'zod';
import { limits } from '../../limits';

// Requests to the automation drafter (POST /api/v0.1/app/automation/draft), checked by the service and the dialog.
// Bounds are read from limits on each check (in the browser they are the server's, set at startup).
const text = (key: string) => z.string({ invalid_type_error: `automation_draft.rules.${key}.type` })
  .refine((v) => v.length <= limits.llm.max_prompt_chars, `automation_draft.rules.${key}.too_long`);

export const zod_rules = {
  // What should happen with emails like the staged ones (free text, may be empty)
  intent: text('intent').default(''),
  // The notification channel the drafted automation delivers to (one of the user's)
  channel_id: z.string({ errorMap: () => ({ message: 'automation_draft.rules.channel_id.required' }) })
    .min(1, 'automation_draft.rules.channel_id.required'),
  // The filter: by theme (what the emails are about) or none at all (every email of the source; narrowing it by exact
  // terms is the source's own search)
  match: z.enum(['theme', 'none'], { errorMap: () => ({ message: 'automation_draft.rules.match.invalid' }) }).default('theme'),
  // A single field instead of a whole automation, and what the user wrote in it so far
  target: z.enum(['automation', 'filter_prompt', 'task_prompt']).default('automation'),
  current: text('current').default(''),
};

export const automationDraftSchema = z.object({
  intent: zod_rules.intent,
  match: zod_rules.match,
  channel_id: zod_rules.channel_id,
});

export const textDraftSchema = z.object({
  target: z.enum(['filter_prompt', 'task_prompt']),
  intent: zod_rules.intent,
  current: zod_rules.current,
});
