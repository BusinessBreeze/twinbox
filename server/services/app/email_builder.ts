// Builds the stored structure of an email (shared/types/email.ts) from a parsed message: envelope, renditions, parts,
// embedded messages (one level), and the automation text. Pure apart from parsing embedded messages: nothing is stored
// here; the parts' bytes come back as `pending` for the email service to store (or not). Every ingestion path (IMAP,
// raw messages, imports) goes through here, so records don't differ by path. See docs/specs/SPEC_attachments.md 7.
import { simpleParser, type AddressObject, type Attachment, type ParsedMail } from 'mailparser';
import { convert } from 'html-to-text';
import { fileTypeFromBuffer } from 'file-type';
import { randomBytes } from 'node:crypto';
import type { EmbeddedMessage, MessageAddress, MessageContent, MessageEnvelope, MessagePart, MessageRendition } from '#shared/types/email';

/**
 * Options for every simpleParser call on mail we store. skipHtmlToText: `text` is only a real text/plain part, so we
 * know which renditions exist. Inline images (cid:) stay as mailparser puts them: data: URIs inside the HTML.
 */
export const PARSE_OPTIONS = { skipHtmlToText: true } as const;

export const parseMessage = (source: Buffer | string) => simpleParser(source, PARSE_OPTIONS);

/**
 * Header of a placeholder for a part that was not downloaded (selective IMAP download): "<reason>; size=<bytes>".
 * Random per process, so a sender can't fake it in their own message.
 */
export const OMITTED_HEADER = `x-twinbox-omitted-${randomBytes(6).toString('hex')}`;

const omission = (a: Attachment) => {
    const value = a.headers?.get(OMITTED_HEADER) as any;
    const text = typeof value === 'string' ? value : value?.value ?? value?.text;
    const m = typeof text === 'string' ? text.match(/^\s*([a-z_]+)\s*;\s*size=(\d+)/i) : null;
    return m ? { reason: m[1]!.toLowerCase(), size: Number(m[2]) } : null;
};

/** A part's bytes, waiting for the attachment decision; `part` is the object in the record (updated in place). */
export interface PendingPart {
    part: MessagePart;
    content: Buffer;
}

export interface BuiltEmail {
    messageId: string;
    from: string;                                   // first sender address (the columns as before)
    to: string;                                     // first recipient address
    subject: string;
    date: string;
    thread_id: string;
    text: string;
    content: MessageContent;
    pending: PendingPart[];
}

const bytes = (text: string) => Buffer.byteLength(text, 'utf8');

// What a person doesn't see is not read either: hidden text is the usual way to slip instructions to a model (prompt
// injection). Style attributes are normalized first (lower case, no spaces, ending in ";"), so one selector covers
// every spelling. Text colored like its background can't be told apart here and stays.
// Not width/height: "border-width:0px" or "min-height:0px" would match and are visible.
const HIDDEN_STYLES = ['display:none', 'visibility:hidden', 'opacity:0;', 'font-size:0;', 'font-size:0px', 'font-size:0pt', 'font-size:0em',
    'max-height:0;', 'max-height:0px', 'mso-hide:all'];
const HIDDEN = [
    ...HIDDEN_STYLES.map((style) => `[style*="${style}"]`),
    '[hidden]', '[aria-hidden="true"]', 'head', 'title', 'template', 'noscript', 'script', 'style',
];

const normalizeStyles = (html: string) => html.replace(/\sstyle\s*=\s*("([^"]*)"|'([^']*)')/gi, (_m, _q, dq, sq) =>
    ` style="${String(dq ?? sq).toLowerCase().replace(/\s+/g, '').replace(/"/g, '')};"`);

/** Characters that show nothing but can carry text past a reader: zero-width, bidi controls, soft hyphen, tag characters. */
export const stripInvisible = (text: string) => text.replace(/[\u00AD\u180E\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF]|[\u{E0000}-\u{E007F}]/gu, '');

/** Plain text of an HTML body as a person sees it: readable (paragraphs and lists kept), without hidden elements and image or link targets. */
export const htmlToText = (html: string) => stripInvisible(convert(normalizeStyles(html), {
    wordwrap: false,
    selectors: [
        { selector: 'img', format: 'skip' },
        { selector: 'a', options: { ignoreHref: true } },
        ...HIDDEN.map((selector) => ({ selector, format: 'skip' })),
    ],
})).trim();

const addresses = (field?: AddressObject | AddressObject[]): MessageAddress[] => (field ? [field].flat() : [])
    .flatMap((obj) => obj.value || [])
    .flatMap((a) => (a.group ? a.group : [a]))
    .filter((a) => a.address)
    .map((a) => ({ name: a.name || null, address: a.address! }));

const references = (value?: string | string[]) => (Array.isArray(value) ? value : value ? value.split(/\s+/) : []).filter(Boolean);

const envelopeOf = (parsed: ParsedMail): MessageEnvelope => {
    const listId = parsed.headers?.get('list-id') as any;
    return {
        from: addresses(parsed.from),
        to: addresses(parsed.to),
        cc: addresses(parsed.cc),
        reply_to: addresses(parsed.replyTo),
        subject: parsed.subject || '',
        date: parsed.date && !Number.isNaN(parsed.date.getTime()) ? parsed.date.toISOString() : undefined,
        message_id: parsed.messageId || undefined,
        in_reply_to: parsed.inReplyTo || undefined,
        references: references(parsed.references),
        ...(listId ? { headers: { 'list-id': typeof listId === 'string' ? listId : listId.text || String(listId.value ?? '') } } : {}),
    };
};

const renditionsOf = (parsed: ParsedMail): MessageRendition[] => {
    const out: MessageRendition[] = [];
    if (typeof parsed.html === 'string' && parsed.html.trim()) out.push({ mime: 'text/html', size: bytes(parsed.html), content: parsed.html });
    if (parsed.text && parsed.text.trim()) out.push({ mime: 'text/plain', size: bytes(parsed.text), content: parsed.text });
    return out;
};

/** The text automations read for one message: its text/plain rendition, else its HTML converted. */
export const renditionText = (renditions: MessageRendition[]) => {
    const plain = renditions.find((r) => r.mime === 'text/plain');
    if (plain) return stripInvisible(plain.content).trim();
    const html = renditions.find((r) => r.mime === 'text/html');
    return html ? htmlToText(html.content) : '';
};

const isMessage = (a: Attachment) => a.contentType === 'message/rfc822';

const partOf = (a: Attachment, index: number): MessagePart => ({
    id: String(index + 1),
    mime: (a.contentType || 'application/octet-stream').toLowerCase(),
    filename: a.filename || null,
    size: a.size ?? a.content?.length ?? 0,
    disposition: a.contentDisposition === 'inline' ? 'inline' : 'attachment',
    content_id: a.cid || null,
    status: 'skipped',
    reason: 'disabled',
});

/**
 * Parts of a message. Inline images of the HTML (multipart/related) are not parts: mailparser put them into the HTML
 * as data: URIs. Embedded messages (message/rfc822 sent as attachment, as Outlook and Gmail forward) are returned
 * separately; one sent inline mailparser already merged into the body, like an inline forward.
 */
const partsOf = (parsed: ParsedMail) => {
    const parts: Array<{ part: MessagePart; content: Buffer }> = [];
    const messages: Array<{ part_id: string; content: Buffer }> = [];
    const listed: MessagePart[] = [];               // not downloaded (placeholders): listed, nothing to store
    let skippedMessages = 0;
    parsed.attachments.forEach((a, i) => {
        const omitted = omission(a);
        if (omitted) {
            if (isMessage(a)) { skippedMessages++; return; }
            const part = partOf(a, i);
            part.size = omitted.size;
            if (omitted.reason === 'too_large') { part.status = 'too_large'; delete part.reason; }
            else part.reason = (['disabled', 'type', 'count'].includes(omitted.reason) ? omitted.reason : 'disabled') as MessagePart['reason'];
            listed.push(part);
            return;
        }
        if (a.related && a.contentType?.startsWith('image/')) return;
        if (isMessage(a)) messages.push({ part_id: String(i + 1), content: a.content });
        else parts.push({ part: partOf(a, i), content: a.content });
    });
    return { parts, messages, listed, skippedMessages };
};

const isBounce = (parsed: ParsedMail) => {
    const type = parsed.headers?.get('content-type') as any;
    return String(type?.value ?? type ?? '').toLowerCase() === 'multipart/report';
};

/** The structure of a parsed message and its embedded messages (one level), plus the bytes of all parts. */
export async function buildEmail(parsed: ParsedMail): Promise<BuiltEmail> {
    const envelope = envelopeOf(parsed);
    const renditions = renditionsOf(parsed);
    const { parts, messages, listed } = partsOf(parsed);
    const pending: PendingPart[] = [...parts];

    const embedded: EmbeddedMessage[] = [];
    for (const message of messages) {
        const inner = await parseMessage(message.content).catch(() => null);
        if (!inner) continue;
        const nested = partsOf(inner);
        pending.push(...nested.parts);
        embedded.push({
            kind: isBounce(parsed) ? 'bounced' : 'forwarded',
            part_id: message.part_id,
            envelope: envelopeOf(inner),
            renditions: renditionsOf(inner),
            parts: [...nested.parts.map((p) => p.part), ...nested.listed],
            embedded_skipped: nested.messages.length + nested.skippedMessages,
        });
    }

    const sections = [renditionText(renditions)];
    for (const m of embedded) {
        const from = m.envelope.from.map((a) => (a.name ? `${a.name} <${a.address}>` : a.address)).join(', ');
        const label = m.kind === 'bounced' ? 'Returned message' : 'Forwarded message';
        sections.push(`---------- ${label} ----------\nFrom: ${from} | Date: ${m.envelope.date ?? ''} | Subject: ${m.envelope.subject ?? ''}\n\n${renditionText(m.renditions)}`);
    }

    const refs = envelope.references ?? [];
    return {
        messageId: parsed.messageId || '',
        from: envelope.from[0]?.address || '',
        to: envelope.to[0]?.address || '',
        subject: envelope.subject || '',
        date: envelope.date || new Date().toISOString(),
        thread_id: refs[0] || envelope.in_reply_to || parsed.messageId || '',
        text: sections.filter(Boolean).join('\n\n'),
        content: { envelope, renditions, parts: [...parts.map((p) => p.part), ...listed], embedded },
        pending,
    };
}

// --- Attachment types ---------------------------------------------------------------------------------------------

/** Never stored, whatever the configuration says: the browser could run scripts in them. */
const NEVER = /^(image\/svg\+xml|text\/html|application\/xhtml\+xml|text\/xml|application\/xml|text\/javascript|application\/javascript)$/;
/** Types without magic bytes, accepted by their declared type when the content looks like text. */
const TEXT_TYPES = new Set(['text/csv', 'text/plain', 'text/calendar']);

/** Whether `mime` matches the allowlist (exact, or "type/*"). */
export const typeAllowed = (mime: string, allowed: string[]) => !NEVER.test(mime)
    && allowed.some((t) => t === mime || (t.endsWith('/*') && mime.startsWith(t.slice(0, -1))));

/** The type of the content as far as it can be checked: magic bytes, or text for text types; null when unknown. */
export const verifiedType = async (content: Buffer, declared: string): Promise<string | null> => {
    const detected = await fileTypeFromBuffer(content).catch(() => undefined);
    if (detected) return detected.mime;
    if (TEXT_TYPES.has(declared) && !content.subarray(0, 8192).includes(0)) return declared;
    return null;
};

export interface AttachmentRules {
    enabled: boolean;                               // limits.attachments.enabled
    max_mb: number;
    max_per_email: number;
    types: string[];
}

/**
 * The attachment decision, per part, in order: allowed at all (server and source), allowed type, size, count per
 * email, verified type (the content, not the sender's claim), storage quota. `store` keeps the bytes and returns the
 * file id; it throws a FileQuotaError when the owner's storage is full. Updates each part in place.
 */
export const storeAttachments = async (
    pending: PendingPart[],
    wanted: boolean,
    rules: AttachmentRules,
    store: (content: Buffer, mime: string, filename: string | null) => Promise<string>,
) => {
    let stored = 0;
    let quotaReached = false;
    const skip = (part: MessagePart, reason: MessagePart['reason']) => { part.status = 'skipped'; part.reason = reason; };
    for (const { part, content } of pending) {
        if (!rules.enabled || !wanted) { skip(part, 'disabled'); continue; }
        if (!typeAllowed(part.mime, rules.types)) { skip(part, 'type'); continue; }
        if (content.length > rules.max_mb * 1024 * 1024) { part.status = 'too_large'; delete part.reason; continue; }
        if (stored >= rules.max_per_email) { skip(part, 'count'); continue; }
        const mime = await verifiedType(content, part.mime);
        if (!mime || !typeAllowed(mime, rules.types)) { skip(part, 'mismatch'); continue; }
        try {
            const fileId = await store(content, mime, part.filename);
            Object.assign(part, { status: 'stored', mime, file_id: fileId });
            delete part.reason;
            stored++;
        } catch (err: any) {
            if (err?.name === 'FileQuotaError') { skip(part, 'quota'); quotaReached = true; continue; }
            part.status = 'failed';
            delete part.reason;
        }
    }
    return { quotaReached };
};
