import { llm } from '../llm';
import { z } from 'zod/v4';
import { emitTelemetryEvent, EventScope, EventLevel } from '#bs/utils/telemetry/event';

const outputSchema = z.object({
    result: z.boolean().describe("True if the text matches the filter criteria, false otherwise")
});

/**
 * Evaluates the given text against a specified LLM filter record criteria.
 * The filter record's prompt is injected into a system wrapper enforcing a boolean JSON response.
 */
export const llmFilter = async (filterRecord: any, text: string): Promise<boolean> => {
    if (!filterRecord?.prompt || !text?.trim()) {
        return false;
    }

    const prompt = `You are a precise content filtering assistant.
Your task is to analyze the provided text against the following filter criteria.

Filter Criteria:
"${filterRecord.prompt}"

Text to Analyze:
"${text}"

Instruction: Determine if the text matches the Filter Criteria. You must respond only in JSON format containing a single boolean field 'result'. Set 'result' to true if the text matches the criteria, and false otherwise.`;

    try {
        const structuredLlm = llm.withStructuredOutput(outputSchema, {
            method: "jsonSchema",
        });
        const response = await structuredLlm.invoke(prompt);
        return !!response?.result;
    } catch (error: any) {
        await emitTelemetryEvent({
            scope: EventScope.SYSTEM,
            level: EventLevel.ERROR,
            label: 'LLM',
            message: `Filter evaluation failed: ${error?.message || error}`
        });
        return false;
    }
};

export default llmFilter;
