// Storage usage of a user: bytes and counts per category, and the quota over all files (limits.files.max_user_mb).
// Totals only; the storage page shows them.
import { db } from 'hub:db';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { artifacts, emails, files } from '#server/db/schema';
import { emailRecordSize } from '#server/db/email_content';
import { limits } from '#shared/limits';

const count = sql<number>`count(*)`;

export const storageService = {
    /** Emails (record: text and structure), attachments and artifacts (files), and the quota over all files. */
    async usage(ownerId: string) {
        const mail = await db.select({ bytes: sql<number>`coalesce(sum(${emailRecordSize}), 0)`, count }).from(emails)
            .where(eq(emails.owner_id, ownerId)).get();
        const all = await db.select({ bytes: sql<number>`coalesce(sum(${files.size}), 0)`, count }).from(files)
            .where(eq(files.owner_id, ownerId)).get();
        // A file an artifact uses counts as artifact; every other file of the owner is an attachment
        const ofArtifacts = db.select({ id: artifacts.file_id }).from(artifacts).where(eq(artifacts.owner_id, ownerId));
        const art = await db.select({ bytes: sql<number>`coalesce(sum(${files.size}), 0)`, count }).from(files)
            .where(and(eq(files.owner_id, ownerId), inArray(files.id, ofArtifacts))).get();

        const n = (v: unknown) => Number(v ?? 0);
        return {
            emails: { bytes: n(mail?.bytes), count: n(mail?.count) },
            attachments: { bytes: n(all?.bytes) - n(art?.bytes), count: n(all?.count) - n(art?.count) },
            artifacts: { bytes: n(art?.bytes), count: n(art?.count) },
            files: { bytes: n(all?.bytes), limit_bytes: limits.files.max_user_mb * 1024 * 1024 },
        };
    },
};
