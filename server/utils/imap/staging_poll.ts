import { db } from "hub:db";
import { emails } from "#server/db/schema";
import { eq, and } from "drizzle-orm";
import { emitTelemetryEvent, EventScope, EventLevel } from '#bs/utils/telemetry/event';
import appDefaults from '#server/metadata/app_defaults.json';

/**
 * Polls staged emails directly from the local database for the given owner.
 * Only supports INBOX and does not implement markRead.
 */
export const pollStaging = async (
    record: any,
    searchCriteria?: any,
    folder: string = 'INBOX',
    markRead: boolean = false,
    maxEmails: number = appDefaults.limits?.automation?.max_emails_per_fetch || 50,
    maxBytes: number = appDefaults.limits?.automation?.max_input_text_length || 15000,
    lastUid: number = 0
) => {
    const ownerId = record?.owner_id;
    if (!ownerId) {
        await emitTelemetryEvent({
            scope: EventScope.SYSTEM,
            level: EventLevel.WARN,
            category: 'imap',
            message: 'Staging poll failed: missing owner_id on record'
        });
        return [];
    }

    await emitTelemetryEvent({
        scope: EventScope.SYSTEM,
        level: EventLevel.DEBUG,
        category: 'imap',
        message: `Polling staging emails from DB (folder: ${folder}) for owner ${ownerId}`,
        metadata: { folder, maxEmails, maxBytes }
    });

    try {
        const rows = await db
            .select()
            .from(emails)
            .where(
                and(
                    eq(emails.owner_id, ownerId),
                    eq(emails.staging_item, 1)
                )
            )
            .limit(maxEmails);

        await emitTelemetryEvent({
            scope: EventScope.SYSTEM,
            level: EventLevel.DEBUG,
            category: 'imap',
            message: `Retrieved ${rows.length} staging emails from DB`
        });

        const results: any[] = [];
        for (const item of rows) {
            results.push({
                id: item.id,
                messageId: item.messageId,
                from: item.from,
                to: item.to,
                replyTo: item.from,
                inReplyTo: '',
                references: '',
                subject: item.subject || '(No Subject)',
                text: (item.text || '').slice(0, maxBytes),
                html: item.html || '',
                date: item.date ? new Date(item.date) : (item.createdAt || new Date()),
                source: item.text || '',
                isStaging: true,
                staging_item: item.staging_item
            });
        }

        return results;
    } catch (err: any) {
        await emitTelemetryEvent({
            scope: EventScope.SYSTEM,
            level: EventLevel.ERROR,
            category: 'imap',
            message: `Staging poll failed: ${err?.message || String(err)}`,
            metadata: { error: String(err) }
        });
        return [];
    }
};

export default pollStaging;
