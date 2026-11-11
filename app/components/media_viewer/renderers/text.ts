import { h } from 'vue';
import { MediaRenderer, type MediaData } from './renderer';

/** Plain text, line breaks kept. Vue escapes it, so sanitizing only reads it and drops control characters. */
export class TextRenderer extends MediaRenderer {
    get mimeTypes() { return ['text/plain', 'text/csv', 'application/json']; }

    get icon() { return 'mdi-file-document-outline'; }

    extension(mime: string) {
        return { 'text/csv': 'csv', 'application/json': 'json' }[mime.split(';')[0]!] ?? 'txt';
    }

    async sanitize(data: MediaData) {
        return (await this.text(data)).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
    }

    render(safe: string) {
        return h('pre', { class: 'text-body-2 pa-2', style: 'white-space: pre-wrap; word-break: break-word; font-family: inherit;' }, safe);
    }
}
