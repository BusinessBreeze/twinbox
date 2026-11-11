import { db } from 'hub:db';
import { and, eq } from 'drizzle-orm';
import { sources } from '#server/db/schema';
import { getExtensionFromMime } from '#bs/utils/get_extensions_from_mime_type';
import { marked } from 'marked';
import { markdownToTxt } from 'markdown-to-txt';
import MailComposer from 'nodemailer/lib/mail-composer/index.js';
import { decryptConfig, getSourceClass, imap } from '#server/jobs/sources';
import { notificationChannels } from 'hub:db:schema';

type ImapConnectionConfig = imap.ImapConnectionConfig;
import { emitTelemetryEvent, EventScope, EventLevel, reportNotificationFailure } from '#bs/utils/telemetry/event';

async function buildRawMimeMessage(
    from: string,
    to: string,
    subject: string,
    markdownText: string,
    attachments: Array<{ filename: string; content: Buffer; contentType?: string }>,
    threadingOptions?: { inReplyTo?: string; references?: string }
): Promise<Buffer> {
    const plainText = markdownToTxt(markdownText || '');
    const htmlText = marked.parse(markdownText || '') as string;

    const mailOptions: any = {
        from,
        to,
        subject: (subject || 'Notification').replace(/[\r\n]/g, ' '),
        text: plainText,
        html: htmlText,
        attachments: attachments.map(att => ({
            filename: att.filename,
            content: att.content,
            contentType: att.contentType
        }))
    };

    if (threadingOptions?.inReplyTo) {
        mailOptions.inReplyTo = threadingOptions.inReplyTo;
    }
    if (threadingOptions?.references) {
        mailOptions.references = threadingOptions.references;
    }

    const mail = new MailComposer(mailOptions);
    return await mail.compile().build();
}

/** Folders of an IMAP config, live (one IMAP connection). */
const folderList = async (config: ImapConnectionConfig): Promise<string[]> =>
    (await getSourceClass('imap')!.listResources(config)).map((r) => r.value);

/** An IMAP source of the owner, with its config decrypted. */
const imapSource = async (id: string, ownerId?: string) => {
    const where = ownerId
        ? and(eq(sources.id, id), eq(sources.type, 'imap'), eq(sources.owner_id, ownerId))
        : and(eq(sources.id, id), eq(sources.type, 'imap'));
    const row = await db.select().from(sources).where(where).get();
    return row ? { ...row, config: decryptConfig(row.config) as ImapConnectionConfig } : null;
};

export class ImapNotificationProvider {
    // Its services list the user's own IMAP sources: the registry asks per user instead of caching
    static perUserSchemas = true;

    /**
     * Returns schema definitions for 'set' and 'preset' IMAP notification services.
     */
    static async getSchemas(options?: { user_id?: string }) {
        const recordOptions: Array<{ title: string; value: string }> = [];
        const folderValuesMap: Record<string, string[]> = {};

        // The user's IMAP sources; folders are read live from each server (spec: no cached folder list).
        try {
            const userId = options?.user_id;
            const rows = await db.select().from(sources)
                .where(userId ? and(eq(sources.type, 'imap'), eq(sources.owner_id, userId)) : eq(sources.type, 'imap'));
            await Promise.all(rows.map(async (row) => {
                recordOptions.push({ title: row.name || row.id, value: row.id });
                try {
                    folderValuesMap[row.id] = await folderList(decryptConfig(row.config) as ImapConnectionConfig);
                } catch {
                    folderValuesMap[row.id] = [];   // server unreachable: no folders offered for this source
                }
            }));
        } catch (err) {
            console.error('[ImapNotificationProvider] Error loading IMAP sources for schema:', err);
        }

        return [
            {
                service_name: 'set',
                details: {
                    templates: [
                        '{schema}://{user}:{password}@{host}:{port}/{folder}',
                        '{schema}://{user}:{password}@{host}/{folder}',
                        '{schema}://{user}:{password}@{host}:{port}',
                        '{schema}://{user}:{password}@{host}'
                    ],
                    tokens: {
                        schema: {
                            name: 'Schema',
                            type: 'choice:string',
                            required: true,
                            values: [
                                'imap_login',
                                'imaps_login'
                            ],
                            default: 'imaps_login',
                            map_to: 'schema',
                            private: false
                        },
                        host: { name: 'Host', type: 'string', required: true, private: false },
                        port: { name: 'Port', type: 'int', required: false, min: 1, max: 65535, default: 993, private: false },
                        user: { name: 'User', type: 'string', required: true, private: false },
                        password: { name: 'Password', type: 'string', required: true, private: true },
                        folder: { name: 'Folder', type: 'string', required: false, default: 'INBOX', private: false }
                    }
                }
            },
            {
                service_name: 'preset',
                details: {
                    templates: [
                        '{schema}://{record_id}/{folder}',
                        '{schema}://{record_id}'
                    ],
                    tokens: {
                        schema: {
                            name: 'Schema',
                            type: 'choice:string',
                            required: true,
                            values: [
                                'imap_connection'
                            ],
                            default: 'imap_connection',
                            map_to: 'schema',
                            private: false
                        },
                        record_id: {
                            name: 'IMAP Source',
                            type: 'choice:string',
                            required: true,
                            values: recordOptions,
                            private: false
                        },
                        folder: {
                            name: 'Folder',
                            type: 'choice:string',
                            required: false,
                            default: 'INBOX',
                            conditional_field: 'record_id',
                            values: folderValuesMap,
                            private: false
                        }
                    }
                }
            }
        ];
    }

    /**
     * Validates folder existence for channel creation/updating.
     */
    static async validateConfig(config: any, type: string, owner_id?: string) {
        if (!config) return;

        if (type === 'set') {
            const schemaName = config.schema || (config.template && config.template.includes('imaps_login') ? 'imaps_login' : (config.template && config.template.includes('imap_login') ? 'imap_login' : 'imaps_login'));
            const isImaps = schemaName === 'imaps_login';
            const defaultPort = isImaps ? 993 : 143;
            const targetPort = config.port ? Number(config.port) : defaultPort;
            const targetFolder = config.folder || 'INBOX';

            const folders = await folderList({
                host: config.host,
                port: targetPort,
                use_ssl: isImaps,
                username: config.user || config.username,
                auth_type: 'login',
                credential: config.password || config.credential,
            });
            if (targetFolder && !folders.includes(targetFolder)) {
                await emitTelemetryEvent({
                    scope: EventScope.SYSTEM,
                    level: EventLevel.ERROR,
                    category: 'imap',
                    message: `Folder "${targetFolder}" does not exist on target IMAP server.`
                });
                throw createError({
                    statusCode: 400,
                    statusMessage: 'error imap.folder_not_found'
                });
            }
        } else if (type === 'preset') {
            const recordId = config.record_id;
            if (!recordId) {
                throw createError({
                    statusCode: 400,
                    statusMessage: 'error imap.missing_record_id'
                });
            }

            const source = await imapSource(recordId, owner_id);
            if (!source) {
                await emitTelemetryEvent({
                    scope: EventScope.SYSTEM,
                    level: EventLevel.ERROR,
                    category: 'imap',
                    message: `IMAP source "${recordId}" not found.`
                });
                throw createError({
                    statusCode: 400,
                    statusMessage: 'error imap.record_not_found'
                });
            }
            const connRecord = source;
            const folders = await folderList(source.config);

            const targetFolder = config.folder || 'INBOX';
            if (targetFolder && !folders.includes(targetFolder)) {
                await emitTelemetryEvent({
                    scope: EventScope.SYSTEM,
                    level: EventLevel.ERROR,
                    category: 'imap',
                    message: `Folder "${targetFolder}" does not exist on connection "${connRecord.name}".`
                });
                throw createError({
                    statusCode: 400,
                    statusMessage: 'error imap.folder_not_found'
                });
            }
        }
    }

    /**
     * Provider entry point: never throws. Config, login and append errors go to the owner's event log.
     */
    static async sendItems(
        title: string,
        items: Array<{ content: string; mime_type?: string; filename?: string; metadata?: any }> | string,
        options: { channel: Record<string, any>; user_id?: string; owner_id?: string; keep_threadid?: boolean; keep_thread_id?: boolean }
    ): Promise<{ ok: boolean }> {
        try {
            await ImapNotificationProvider.appendItems(title, items, options);
            return { ok: true };
        } catch (err: any) {
            const channel = options?.channel;
            await reportNotificationFailure(channel?.owner_id || options?.owner_id || options?.user_id, channel?.name || 'IMAP', err?.message || 'IMAP append failed');
            return { ok: false };
        }
    }

    /**
     * Appends notification body/attachments as a new email message in the specified target IMAP folder.
     */
    private static async appendItems(
        title: string,
        items: Array<{ content: string; mime_type?: string; filename?: string; metadata?: any }> | string,
        options: { channel: Record<string, any>; user_id?: string; keep_threadid?: boolean; keep_thread_id?: boolean }
    ) {
        const channel = options?.channel;
        if (!channel) {
            throw new Error('Missing channel in options');
        }

        const type = (channel.type || channel.service_name || '').toLowerCase();
        const config = channel.config || {};

        let connection: ImapConnectionConfig;
        let targetFolder = 'INBOX';

        if (type === 'set') {
            const schemaName = config.schema || (config.template && config.template.includes('imaps_login') ? 'imaps_login' : (config.template && config.template.includes('imap_login') ? 'imap_login' : 'imaps_login'));
            const isImaps = schemaName === 'imaps_login';
            connection = {
                host: config.host,
                port: config.port ? Number(config.port) : (isImaps ? 993 : 143),
                use_ssl: isImaps,
                username: config.user || config.username,
                auth_type: 'login',
                credential: config.password || config.credential,
            };
            targetFolder = config.folder || 'INBOX';
        } else if (type === 'preset') {
            const source = await imapSource(config.record_id);
            if (!source) {
                throw new Error(`IMAP source '${config.record_id}' not found`);
            }
            connection = source.config;
            targetFolder = config.folder || 'INBOX';
        } else {
            throw new Error(`Unsupported IMAP service type '${type}'`);
        }

        let textContent = '';
        const attachments: Array<{ filename: string; content: Buffer; contentType?: string }> = [];

        if (typeof items === 'string') {
            textContent = items;
        } else if (Array.isArray(items)) {
            const textItems: Array<{ content: string; mime_type?: string; filename?: string; metadata?: any }> = [];
            const attachmentItems: Array<{ content: string; mime_type?: string; filename?: string; metadata?: any }> = [];

            for (const item of items) {
                if (item.mime_type && item.mime_type.toLowerCase().startsWith('text/')) {
                    textItems.push(item);
                } else {
                    attachmentItems.push(item);
                }
            }

            if (textItems.length > 0) {
                textContent = textItems[0].content || '';
                if (textItems.length > 1) {
                    attachmentItems.push(...textItems.slice(1));
                }
            }

            for (let i = 0; i < attachmentItems.length; i++) {
                const item = attachmentItems[i];
                const mimeType = item.mime_type || 'application/octet-stream';
                const ext = getExtensionFromMime(mimeType);
                const filename = item?.filename || `attachment_${i + 1}.${ext}`;

                let contentBuffer: Buffer;
                if (mimeType.toLowerCase().startsWith('text/')) {
                    contentBuffer = Buffer.from(item.content || '', 'utf-8');
                } else {
                    contentBuffer = Buffer.isBuffer(item.content)
                        ? item.content
                        : Buffer.from(item.content || '', 'base64');
                }

                attachments.push({
                    filename,
                    content: contentBuffer,
                    contentType: mimeType
                });
            }
        }

        const keepThreadId = !!options?.keep_threadid || !!options?.keep_thread_id;
        let threading: { inReplyTo?: string; references?: string } | undefined = undefined;
        let emailSubject = title || 'Notification';

        if (keepThreadId && Array.isArray(items)) {
            for (const item of items) {
                const headers = item.metadata?.imap?.headers;
                const sourceHeader = Array.isArray(headers) ? headers[0] : null;
                if (sourceHeader?.messageId) {
                    const inReplyTo = sourceHeader.messageId;
                    const existingRefs = sourceHeader.references || '';
                    const references = existingRefs ? `${existingRefs} ${sourceHeader.messageId}`.trim() : sourceHeader.messageId;
                    threading = { inReplyTo, references };

                    if (sourceHeader.subject && !emailSubject.toLowerCase().startsWith('re:')) {
                        emailSubject = `Re: ${sourceHeader.subject}`;
                    }
                    break;
                }
            }
        }

        const messageBuffer = await buildRawMimeMessage(
            connection.username,
            connection.username,
            emailSubject,
            textContent,
            attachments,
            threading
        );

        const isDraftFolder = targetFolder.toLowerCase().includes('draft');
        const flags = isDraftFolder ? ['\\Draft', '\\Seen'] : ['\\Seen'];

        await imap.appendMessage(connection, targetFolder, messageBuffer, flags);
    }
}

/** Registered with the sources service: warns the owners of IMAP channels that wrote into a deleted source. */
export const warnChannelsOfDeletedSource = async (source: { id: string; name: string }) => {
    const channels = (await db.select().from(notificationChannels).where(eq(notificationChannels.provider, 'imap')))
        .filter((c: any) => c.config?.record_id === source.id);
    for (const channel of channels) {
        await emitTelemetryEvent({
            scope: EventScope.USER, level: EventLevel.WARN, category: 'source',
            message: 'events.user.warn_source_deleted_channel',
            owner_id: channel.owner_id,
            // `channel`, not `name`: `name` means an automation (dashboard)
            metadata: { channel: channel.name, source: source.name },
        });
    }
};
