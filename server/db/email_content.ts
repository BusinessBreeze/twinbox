// The SQL view of emails.content: the only code outside the email service that reads its structure, so the JSON
// paths exist once. They must match shared/types/email.ts (MessageContent: parts[], embedded[].parts[], each part
// with status, size and file_id). Used by the file store, pruning and storage usage.
import { db } from 'hub:db';
import { sql } from 'drizzle-orm';
import { emails } from '#server/db/schema';

/** What an email record takes up in the database: its automation text and its structure (renditions included). */
export const emailRecordSize = sql<number>`coalesce(length(${emails.text}), 0) + coalesce(length(${emails.content}), 0)`;

/** What an email takes up in all: its record plus its stored attachments (the files, by their size). */
export const emailStoredSize = sql<number>`${emailRecordSize} + coalesce((
    SELECT sum(json_extract(p.value, '$.size')) FROM json_each(${emails.content}, '$.parts') p
    WHERE json_extract(p.value, '$.status') = 'stored'), 0)`;

/** How many attachments an email has: parts sent as attachment, its own and its forwarded messages'. */
export const emailAttachmentCount = sql<number>`(
    SELECT count(*) FROM json_each(${emails.content}, '$.parts') p WHERE json_extract(p.value, '$.disposition') = 'attachment'
) + coalesce((
    SELECT count(*) FROM json_each(${emails.content}, '$.embedded') m, json_each(m.value, '$.parts') p
    WHERE json_extract(p.value, '$.disposition') = 'attachment'), 0)`;

/** Of these file ids, the ones an email part references: an email's own parts or its forwarded messages' parts. */
export const fileIdsReferencedByEmails = async (fileIds: string[]): Promise<string[]> => {
    if (fileIds.length === 0) return [];
    const list = sql.join(fileIds.map((id) => sql`${id}`), sql`, `);
    const rows = await db.all<{ id: string }>(sql`
        SELECT json_extract(p.value, '$.file_id') AS id FROM ${emails} e, json_each(e.content, '$.parts') p
        WHERE json_extract(p.value, '$.file_id') IN (${list})
        UNION
        SELECT json_extract(p.value, '$.file_id') FROM ${emails} e, json_each(e.content, '$.embedded') m, json_each(m.value, '$.parts') p
        WHERE json_extract(p.value, '$.file_id') IN (${list})`);
    return rows.map((r) => r.id);
};
