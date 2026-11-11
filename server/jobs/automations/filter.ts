// LLM filter on the source side. Decides which fetched items enter the task pipeline.
// Replaces the llm_filters library: the prompt is stored on the automation (options.filter_prompt).
//
// - LLM unreachable / timeout: throws. The caller skips the run (nothing saved, checkpoint unchanged)
//   and the next poll retries, same as an outage inside a task.
// - The model's answer for one item is unusable, or the item is too long: the item passes (fail open).
//   Processing one email too many is better than silently missing one.
import { z } from 'zod/v4';
import { OutputParserException } from '@langchain/core/output_parsers';
import { llm, limits, emitTelemetryEvent, EventScope, EventLevel } from './deps';
import { itemToText, type TaskItem } from './tasks';
import { filterPrompt } from './prompts';


const outputSchema = z.object({
    result: z.boolean().describe('True if the text matches the filter criteria, false otherwise'),
});

/** Returns the items that match the filter prompt; all items when there is no prompt. */
export const filterItems = async (prompt: string | undefined, items: TaskItem[]): Promise<TaskItem[]> => {
    const criteria = prompt?.trim();
    if (!criteria || items.length === 0) return items;

    const structuredLlm = llm.withStructuredOutput(outputSchema, { method: 'jsonSchema' });
    const passed: TaskItem[] = [];

    for (const item of items) {
        // A long email is judged on its beginning (subject, sender and the first part of the body)
        const text = itemToText(item).slice(0, limits.llm.max_input_chars);

        try {
            const response = await structuredLlm.invoke(filterPrompt(criteria, text));
            if (response?.result) passed.push(item);
        } catch (err) {
            if (!(err instanceof OutputParserException)) throw err;   // outage: abort, retry next poll
            await passUnjudged(item, 'the model returned no usable answer');
            passed.push(item);
        }
    }

    return passed;
};

const passUnjudged = (item: TaskItem, reason: string) => emitTelemetryEvent({
    scope: EventScope.SYSTEM,
    level: EventLevel.WARN,
    category: 'automation',
    message: `Filter could not judge "${item.label}", passing it on: ${reason}`,
    metadata: { sourceRefs: item.sourceRefs }
});
