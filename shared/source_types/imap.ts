import { z } from 'zod';
import { EMAIL_MIME } from '../utils/automation_tasks';
import type { SourceType } from '../types/sources';

// Messages of the connection fields (table.sources.rules.config.<field>.<issue>)
const C = 'table.sources.rules.config';

export const imapType = {
    type: 'imap',
    version: 1,
    title: 'sources.types.imap.title',
    pollable: true,
    builtin: false,
    itemMime: EMAIL_MIME,
    secretKeys: ['credential'],
    configSchema: z.object({
        host: z.string({ errorMap: () => ({ message: `${C}.host.required` }) }).trim().min(1, `${C}.host.required`).max(253, `${C}.host.invalid`)
            .regex(/^[A-Za-z0-9.-]+$|^\[[0-9A-Fa-f:.]+\]$/, `${C}.host.invalid`),
        port: z.union([z.number(), z.string().trim().regex(/^\d+$/, `${C}.port.invalid`)], { errorMap: () => ({ message: `${C}.port.invalid` }) })
            .transform(Number).pipe(z.number().int().min(1, `${C}.port.invalid`).max(65535, `${C}.port.invalid`)),
        use_ssl: z.union([z.boolean(), z.literal(0), z.literal(1)], { errorMap: () => ({ message: `${C}.use_ssl.invalid` }) })
            .transform((v) => v === true || v === 1),
        username: z.string({ errorMap: () => ({ message: `${C}.username.required` }) }).trim().min(1, `${C}.username.required`),
        auth_type: z.enum(['login', 'oauth'], { errorMap: () => ({ message: `${C}.auth_type.invalid` }) }).default('login'),
        credential: z.string({ errorMap: () => ({ message: `${C}.credential.required` }) }).min(1, `${C}.credential.required`),
    }),
} satisfies SourceType;

/** Name of a saved search (the searches editor and the server's settings check). */
export const searchName = z.string({ errorMap: () => ({ message: 'sources.searches.name_required' }) })
    .trim().min(1, 'sources.searches.name_required');
