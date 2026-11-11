// Staging source: the emails the user marked as staging (emails.staging_item = 1), to try automations on known mail.
// Built in (one per user, created lazily), not pollable: it runs on demand ("run now"). Every run processes all
// staged emails again; they are already stored, there is no checkpoint and no mail server to flag them on.
// Its only key is the source id (BaseSource default): there is nothing else to choose.
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { db, emails } from '../../deps';
import { BaseSource } from '../../base_source';
import { toEmailItem } from '../email/item';
import { pruneEmails, unownedEmails } from '../email/prune';
import { stagingType } from '#shared/source_types/staging';
import type { FetchResult, SourceDefinition } from '../../types';

// Staged emails are already stored and not on a mail server: no settings, no options of its own
export const stagingDefinition: SourceDefinition = {
    ...stagingType,
    settingsSchema: z.object({}).passthrough(),
    optionsSchema: z.object({}),
};

export default class StagingSource extends BaseSource {
    static definition = stagingDefinition;

    async fetch(keys: string[]): Promise<FetchResult> {
        const result: FetchResult = new Map();
        if (!keys.includes(this.id)) return result;
        const rows = await db.select().from(emails)
            .where(and(eq(emails.owner_id, this.ownerId), eq(emails.staging_item, 1)))
            .limit(this.maxItems);
        result.set(this.id, rows.map((row) => toEmailItem(row.messageId || row.id, row)));
        return result;
    }

    async complete(): Promise<void> {}

    /** Staging downloads nothing; it prunes the emails no source owns (imports). Staged emails are kept. */
    override async prune(): Promise<number> {
        return await pruneEmails(unownedEmails(this.ownerId), this.pruneLimits);
    }
}
