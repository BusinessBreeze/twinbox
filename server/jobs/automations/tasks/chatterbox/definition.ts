import type { TaskDefinition } from '../types';
import { EMAIL_MIME } from '../items';

export const chatterboxDefinition: TaskDefinition = {
    type: 'chatterbox',
    version: 1,
    title: 'automation.tasks.chatterbox.title',
    inputs: { min: 1, max: 1, accepts: [EMAIL_MIME, 'text/*'] },
    output: { mime: 'audio/mpeg' },
    args: [],   // no settings today; a voice would be { key: 'voice', set_type: 'enum', enum_values: [...] }
};
