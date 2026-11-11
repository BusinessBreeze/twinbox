import { z } from 'zod';
import { zodRule, type TaskDefinition } from '../types';

export const notificationDefinition: TaskDefinition = {
    type: 'notification',
    version: 1,
    title: 'automation.tasks.notification.title',
    inputs: { min: 1, max: null, accepts: ['*'] },
    output: null,
    summaryArg: 'destination',
    args: [
        {
            key: 'destination',
            title: 'automation.tasks.notification.args.destination',
            set_type: 'channel',
            rules: [zodRule(z.string().min(1, 'table.automation.rules.tasks.destination.required'))],
        },
        {
            key: 'keep_threadid',
            title: 'automation.tasks.notification.args.keep_threadid',
            set_type: 'boolean',
            default: false,
        },
    ],
};
