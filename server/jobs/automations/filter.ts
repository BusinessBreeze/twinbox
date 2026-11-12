// LLM filter on the source side. Decides which fetched items enter the task pipeline.
// Replaces the llm_filters library: the prompt is stored on the automation (options.filter_prompt).
//
// - LLM unreachable / timeout: throws. The caller skips the run (nothing saved, checkpoint unchanged)
//   and the next poll retries, same as an outage inside a task.
// - The model's answer for one item is unusable (not the JSON { result: boolean }: prose, broken or cut-off JSON, a
//   missing or wrong field, an empty answer, a refusal): the item is NOT processed (fail closed) and handed back as
//   unjudged; the run reports it as an error with a link to the email. A wrong "yes" could move or notify; a reported
//   "don't know" can't.
import { z } from 'zod/v4';
import { OutputParserException } from '@langchain/core/output_parsers';
import { llm, limits } from './deps';
import { itemToText, type TaskItem } from './tasks';
import { filterPrompt } from './prompts';


const outputSchema = z.object({
    result: z.boolean().describe('True if the text matches the filter criteria, false otherwise'),
});

export interface FilterResult {
    passed: TaskItem[];         // matched (all items when there is no prompt)
    unjudged: TaskItem[];       // the model's answer was unusable: not processed, to be reported
}

/** Splits the items by the filter prompt: matched, and unjudged (unusable answer). */
export const filterItems = async (prompt: string | undefined, items: TaskItem[]): Promise<FilterResult> => {
    const criteria = prompt?.trim();
    if (!criteria || items.length === 0) return { passed: items, unjudged: [] };

    const structuredLlm = llm.withStructuredOutput(outputSchema, { method: 'jsonSchema' });
    const passed: TaskItem[] = [];
    const unjudged: TaskItem[] = [];

    for (const item of items) {
        // A long email is judged on its beginning (subject, sender and the first part of the body)
        const text = itemToText(item).slice(0, limits.llm.max_input_chars);

        try {
            const response = await structuredLlm.invoke(filterPrompt(criteria, text));
            if (response?.result) passed.push(item);
        } catch (err) {
            if (!(err instanceof OutputParserException)) throw err;   // outage: this automation stops for this run
            unjudged.push(item);
        }
    }

    return { passed, unjudged };
};
