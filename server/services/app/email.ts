import { db } from "hub:db";
import { emails } from "#server/db/schema";
import { zod_rules } from "#shared/rules/app/email";
import { genericService } from "#layers/nuxt-base-app/server/services/generic";
import { and, eq, inArray } from 'drizzle-orm';
import { emitTelemetryEvent, EventScope, EventLevel } from '#bs/utils/telemetry/event';
import { userMetrics } from '#server/utils/telemetry/user';
import { limits } from '#shared/limits';
import MailComposer from 'nodemailer/lib/mail-composer/index.js';
import { formatAddresses, type MessageContent, type MessageEnvelope, type MessagePart, type MessageRendition } from '#shared/types/email';
import { buildEmail, htmlToText, parseMessage, renditionText, storeAttachments, type BuiltEmail } from './email_builder';
import { fileService } from './files';
import { emailAttachmentCount } from '#server/db/email_content';
import { whereOf } from '#bs/db/wrappers/filter';


/** Every file the record's parts (its own and its embedded messages') reference. */
export const fileIdsOf = (content?: MessageContent | null): string[] => [
    ...(content?.parts ?? []),
    ...(content?.embedded ?? []).flatMap((m) => m.parts ?? []),
].map((p) => p.file_id).filter((id): id is string => !!id);

export interface StoreOptions {
    source_id?: string;                 // the source that downloaded it
    size?: number;                      // size of the original at the source
    attachments?: boolean;              // the source wants attachments (limits.attachments.enabled must allow it too)
}

class emailService extends genericService {
    /** Stores a raw message (RFC 822). Used by the admin route; sources pass parsed messages to createFromParsed. */
    async create(stream: any, extra: StoreOptions = {}) {
        const parsed = await parseMessage(stream);
        return (await this.createFromParsed(parsed, extra)).record;
    }

    /**
     * Stores a parsed message: its structure (email_builder.ts) and, when allowed, its attachments in the file store.
     * Returns the record (null when the owner already has it) and whether the storage quota stopped an attachment.
     */
    async createFromParsed(parsed: Awaited<ReturnType<typeof parseMessage>>, extra: StoreOptions = {}) {
        return this.createFromBuilt(await buildEmail(parsed), extra);
    }

    /** Same, for a message the caller already built (a source that needed its text before storing). */
    async createFromBuilt(built: BuiltEmail, extra: StoreOptions = {}) {
        if (!built.messageId) throw createError({ statusCode: 400, statusMessage: 'error email.create.missing_message_id' });
        if (!built.to) throw createError({ statusCode: 400, statusMessage: 'error email.create.missing_to_address' });
        if (!built.from) throw createError({ statusCode: 400, statusMessage: 'error email.create.missing_from_address' });
        if (await this.#exists(built.messageId)) return { record: null, quotaReached: false };

        const { quotaReached } = await storeAttachments(built.pending, !!extra.attachments, limits.attachments,
            async (content, mime, filename) => (await fileService.create(this.user_id!, content, { mime, filename })).id);
        const record = await this.store(this.#row(built, extra));
        return { record, quotaReached };
    }

    #row(built: BuiltEmail, extra: StoreOptions) {
        return {
            owner_id: this.user_id,
            messageId: built.messageId,
            to: built.to,
            from: built.from,
            subject: built.subject,
            text: built.text,
            date: built.date,
            thread_id: built.thread_id,
            size: extra.size ?? null,
            content: built.content,
            ...(extra.source_id ? { source_id: extra.source_id } : {}),
        };
    }

    async #exists(messageId: string) {
        const existing = await this.db.select({ id: this.table.id }).from(this.table)
            .where(and(eq(this.table.messageId, messageId), eq(this.table.owner_id, this.user_id))).limit(1);
        return existing.length > 0;
    }

    /** Stores one email record; an email the owner already has (same message id) is skipped (returns null). */
    private async store(record: any) {
        if (await this.#exists(record.messageId)) {
            await emitTelemetryEvent({
                scope: EventScope.SYSTEM,
                level: EventLevel.DEBUG,
                category: 'email',
                message: `Email exists. Skipping.`,
                metadata: { messageId: record.messageId, owner_id: record.owner_id }
            });
            return null;
        }

        try {
            const res = await super.create(record);
            if (res && this.user_id) {
                userMetrics.recordIngestedMail(this.user_id);
            }
            return res;
        } catch (err: any) {
            await emitTelemetryEvent({
                scope: EventScope.SYSTEM,
                level: EventLevel.ERROR,
                category: 'email',
                message: `Create failed (${record.messageId}): ${err?.message || String(err)}`,
                metadata: { messageId: record.messageId, owner_id: record.owner_id }
            });
            throw err;
        }
    }

    /**
     * Emails for a list: the small columns and the number of attachments, without the automation text and the
     * structure (the viewer reads one email with them). The owner's only; the admin service sees all.
     */
    async list(filter: { id?: string; messageId?: string } = {}) {
        const t = this.table;
        return this.db.select({
            id: t.id, messageId: t.messageId, owner_id: t.owner_id, source_id: t.source_id, from: t.from, to: t.to,
            subject: t.subject, date: t.date, size: t.size, thread_id: t.thread_id, staging_item: t.staging_item,
            createdAt: t.createdAt, updatedAt: t.updatedAt, attachments: emailAttachmentCount,
        }).from(t).where(whereOf(t, this.addOwner({ ...filter })));
    }

    /** The only way emails are deleted: the rows (the owner's, or any for the admin service), then their files. */
    async deleteMany(ids: string[]) {
        if (!Array.isArray(ids) || ids.length === 0) return [];
        const where = this.user_id ? and(inArray(this.table.id, ids), eq(this.table.owner_id, this.user_id)) : inArray(this.table.id, ids);
        const removed = await this.db.delete(this.table).where(where)
            .returning({ id: this.table.id, owner_id: this.table.owner_id, content: this.table.content });
        await releaseFiles(removed);
        return removed.map((r: any) => ({ id: r.id as string, owner_id: r.owner_id as string }));
    }

    async delete(id: string) {
        const [removed] = await this.deleteMany([id]);
        return removed ?? null;
    }

    /**
     * Removes the stored attachments of the owner's email and keeps the email: its parts become "removed" (still
     * listed), their files are released. Returns the updated record, or null when the owner has no such email.
     */
    async removeAttachments(id: string) {
        const row = await this.db.select().from(this.table)
            .where(and(eq(this.table.id, id), eq(this.table.owner_id, this.user_id))).get();
        if (!row) return null;
        const content: MessageContent | null = row.content;
        const fileIds = fileIdsOf(content);
        if (!content || fileIds.length === 0) return row;
        const strip = (parts: MessagePart[]) => parts.map(({ file_id: _file, reason: _reason, ...p }) => (p.status === 'stored' ? { ...p, status: 'removed' as const } : p));
        const updated = { ...content, parts: strip(content.parts), embedded: content.embedded.map((m) => ({ ...m, parts: strip(m.parts) })) };
        const [saved] = await this.db.update(this.table).set({ content: updated, updatedAt: new Date() })
            .where(and(eq(this.table.id, id), eq(this.table.owner_id, this.user_id))).returning();
        await fileService.release(this.user_id!, fileIds);
        return saved;
    }

    async setStaging(idOrIds: string | string[], stagingValue: number = 1) {
        const ids = Array.isArray(idOrIds) ? idOrIds : [idOrIds];
        if (ids.length === 0) return [];

        let conditions: any = inArray(this.table.id, ids);
        if (this.user_id) {
            conditions = and(conditions, eq(this.table.owner_id, this.user_id));
        }

        return await this.db.update(this.table)
            .set({ staging_item: stagingValue, updatedAt: new Date() })
            .where(conditions)
            .returning();
    }

    async export(id?: string, stripFields: string[] = ['id', 'owner_id', 'createdAt', 'updatedAt'], transformFields: string[] = []) {
        return super.export(stripFields, transformFields, id);
    }

    /**
     * Exported emails are records, not raw messages, so they are stored directly. Old exports have `text` and `html`;
     * new ones `content`. Files are not part of an export: stored parts become "removed".
     */
    async import(payload: any, _transformFields: string[] = []) {
        const data = payload && typeof payload === 'object' && 'data' in payload ? payload.data : payload;
        const items: any[] = Array.isArray(data) ? data : data ? [data] : [];
        // Every record must be an email (an object with a message id and a sender): checked before anything is stored
        items.forEach((item, index) => {
            const messageId = item?.messageId ?? item?.message_id;
            if (!item || typeof item !== 'object' || Array.isArray(item) || typeof messageId !== 'string' || !messageId.trim() || typeof item.from !== 'string') {
                throw createError({ status: 400, statusMessage: 'error email.bad_payload', data: { index } });
            }
        });
        const stored = [];
        for (const item of items) {
            const content = importedContent(item);
            stored.push(await this.store({
                owner_id: this.user_id,
                messageId: item.messageId ?? item.message_id,
                from: item.from,
                to: item.to,
                subject: item.subject ?? '',
                text: typeof item.text === 'string' && item.text ? item.text : renditionText(content.renditions),
                date: item.date ?? new Date().toISOString(),
                thread_id: typeof item.thread_id === 'string' ? item.thread_id : null,
                size: Number.isFinite(item.size) ? item.size : null,
                content,
                staging_item: item.staging_item ? 1 : 0,
            }));
        }
        return stored;
    }
}

/** Releases the files of deleted email rows (each owner's own). */
export const releaseFiles = async (rows: Array<{ owner_id: string; content?: MessageContent | null }>) => {
    const byOwner = new Map<string, string[]>();
    for (const row of rows) byOwner.set(row.owner_id, [...(byOwner.get(row.owner_id) ?? []), ...fileIdsOf(row.content)]);
    for (const [owner, ids] of byOwner) if (ids.length) await fileService.release(owner, ids);
};

const rendition = (mime: MessageRendition['mime'], content: unknown): MessageRendition[] =>
    typeof content === 'string' && content.trim() ? [{ mime, size: Buffer.byteLength(content), content }] : [];

const imported = (parts: unknown): MessagePart[] => (Array.isArray(parts) ? parts : []).map((p: any) => ({
    id: String(p?.id ?? ''), mime: String(p?.mime ?? 'application/octet-stream'), filename: p?.filename ?? null,
    size: Number(p?.size) || 0, disposition: p?.disposition === 'inline' ? 'inline' : 'attachment', content_id: p?.content_id ?? null,
    ...(p?.status === 'stored' || p?.status === 'removed' ? { status: 'removed' as const } : { status: p?.status ?? 'skipped', reason: p?.reason }),
}));

/** The content of an imported record: its own (without file references), or built from old `html` / `text` fields. */
const importedContent = (item: any): MessageContent => {
    const c = item.content;
    if (c && typeof c === 'object' && Array.isArray(c.renditions)) {
        return {
            envelope: c.envelope ?? { from: [{ name: null, address: item.from }], to: [], cc: [], reply_to: [] },
            renditions: c.renditions.filter((r: any) => (r?.mime === 'text/html' || r?.mime === 'text/plain') && typeof r.content === 'string'),
            parts: imported(c.parts),
            embedded: (Array.isArray(c.embedded) ? c.embedded : []).map((m: any) => ({ ...m, parts: imported(m?.parts) })),
        };
    }
    return {
        envelope: {
            from: item.from ? [{ name: null, address: item.from }] : [], to: item.to ? [{ name: null, address: item.to }] : [],
            cc: [], reply_to: [], subject: item.subject ?? '', date: item.date, message_id: item.messageId ?? item.message_id,
        },
        renditions: [...rendition('text/html', item.html), ...rendition('text/plain', item.html ? undefined : item.text)],
        parts: [],
        embedded: [],
    };
};

/**
 * The record as an RFC 822 message (.eml): envelope, renditions, the stored attachments (read from the owner's files)
 * and embedded messages as message/rfc822 attachments. Parts that were not stored are left out.
 */
export const toEml = async (ownerId: string, record: { from: string; to: string; subject?: string | null; date?: string | null; messageId: string; content?: MessageContent | null }) => {
    const content: MessageContent = record.content ?? {
        envelope: { from: [{ name: null, address: record.from }], to: [{ name: null, address: record.to }], cc: [], reply_to: [], subject: record.subject ?? '', date: record.date ?? undefined, message_id: record.messageId },
        renditions: [], parts: [], embedded: [],
    };
    const compose = async (envelope: MessageEnvelope, renditions: MessageRendition[], parts: MessagePart[], embedded: MessageContent['embedded'] = []): Promise<Buffer> => {
        const attachments: any[] = [];
        for (const part of parts) {
            const bytes = part.status === 'stored' && part.file_id ? await fileService.read(ownerId, part.file_id) : null;
            if (bytes) attachments.push({ filename: part.filename || undefined, content: bytes, contentType: part.mime, contentDisposition: part.disposition, cid: part.content_id || undefined });
        }
        for (const m of embedded) {
            attachments.push({ filename: `${(m.envelope.subject || 'message').replace(/[/\\?%*:|"<>\r\n]/g, '_').slice(0, 80)}.eml`, content: await compose(m.envelope, m.renditions, m.parts), contentType: 'message/rfc822', contentDisposition: 'attachment' });   // nodemailer's default (inline) would merge it into the body when read back
        }
        return new MailComposer({
            from: formatAddresses(envelope.from) || undefined,
            to: formatAddresses(envelope.to) || undefined,
            cc: formatAddresses(envelope.cc) || undefined,
            replyTo: formatAddresses(envelope.reply_to) || undefined,
            subject: envelope.subject || '',
            date: envelope.date ? new Date(envelope.date) : undefined,
            messageId: envelope.message_id,
            inReplyTo: envelope.in_reply_to,
            references: envelope.references,
            html: renditions.find((r) => r.mime === 'text/html')?.content,
            text: renditions.find((r) => r.mime === 'text/plain')?.content,
            attachments,
        } as any).compile().build();
    };
    return compose(content.envelope, content.renditions, content.parts, content.embedded);
};

export { htmlToText };

export const getService = async (ctx?: any) => {
    const ownerId = await resolveServiceContext(ctx);
    return new emailService(db, emails, zod_rules, ownerId);
}
