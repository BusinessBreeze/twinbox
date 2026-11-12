import { z } from 'zod';
import type { SourceDefinition } from '../../types';
import { imapType, searchName } from '#shared/source_types/imap';

// Form booleans may arrive as 0/1
const flag = z.union([z.boolean(), z.number()]).transform((v) => v === true || v === 1).optional();
// A folder path as the server lists it; no control characters (they'd end the IMAP command line)
const folderName = z.string().trim().max(500).regex(/^[^\p{Cc}]*$/u).nullable().optional().transform((v) => v || undefined);

export const imapDefinition: SourceDefinition = {
    ...imapType,
    // Named searches; a key picks a folder and optionally one of them: '<sourceId>:<folder>:<searchId>'.
    // Ids, unique names and the since date of new searches are the class's (normalizeSettings).
    settingsSchema: z.object({
        searches: z.array(z.object({
            id: z.string().optional(),              // generated once (s_xxxxxxxx), keys reference it
            name: searchName,
            search: z.any().optional(),             // IMAP search object (search builder)
        }).passthrough()).default([]),
        // Store attachments of this source's emails (only when the server allows them: limits.attachments.enabled)
        download_attachments: flag,
    }),
    // copy_to / move_to: a folder of the same account for the emails that passed the filter (empty = none)
    optionsSchema: z.object({ mark_read: flag, mark_important: flag, copy_to: folderName, move_to: folderName }),
};
