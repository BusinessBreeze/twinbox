import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { resolveRelativeSearchDates } from './resolve_relative_search_dates';
import { emitTelemetryEvent, EventScope, EventLevel } from '#bs/utils/telemetry/event';

import appDefaults from '#server/metadata/app_defaults.json';

/**
 * Polls the provided list of IMAP connection records, connects using ImapFlow,
 * and retrieves emails from the specified folder.
 * Option markRead determines if fetched emails will be marked as Seen (\Seen).
 */
export const poll = async (
    record: any, 
    searchCriteria?: any, 
    folder?: string, 
    markRead: boolean = false,
    maxEmails: number = appDefaults.limits?.automation?.max_emails_per_fetch || 50,
    maxBytes: number = appDefaults.limits?.automation?.max_input_text_length || 15000
) => {
    const emails: any[] = [];

    if (!folder) {
        await emitTelemetryEvent({
            scope: EventScope.SYSTEM,
            level: EventLevel.WARN,
            category: 'imap',
            message: `No folder specified: ${record.tag || record.id}`
        });
        return emails;
    }

    await emitTelemetryEvent({
        scope: EventScope.SYSTEM,
        level: EventLevel.DEBUG,
        category: 'imap',
        message: `Connecting: ${record.tag || record.host}`,
        metadata: { host: record.host, user: record.username, markRead, maxEmails, maxBytes }
    });

    const client = new ImapFlow({
        host: record.host,
        port: record.port,
        secure: record.use_ssl === 1,
        auth: {
            user: record.username,
            pass: record.auth_type === 'login' ? record.config?.credential : undefined,
            accessToken: record.auth_type === 'oauth' ? record.config?.credential : undefined,
        },
        connectionTimeout: 10000,
        greetingTimeout: 20000,
        logger: false
    });

    try {
        await client.connect();

        const list = await client.list();
        const folderExists = list.some(mailbox => mailbox.path === folder);
        if (!folderExists) {
            await emitTelemetryEvent({
                scope: EventScope.SYSTEM,
                level: EventLevel.ERROR,
                category: 'imap',
                message: `Folder missing: ${folder}`,
                metadata: { available: list.map(m => m.path) }
            });
            await client.logout();
            return emails;
        }

        const lock = await client.getMailboxLock(folder);
        try {
            const count = client.mailbox?.exists || 0;
            await emitTelemetryEvent({
                scope: EventScope.SYSTEM,
                level: EventLevel.DEBUG,
                category: 'imap',
                message: `Connected (${folder}): ${count} emails`
            });

            if (count > 0) {
                let fetchRange: any = '1:*';
                let shouldFetch = true;

                if (searchCriteria) {
                    let parsedSearch = searchCriteria;
                    if (typeof searchCriteria === 'string') {
                        try {
                            parsedSearch = JSON.parse(searchCriteria);
                        } catch (e) {
                            await emitTelemetryEvent({
                                scope: EventScope.SYSTEM,
                                level: EventLevel.ERROR,
                                category: 'imap',
                                message: `Search parse failed`,
                                metadata: { error: String(e) }
                            });
                        }
                    }
                    parsedSearch = resolveRelativeSearchDates(parsedSearch);
                    await emitTelemetryEvent({
                        scope: EventScope.SYSTEM,
                        level: EventLevel.DEBUG,
                        category: 'imap',
                        message: `Searching criteria`,
                        metadata: { criteria: parsedSearch }
                    });
                    const searchResults = await client.search(parsedSearch);
                    if (searchResults.length > 0) {
                        fetchRange = searchResults;
                    } else {
                        shouldFetch = false;
                        await emitTelemetryEvent({
                            scope: EventScope.SYSTEM,
                            level: EventLevel.DEBUG,
                            category: 'imap',
                            message: `No search match`
                        });
                    }
                }

                if (shouldFetch) {
                    let fetchedCount = 0;
                    for await (const message of client.fetch(fetchRange, { source: { maxLength: maxBytes }, envelope: true }, { markSeen: markRead })) {
                        if (fetchedCount >= maxEmails) {
                            await emitTelemetryEvent({
                                scope: EventScope.SYSTEM,
                                level: EventLevel.DEBUG,
                                category: 'imap',
                                message: `Reached max_emails_per_fetch limit (${maxEmails}). Stopping poll.`
                            });
                            break;
                        }

                        try {
                            const parsed = await simpleParser(message.source);
                            const messageId = message.envelope?.messageId || parsed.messageId || '';
                            const subject = message.envelope?.subject || parsed.subject || '(No Subject)';
                            const from = parsed.from?.text || (message.envelope?.from?.[0] ? `${message.envelope.from[0].name || ''} <${message.envelope.from[0].address}>`.trim() : '');
                            const to = parsed.to?.text || (message.envelope?.to?.[0] ? `${message.envelope.to[0].name || ''} <${message.envelope.to[0].address}>`.trim() : '');
                            const replyTo = parsed.replyTo?.text || (message.envelope?.replyTo?.[0] ? `${message.envelope.replyTo[0].name || ''} <${message.envelope.replyTo[0].address}>`.trim() : '');
                            const inReplyTo = parsed.inReplyTo || message.envelope?.inReplyTo || '';
                            const references = Array.isArray(parsed.references) ? parsed.references.join(' ') : (parsed.references || '');

                            const textContent = (parsed.text || '').slice(0, maxBytes);

                            await emitTelemetryEvent({
                                scope: EventScope.SYSTEM,
                                level: EventLevel.DEBUG,
                                category: 'imap',
                                message: `Fetched: ${subject}`
                            });
                            emails.push({
                                messageId,
                                from,
                                to,
                                replyTo,
                                inReplyTo,
                                references,
                                subject,
                                text: textContent,
                                html: parsed.html || '',
                                date: parsed.date || new Date(),
                                source: message.source
                            });
                            fetchedCount++;
                        } catch (parseErr) {
                            await emitTelemetryEvent({
                                scope: EventScope.SYSTEM,
                                level: EventLevel.ERROR,
                                category: 'imap',
                                message: `Message parse failed (UID ${message.uid}): ${message.envelope?.subject || 'unknown'}`,
                                metadata: { error: String(parseErr) }
                            });
                        }
                    }

                    if (markRead && fetchRange) {
                        try {
                            await client.messageFlagsAdd(fetchRange, ['\\Seen']);
                            await emitTelemetryEvent({
                                scope: EventScope.SYSTEM,
                                level: EventLevel.DEBUG,
                                category: 'imap',
                                message: `Marked read (\\Seen)`
                            });
                        } catch (flagErr) {
                            await emitTelemetryEvent({
                                scope: EventScope.SYSTEM,
                                level: EventLevel.ERROR,
                                category: 'imap',
                                message: `Mark read failed`,
                                metadata: { error: String(flagErr) }
                            });
                        }
                    }
                }
            }
        } finally {
            lock.release();
        }
        await client.logout();
    } catch (err: any) {
        await emitTelemetryEvent({
            scope: EventScope.SYSTEM,
            level: EventLevel.ERROR,
            category: 'imap',
            message: `Poll failed (${record.tag || record.id}): ${err?.message || String(err)}`
        });
    }

    return emails;
};

export default poll;
