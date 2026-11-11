import { llm, limits, emitTelemetryEvent, EventScope, EventLevel } from '../../deps';
import { BaseTask } from '../base_task';
import { recordIssue } from '../../record';
import { ItemError, type TaskItem, type TaskOutput } from '../types';
import { itemsToText } from '../items';
import { createArtifactDefinition } from './definition';
import { artifactPrompt } from '../../prompts';
import { cleanOutput } from './clean';


export default class CreateArtifactTask extends BaseTask {
    static definition = createArtifactDefinition;

    protected async execute(inputs: TaskItem[]): Promise<TaskOutput | null> {
        const instruction = String(this.args.prompt || '').trim();
        // Long input is cut to what the model accepts
        const text = itemsToText(inputs).slice(0, limits.llm.max_input_chars);
        if (!instruction || !text.trim()) return null;

        // Connection errors and timeouts propagate: the run is aborted and retried later.
        const response = await llm.invoke(artifactPrompt(instruction, text));
        const raw = typeof response.content === 'string' ? response.content : String(response.content);
        // Whatever the email told the model: no images, HTML or links that weren't in the input (./clean.ts)
        const content = cleanOutput(raw, text);
        if (!content.trim()) throw new ItemError('The model returned an empty response');
        // Cut off (the prompt and the answer filled the model's context): kept, with a warning in the user's log
        if (response.response_metadata?.finish_reason === 'length') {
            await recordIssue(this.ctx.automationId, 'warn');
            await emitTelemetryEvent({
                scope: EventScope.USER, level: EventLevel.WARN, category: 'automation',
                message: 'events.user.warn_llm_answer_cut', owner_id: this.ctx.ownerId,
                metadata: { id: this.ctx.automationId, name: this.ctx.automationName, task: this.label },
            });
        }

        return { content };
    }
}
