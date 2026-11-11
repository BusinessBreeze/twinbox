import { h, ref, shallowRef, defineComponent, onBeforeUnmount, type PropType, type VNode } from 'vue';
import { useI18n } from 'vue-i18n';
import { VChip, VDivider, VBtn } from 'vuetify/components';
import { limits } from '#shared/limits';
import { MESSAGE_RECORD_MIME, formatAddresses, type EmailRecord, type MessageEnvelope, type MessagePart, type MessageRendition } from '#shared/types/email';
import { MediaRenderer, formatSize, type MediaData } from './renderer';
import { HtmlRenderer } from './html';
import { TextRenderer } from './text';
import { rendererFor } from './index';

interface Row { key: string; value: string; mono?: boolean }
/** One way to read the message: the automation text, or one of its renditions. */
interface Body { key: string; label?: string; mime: string; bytes: number; safe: string; cut?: number }
interface SafeMessage {
    id?: string;                                    // the record (top level only): for "remove attachments"
    headers: Row[];
    bodies: Body[];
    attachments: MessagePart[];
    embedded: Array<{ kind: 'forwarded' | 'bounced'; subject: string; message: SafeMessage }>;
    skipped: number;                                // embedded messages nested deeper, not followed
}

const html = new HtmlRenderer();
const text = new TextRenderer();
const bytes = (s: string) => new TextEncoder().encode(s).length;
const fileUrl = (id: string) => `/api/v0.1/app/files/${encodeURIComponent(id)}`;

const headersOf = (envelope: MessageEnvelope): Row[] => [
    { key: 'from', value: formatAddresses(envelope.from) },
    { key: 'to', value: formatAddresses(envelope.to) },
    { key: 'cc', value: formatAddresses(envelope.cc) },
    { key: 'reply_to', value: formatAddresses(envelope.reply_to) },
    { key: 'subject', value: envelope.subject ?? '' },
    { key: 'date', value: envelope.date && !Number.isNaN(Date.parse(envelope.date)) ? new Date(envelope.date).toLocaleString() : envelope.date ?? '' },
    { key: 'message_id', value: envelope.message_id ?? '', mono: true },
].filter((row) => row.value);

const renditionBodies = async (renditions: MessageRendition[]): Promise<Body[]> => Promise.all(renditions.map(async (r) => ({
    key: r.mime,
    mime: r.mime,
    bytes: r.size,
    safe: r.mime === 'text/html' ? await html.sanitize(r.content) : await text.sanitize(r.content),
})));

const messageOf = async (envelope: MessageEnvelope, renditions: MessageRendition[], parts: MessagePart[], skipped: number): Promise<SafeMessage> => ({
    headers: headersOf(envelope),
    bodies: await renditionBodies(renditions),
    attachments: parts,
    embedded: [],
    skipped,
});

/**
 * A stored email record (application/vnd.twinbox.message+json): its headers, then what automations read ("automation
 * text", with a mark where they stop reading), with one chip per rendition (HTML, text), per forwarded message and per
 * attachment. Each is sanitized and rendered by the renderer of its own type; attachments are fetched when chosen.
 * Download is the server's .eml (MediaViewer's download-url), not this JSON.
 */
export class MessageRenderer extends MediaRenderer<SafeMessage> {
    get mimeTypes() { return [MESSAGE_RECORD_MIME]; }

    get icon() { return 'mdi-email-outline'; }

    extension() { return 'json'; }

    async sanitize(data: MediaData): Promise<SafeMessage> {
        const record = JSON.parse(await this.text(data)) as EmailRecord;
        const content = record.content ?? {
            envelope: { from: [{ name: null, address: record.from }], to: [{ name: null, address: record.to }], cc: [], reply_to: [], subject: record.subject ?? '', date: record.date ?? undefined, message_id: record.messageId },
            renditions: [], parts: [], embedded: [],
        };
        const message = await messageOf(content.envelope, content.renditions, content.parts, 0);
        message.id = record.id;

        // First: what automations read. The text/plain rendition is left out when it says the same.
        const automation = await text.sanitize(record.text ?? '');
        const plain = content.renditions.find((r) => r.mime === 'text/plain');
        if (plain && plain.content.trim() === (record.text ?? '').trim()) message.bodies = message.bodies.filter((b) => b.mime !== 'text/plain');
        message.bodies.unshift({ key: 'automation', label: 'automation_text', mime: 'text/plain', bytes: bytes(automation), safe: automation, cut: limits.llm.max_input_chars });

        for (const m of content.embedded ?? []) {
            message.embedded.push({ kind: m.kind, subject: m.envelope.subject ?? '', message: await messageOf(m.envelope, m.renditions, m.parts, m.embedded_skipped) });
        }
        return message;
    }

    render(safe: SafeMessage) {
        return h(MessageView, { message: safe });
    }
}

type Shown = { kind: 'body' | 'embedded' | 'attachment'; index: number };

/** An attachment, fetched from the file route when chosen and shown by its type's renderer (or offered as download). */
const AttachmentView = defineComponent({
    props: { part: { type: Object as PropType<MessagePart>, required: true } },
    setup(props) {
        const { t } = useI18n();
        const body = shallowRef<(() => VNode) | null>(null);
        const state = ref<'loading' | 'shown' | 'none' | 'failed'>('loading');
        let release = () => {};
        (async () => {
            const renderer = rendererFor(props.part.mime);
            if (!renderer || renderer instanceof MessageRenderer) { state.value = 'none'; return; }
            try {
                const blob = await $fetch<Blob>(fileUrl(props.part.file_id!), { responseType: 'blob' });
                const safe = await renderer.sanitize(blob, props.part.mime);
                release = () => renderer.release(safe);
                body.value = () => renderer.render(safe);
                state.value = 'shown';
            } catch {
                state.value = 'failed';
            }
        })();
        onBeforeUnmount(() => release());
        return () => h('div', [
            state.value === 'shown' && body.value ? body.value() : null,
            state.value === 'loading' ? h('div', { class: 'text-body-2 text-medium-emphasis text-center py-6' }, '…') : null,
            state.value !== 'shown' && state.value !== 'loading'
                ? h('div', { class: 'text-body-2 text-medium-emphasis text-center py-6' }, t(state.value === 'none' ? 'media_viewer.email.no_preview' : 'media_viewer.email.load_failed'))
                : null,
            h('div', { class: 'd-flex justify-center mt-2' }, h(VBtn, {
                variant: 'text', size: 'small', color: 'primary', prependIcon: 'mdi-download', href: fileUrl(props.part.file_id!),
            }, () => props.part.filename || t('media_viewer.download'))),
        ]);
    },
});

const MessageView: any = defineComponent({
    name: 'MessageView',
    props: { message: { type: Object as PropType<SafeMessage>, required: true } },
    setup(props) {
        const { t } = useI18n();
        const shown = ref<Shown>({ kind: 'body', index: 0 });
        const is = (kind: Shown['kind'], index: number) => shown.value.kind === kind && shown.value.index === index;

        const chip = (selected: boolean, label: string, onClick: (() => void) | null, icon?: string, title?: string) => h(VChip, {
            class: 'media-viewer__part',
            size: 'small',
            color: selected ? 'primary' : undefined,
            variant: selected ? 'flat' : 'outlined',
            disabled: !onClick,
            prependIcon: icon,
            title,
            onClick: onClick ?? undefined,
        }, () => label);

        const bodyView = (b: Body) => {
            if (b.mime === 'text/html') return html.render(b.safe);
            if (b.cut == null || b.safe.length <= b.cut) return text.render(b.safe);
            // Mark where automations stop reading (limits.llm.max_input_chars); the rest stays readable, dimmed
            return h('div', { class: 'media-viewer__automation' }, [
                text.render(b.safe.slice(0, b.cut)),
                h('div', { class: 'd-flex align-center ga-2 my-2 media-viewer__cut' }, [
                    h(VDivider, { class: 'border-opacity-50', color: 'warning' }),
                    h('span', { class: 'text-caption text-warning text-no-wrap' }, t('media_viewer.email.cut')),
                    h(VDivider, { class: 'border-opacity-50', color: 'warning' }),
                ]),
                h('div', { class: 'text-medium-emphasis' }, text.render(b.safe.slice(b.cut))),
            ]);
        };

        const reason = (p: MessagePart) => t(`media_viewer.email.status.${p.status === 'skipped' ? `skipped_${p.reason ?? 'disabled'}` : p.status}`);

        // Remove attachments, keep the email (top level only; the forwarded messages' attachments go with it)
        const stored = () => [props.message, ...props.message.embedded.map((m) => m.message)].flatMap((m) => m.attachments).filter((p) => p.status === 'stored');
        const confirming = ref(false);
        const removing = ref(false);
        const version = ref(0);                     // parts are changed in place: re-render
        const removeAttachments = async () => {
            removing.value = true;
            try {
                await $fetch(`/api/v0.1/app/email/${encodeURIComponent(props.message.id!)}/remove_attachments`, { method: 'POST' });
                for (const p of stored()) { p.status = 'removed'; delete p.file_id; }
                if (shown.value.kind === 'attachment') shown.value = { kind: 'body', index: 0 };
                confirming.value = false;
                version.value++;
            } finally {
                removing.value = false;
            }
        };
        const removeBar = () => {
            const count = stored().length;
            if (!props.message.id || count === 0) return null;
            if (!confirming.value) {
                return h('div', { class: 'd-flex justify-end mb-2' }, h(VBtn, {
                    variant: 'text', size: 'small', color: 'error', prependIcon: 'mdi-paperclip-off', class: 'media-viewer__remove',
                    onClick: () => { confirming.value = true; },
                }, () => t('media_viewer.email.remove_attachments')));
            }
            return h('div', { class: 'd-flex align-center justify-end ga-2 mb-2 media-viewer__remove-confirm' }, [
                h('span', { class: 'text-body-2' }, t('media_viewer.email.remove_confirm', { count })),
                h(VBtn, { variant: 'text', size: 'small', onClick: () => { confirming.value = false; } }, () => t('form.cancel')),
                h(VBtn, { variant: 'flat', size: 'small', color: 'error', loading: removing.value, onClick: removeAttachments }, () => t('media_viewer.email.remove')),
            ]);
        };

        return () => {
            void version.value;
            const { headers, bodies, attachments, embedded, skipped } = props.message;
            const current = shown.value;
            let view: VNode | null = null;
            if (current.kind === 'body' && bodies[current.index]) view = bodyView(bodies[current.index]!);
            if (current.kind === 'embedded' && embedded[current.index]) {
                view = h('div', { class: 'border rounded pa-3' }, h(MessageView, { message: embedded[current.index]!.message, key: `embedded-${current.index}` }));
            }
            if (current.kind === 'attachment' && attachments[current.index]) view = h(AttachmentView, { part: attachments[current.index]!, key: `attachment-${current.index}` });

            return h('div', [
                h('div', { class: 'd-flex flex-column ga-1 mb-3' }, headers.map((row) => h('div', { class: 'd-flex align-baseline' }, [
                    h('span', { class: 'text-caption text-uppercase text-medium-emphasis font-weight-medium me-2 flex-shrink-0', style: 'min-width: 100px;' }, `${t(`media_viewer.email.${row.key}`)}:`),
                    row.mono
                        ? h('code', { class: 'text-caption', style: 'word-break: break-all;' }, row.value)
                        : h('span', { class: 'text-body-2', style: 'word-break: break-word;' }, row.value),
                ]))),
                h('div', { class: 'd-flex flex-wrap ga-2 mb-3' }, [
                    ...bodies.map((b, i) => chip(is('body', i), `${b.label ? t(`media_viewer.email.${b.label}`) : b.mime} · ${formatSize(b.bytes)}`, () => { shown.value = { kind: 'body', index: i }; })),
                    ...embedded.map((m, i) => chip(is('embedded', i), `${t(`media_viewer.email.${m.kind}`)}: ${m.subject || t('table.email.no_subject')}`, () => { shown.value = { kind: 'embedded', index: i }; }, 'mdi-email-arrow-right-outline')),
                    ...attachments.map((p, i) => chip(
                        is('attachment', i),
                        `${p.filename || p.mime} · ${formatSize(p.size)}`,
                        p.status === 'stored' && p.file_id ? () => { shown.value = { kind: 'attachment', index: i }; } : null,
                        'mdi-paperclip',
                        p.status === 'stored' ? p.mime : reason(p),
                    )),
                ]),
                removeBar(),
                attachments.some((p) => p.status !== 'stored')
                    ? h('div', { class: 'text-caption text-medium-emphasis mb-3' }, [...new Set(attachments.filter((p) => p.status !== 'stored').map(reason))].join(' · '))
                    : null,
                skipped ? h('div', { class: 'text-caption text-medium-emphasis mb-3' }, t('media_viewer.email.embedded_skipped', { count: skipped })) : null,
                view ?? h('div', { class: 'text-body-2 text-medium-emphasis text-center py-6' }, t('media_viewer.email.no_body')),
            ]);
        };
    },
});
