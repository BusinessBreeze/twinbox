import { db } from 'hub:db';
import { eq } from 'drizzle-orm';
import { llmCreateArtifacts } from '#server/db/schema';
import { llm } from '../llm';
import { emitTelemetryEvent, EventScope, EventLevel } from '#bs/utils/telemetry/event';

/**
 * Runs the LLM to generate an artifact based on the given artifact record and text.
 */
export const llmCreateArtifact = async (artifactRecord: any, text: string): Promise<string> => {
    let promptText = artifactRecord?.prompt;

    if (artifactRecord?.arguments?.task_id) {
        try {
            const [artDef] = await db
                .select()
                .from(llmCreateArtifacts)
                .where(eq(llmCreateArtifacts.id, artifactRecord.arguments.task_id))
                .limit(1);
            if (artDef) {
                promptText = artDef.prompt;
            }
        } catch (dbErr) {
            await emitTelemetryEvent({
                scope: EventScope.SYSTEM,
                level: EventLevel.ERROR,
                label: 'LLM',
                message: 'Failed to fetch LLM artifact definition'
            });
        }
    }

    if (!promptText || !text?.trim()) {
        return '';
    }

    const prompt = `You are a master text analyser.
Your task is to process the provided text based on the instruction.

Instruction:
"${promptText}"

Text to Process:
"${text}"

Format the response in .md (Markdown) only.`;

    try {
        const response = await llm.invoke(prompt);
        return typeof response.content === 'string' ? response.content : String(response.content);
    } catch (error: any) {
        await emitTelemetryEvent({
            scope: EventScope.SYSTEM,
            level: EventLevel.ERROR,
            label: 'LLM',
            message: `Artifact generation failed: ${error?.message || error}`
        });
        return '';
    }
};

export default llmCreateArtifact;
