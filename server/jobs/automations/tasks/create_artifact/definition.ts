import { z } from 'zod';
import { zodRule, type TaskDefinition } from '../types';
import { EMAIL_MIME } from '../items';
import { limits } from '#shared/limits';

export const createArtifactDefinition: TaskDefinition = {
    type: 'create_artifact',
    version: 1,
    title: 'automation.tasks.create_artifact.title',
    inputs: { min: 1, max: null, accepts: [EMAIL_MIME, 'text/*'] },
    output: { mime: 'text/markdown' },
    summaryArg: 'prompt',
    args: [
        {
            key: 'prompt',
            title: 'automation.tasks.create_artifact.args.prompt',
            set_type: 'prompt',
            rules: [zodRule(z.string().trim().min(1, 'table.automation.rules.tasks.prompt.required').max(limits.llm.max_prompt_chars, 'table.automation.rules.tasks.prompt.too_long'))],
            opts: { max_chars: limits.llm.max_prompt_chars },
            default: '',
        },
    ],
};
