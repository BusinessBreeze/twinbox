// Drafts the user-written parts of an automation (name, filter prompt, task prompt) with the LLM, from example items
// and what the user wants. The model sees the prompt templates its texts are inserted into (./prompt.ts).
import { z } from 'zod/v4';
import { OutputParserException } from '@langchain/core/output_parsers';
import { llm } from '#server/clients/llm';
import { limits } from '#shared/limits';
import { draftPrompt } from './prompt';

export interface DraftRequest {
    intent: string;                         // what should happen with items like the examples
    examples: string[];                     // the example items as text (already shortened)
    want: { name?: boolean; filterPrompt?: boolean; taskPrompt?: boolean };
    current?: string;                       // what the user already wrote in the field being drafted
}

export interface DraftResult { name?: string; filter_prompt?: string; task_prompt?: string }

/** The drafted texts; throws on an LLM outage or an unusable answer (reported to the user as a failed draft). */
export const draftTexts = async (req: DraftRequest): Promise<DraftResult> => {
    const want = { name: !!req.want.name, filterPrompt: !!req.want.filterPrompt, taskPrompt: !!req.want.taskPrompt };
    const schema = z.object({
        ...(want.name ? { name: z.string().describe('Short automation name') } : {}),
        ...(want.filterPrompt ? { filter_prompt: z.string().describe('Filter criteria') } : {}),
        ...(want.taskPrompt ? { task_prompt: z.string().describe('Instruction for processing each email') } : {}),
    });
    let answer: Record<string, unknown>;
    try {
        answer = await llm.withStructuredOutput(schema, { method: 'jsonSchema' })
            .invoke(draftPrompt({ intent: req.intent, examples: req.examples, want, current: req.current }));
    } catch (err) {
        if (err instanceof OutputParserException) throw new Error('the model returned no usable answer');
        throw err;
    }
    const text = (v: unknown, max: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : undefined);
    return {
        name: text(answer.name, 80),
        filter_prompt: text(answer.filter_prompt, limits.llm.max_prompt_chars),
        task_prompt: text(answer.task_prompt, limits.llm.max_prompt_chars),
    };
};
