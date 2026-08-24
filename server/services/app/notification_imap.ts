import { db } from 'hub:db';
import { connectionsIMAP } from '#server/db/schema';
import { dbFindAll } from '#bs/db/wrappers/db_find_all';
import { dbFindOne } from '#bs/db/wrappers/db_find_one';
import { ImapFlow } from 'imapflow';
import { getExtensionFromMime } from '#bs/utils/get_extensions_from_mime_type';
import { getFolderList } from '#server/utils/imap/getFolderList';
import { marked } from 'marked';
import { markdownToTxt } from 'markdown-to-txt';
import MailComposer from 'nodemailer/lib/mail-composer';
import { decryptConfig } from '#server/services/app/connections_imap';
import { emitTelemetryEvent, EventScope, EventLevel } from '#bs/utils/telemetry/event';

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

export class ImapNotificationProvider {
    /**
     * Returns schema definitions for 'set' and 'preset' IMAP notification services.
     */
    static async getSchemas(options?: { user_id?: string }) {
        const recordOptions: Array<{ title: string; value: string }> = [];
        const folderValuesMap: Record<string, string[]> = {};

        try {
            const userId = options?.user_id;
            const query = userId ? { owner_id: userId } : {};
            const connections = await dbFindAll(db, connectionsIMAP, query);

            if (Array.isArray(connections)) {
                for (const conn of connections) {
                    recordOptions.push({
                        title: conn.name || conn.id,
                        value: conn.id
                    });
                    folderValuesMap[conn.id] = Array.isArray(conn.folders) ? conn.folders : [];
                }
            }
        } catch (err) {
            console.error('[ImapNotificationProvider] Error fetching IMAP connections for schema:', err);
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
                            name: 'IMAP Connection',
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

            const tempRecord = {
                host: config.host,
                port: targetPort,
                use_ssl: isImaps ? 1 : 0,
                username: config.user || config.username,
                auth_type: 'login',
                config: {
                    credential: config.password || config.credential
                }
            };
            const folders = await getFolderList(tempRecord);
            if (targetFolder && !folders.includes(targetFolder)) {
                await emitTelemetryEvent({
                    scope: EventScope.SYSTEM,
                    level: EventLevel.ERROR,
                    label: 'IMAP',
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

            const query: any = { id: recordId };
            if (owner_id) query.owner_id = owner_id;
            const rawRecord = await dbFindOne(db, connectionsIMAP, query);

            if (!rawRecord) {
                await emitTelemetryEvent({
                    scope: EventScope.SYSTEM,
                    level: EventLevel.ERROR,
                    label: 'IMAP',
                    message: `Connection record "${recordId}" not found.`
                });
                throw createError({
                    statusCode: 400,
                    statusMessage: 'error imap.record_not_found'
                });
            }

            const connRecord = {
                ...rawRecord,
                config: decryptConfig(rawRecord.config)
            };

            let folders = connRecord.folders;
            if (!folders || !Array.isArray(folders) || folders.length === 0) {
                folders = await getFolderList(connRecord);
            }

            const targetFolder = config.folder || 'INBOX';
            if (targetFolder && !folders.includes(targetFolder)) {
                await emitTelemetryEvent({
                    scope: EventScope.SYSTEM,
                    level: EventLevel.ERROR,
                    label: 'IMAP',
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
     * Appends notification body/attachments as a new email message in the specified target IMAP folder.
     */
    static async sendItems(
        title: string,
        items: Array<{ content: string; mime_type?: string; metadata?: any }> | string,
        options: { channel: Record<string, any>; user_id?: string; keep_threadid?: boolean; keep_thread_id?: boolean }
    ) {
        const channel = options?.channel;
        if (!channel) {
            console.error('[ImapNotificationProvider] Missing channel in options');
            return;
        }

        const type = (channel.type || channel.service_name || '').toLowerCase();
        const config = channel.config || {};

        let host = '';
        let port = 993;
        let use_ssl = true;
        let username = '';
        let password = '';
        let accessToken = '';
        let targetFolder = 'INBOX';

        if (type === 'set') {
            const schemaName = config.schema || (config.template && config.template.includes('imaps_login') ? 'imaps_login' : (config.template && config.template.includes('imap_login') ? 'imap_login' : 'imaps_login'));
            const isImaps = schemaName === 'imaps_login';
            const defaultPort = isImaps ? 993 : 143;

            host = config.host;
            port = config.port ? Number(config.port) : defaultPort;
            use_ssl = isImaps;
            username = config.user || config.username;
            password = config.password || config.credential;
            targetFolder = config.folder || 'INBOX';
        } else if (type === 'preset') {
            const recordId = config.record_id;
            const rawRecord = await dbFindOne(db, connectionsIMAP, { id: recordId });
            if (!rawRecord) {
                console.error(`[ImapNotificationProvider] Connection record not found for ID: ${recordId}`);
                return;
            }
            const connRecord = {
                ...rawRecord,
                config: decryptConfig(rawRecord.config)
            };
            host = connRecord.host;
            port = connRecord.port;
            use_ssl = connRecord.use_ssl === 1;
            username = connRecord.username;
            password = connRecord.auth_type === 'login' ? connRecord.config?.credential : undefined;
            accessToken = connRecord.auth_type === 'oauth' ? connRecord.config?.credential : undefined;
            targetFolder = config.folder || 'INBOX';
        } else {
            console.error(`[ImapNotificationProvider] Unsupported service type: ${type}`);
            return;
        }

        const client = new ImapFlow({
            host,
            port,
            secure: use_ssl,
            auth: {
                user: username,
                pass: password,
                accessToken: accessToken
            },
            connectionTimeout: 10000,
            greetingTimeout: 20000,
            logger: false
        });

        await client.connect();

        let textContent = '';
        const attachments: Array<{ filename: string; content: Buffer; contentType?: string }> = [];

        if (typeof items === 'string') {
            textContent = items;
        } else if (Array.isArray(items)) {
            const textItems: Array<{ content: string; mime_type?: string; metadata?: any }> = [];
            const attachmentItems: Array<{ content: string; mime_type?: string; metadata?: any }> = [];

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
                const filename = `attachment_${i + 1}.${ext}`;

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
            username,
            username,
            emailSubject,
            textContent,
            attachments,
            threading
        );

        const isDraftFolder = targetFolder.toLowerCase().includes('draft');
        const flags = isDraftFolder ? ['\\Draft', '\\Seen'] : ['\\Seen'];

        const lock = await client.getMailboxLock(targetFolder);
        try {
            await client.append(targetFolder, messageBuffer, flags);
        } finally {
            lock.release();
        }

        await client.logout();
        console.log(`[ImapNotificationProvider] Successfully appended message to IMAP folder "${targetFolder}" on ${host}.`);
    }
}
