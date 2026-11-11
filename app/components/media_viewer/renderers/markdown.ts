import { h } from 'vue';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { MediaRenderer, type MediaData } from './renderer';

/** Markdown, as formatted text (styles: `.markdown-body` in media_viewer.vue). Raw HTML in it is cleaned of scripts. */
export class MarkdownRenderer extends MediaRenderer {
    get mimeTypes() { return ['text/markdown', 'text/x-markdown']; }

    get icon() { return 'mdi-language-markdown-outline'; }

    extension() { return 'md'; }

    async sanitize(data: MediaData) {
        const html = marked.parse(await this.text(data), { async: false, breaks: true }) as string;
        return DOMPurify.sanitize(html, { FORBID_TAGS: ['form', 'style'] });
    }

    render(safe: string) {
        return h('div', { class: 'markdown-body pa-2', innerHTML: safe });
    }
}
