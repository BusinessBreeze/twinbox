import { h, ref, defineComponent, type PropType } from 'vue';
import { useI18n } from 'vue-i18n';
import { VChip } from 'vuetify/components';
import PostalMime, { type Address } from 'postal-mime';
import { MediaRenderer, formatSize, type MediaData } from './renderer';
import { HtmlRenderer } from './html';
import { TextRenderer } from './text';

interface Part { mime: string; bytes: number; safe: string }
interface SafeEmail { headers: Array<{ key: string; value: string; mono?: boolean }>; parts: Part[] }

const html = new HtmlRenderer();
const text = new TextRenderer();
const PART_RENDERERS: Record<string, MediaRenderer> = { 'text/html': html, 'text/plain': text };

const addresses = (list?: Address | Address[]) => (list ? [list].flat() : [])
    .flatMap((a) => (a.group ? a.group : [a]))
    .map((m) => (m.name ? `${m.name} <${m.address}>` : m.address))
    .join(', ');

/**
 * A whole email (`message/rfc822`): its headers, then one of its bodies with a chip per body part (HTML, text) to
 * switch between them. Each part is sanitized and rendered by the renderer of its own type.
 */
export class EmailRenderer extends MediaRenderer<SafeEmail> {
    get mimeTypes() { return ['message/rfc822']; }

    get icon() { return 'mdi-email-outline'; }

    extension() { return 'eml'; }

    async sanitize(data: MediaData): Promise<SafeEmail> {
        const raw = await this.text(data);
        const email = await PostalMime.parse(raw);
        const headers = [
            { key: 'from', value: addresses(email.from) },
            { key: 'to', value: addresses(email.to) },
            { key: 'cc', value: addresses(email.cc) },
            { key: 'reply_to', value: addresses(email.replyTo) },
            { key: 'subject', value: email.subject ?? '' },
            { key: 'date', value: email.date && !Number.isNaN(Date.parse(email.date)) ? new Date(email.date).toLocaleString() : email.date ?? '' },
            { key: 'message_id', value: email.messageId ?? '', mono: true },
        ].filter((row) => row.value);

        // postal-mime makes up a missing text or HTML version from the other: only list the parts the message has
        const has = (mime: string) => new RegExp(`^content-type:\\s*${mime.replace('/', '\\/')}`, 'im').test(raw)
            || (mime === 'text/plain' && !/^content-type:/im.test(raw));   // no type at all: plain text
        const parts: Part[] = [];
        for (const [mime, body] of [['text/html', email.html], ['text/plain', email.text]] as const) {
            if (!body || !has(mime)) continue;
            parts.push({ mime, bytes: new TextEncoder().encode(body).length, safe: await PART_RENDERERS[mime]!.sanitize(body, mime) as string });
        }
        return { headers, parts };
    }

    render(safe: SafeEmail) {
        return h(EmailView, { email: safe });
    }
}

const EmailView = defineComponent({
    props: { email: { type: Object as PropType<SafeEmail>, required: true } },
    setup(props) {
        const { t } = useI18n();
        const shown = ref(0);   // the HTML part when there is one
        return () => {
            const { headers, parts } = props.email;
            const part = parts[shown.value];
            return h('div', [
                h('div', { class: 'd-flex flex-column ga-1 mb-3' }, headers.map((row) => h('div', { class: 'd-flex align-baseline' }, [
                    h('span', { class: 'text-caption text-uppercase text-medium-emphasis font-weight-medium me-2 flex-shrink-0', style: 'min-width: 100px;' }, `${t(`media_viewer.email.${row.key}`)}:`),
                    row.mono
                        ? h('code', { class: 'text-caption', style: 'word-break: break-all;' }, row.value)
                        : h('span', { class: 'text-body-2', style: 'word-break: break-word;' }, row.value),
                ]))),
                // One chip per body part, with its type and size
                parts.length > 0 && h('div', { class: 'd-flex flex-wrap ga-2 mb-3' }, parts.map((p, i) => h(VChip, {
                    class: 'media-viewer__part',
                    size: 'small',
                    color: i === shown.value ? 'primary' : undefined,
                    variant: i === shown.value ? 'flat' : 'outlined',
                    onClick: () => { shown.value = i; },
                }, () => `${p.mime} · ${formatSize(p.bytes)}`))),
                part
                    ? PART_RENDERERS[part.mime]!.render(part.safe)
                    : h('div', { class: 'text-body-2 text-medium-emphasis text-center py-6' }, t('media_viewer.email.no_body')),
            ]);
        };
    },
});
