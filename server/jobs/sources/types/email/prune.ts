// Pruning for the email-producing source types: deletes a source's stored emails beyond its limits, and the files of
// their attachments. Staged emails are kept while they are staged.
import { and, desc, eq, inArray, isNull, lt, ne, or, type SQL } from 'drizzle-orm';
import { db, emails, emailStoredSize, releaseEmailFiles } from '../../deps';
import type { PruneLimits } from '../../limits';

const DAY_MS = 24 * 60 * 60 * 1000;

const remove = async (where: SQL | undefined) => {
    const removed = await db.delete(emails).where(where).returning({ owner_id: emails.owner_id, content: emails.content });
    await releaseEmailFiles(removed);
    return removed.length;
};

/** Deletes emails matching `scope` (the source's own) beyond the limits; returns how many were deleted. */
export const pruneEmails = async (scope: SQL, limits: PruneLimits): Promise<number> => {
    const prunable = and(scope, or(isNull(emails.staging_item), ne(emails.staging_item, 1)));
    let deleted = 0;

    if (limits.retention_days > 0) {
        const cutoff = new Date(Date.now() - limits.retention_days * DAY_MS);
        deleted += await remove(and(prunable, lt(emails.createdAt, cutoff)));
    }

    if (limits.max_items > 0 || limits.max_size_mb > 0) {
        // Size: text, structure and stored attachments
        const rows = await db.select({ id: emails.id, size: emailStoredSize }).from(emails).where(prunable).orderBy(desc(emails.createdAt));
        const maxBytes = limits.max_size_mb * 1024 * 1024;
        let bytes = 0;
        let full = false;                                   // newest first: once a limit is reached, all older go
        const over: string[] = [];
        rows.forEach((row, index) => {
            const size = Number(row.size) || 0;
            if (!full && limits.max_items > 0 && index >= limits.max_items) full = true;
            if (!full && maxBytes > 0 && bytes + size > maxBytes) full = true;
            if (full) over.push(row.id);
            else bytes += size;
        });
        for (let i = 0; i < over.length; i += 500) {
            deleted += await remove(inArray(emails.id, over.slice(i, i + 500)));
        }
    }
    return deleted;
};

/** The emails a source downloaded itself. */
export const ownEmails = (ownerId: string, sourceId: string) => and(eq(emails.owner_id, ownerId), eq(emails.source_id, sourceId))!;

/** Emails no source downloaded (imports); the built-in staging source prunes them. */
export const unownedEmails = (ownerId: string) => and(eq(emails.owner_id, ownerId), isNull(emails.source_id))!;
