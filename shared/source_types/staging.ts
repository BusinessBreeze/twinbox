import { z } from 'zod';
import { EMAIL_MIME } from '../utils/automation_tasks';
import type { SourceType } from '../types/sources';

// Built in (one per user, created by the system), no config: the owner's staged emails
export const stagingType = {
    type: 'staging',
    version: 1,
    title: 'sources.types.staging.title',
    pollable: false,
    builtin: true,
    defaultName: 'Staging',
    itemMime: EMAIL_MIME,
    secretKeys: [],
    configSchema: z.object({}).passthrough(),
} satisfies SourceType;
