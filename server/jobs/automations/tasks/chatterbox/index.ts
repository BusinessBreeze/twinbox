import { generateTTS } from '../../deps';
import { BaseTask } from '../base_task';
import type { TaskItem, TaskOutput } from '../types';
import { itemsToText } from '../items';
import { chatterboxDefinition } from './definition';

export default class ChatterboxTask extends BaseTask {
    static definition = chatterboxDefinition;

    protected async execute(inputs: TaskItem[]): Promise<TaskOutput | null> {
        const text = itemsToText(inputs);
        if (!text.trim()) return null;

        const audio = await generateTTS(text);
        if (audio.byteLength === 0) return null;

        return { content: Buffer.from(audio).toString('base64') };
    }
}
