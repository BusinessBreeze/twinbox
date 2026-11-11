import { h } from 'vue';
import DOMPurify from 'dompurify';
import { MediaRenderer, type MediaData } from './renderer';

// Nothing is loaded from elsewhere (tracking pixels, remote images, fonts, stylesheets): only embedded data: images.
// Links open in a new tab; the page's own font and colors unless the HTML sets its own
const CSP = "default-src 'none'; img-src data: blob:; media-src data: blob:; style-src 'unsafe-inline'; font-src data:";
const HEAD = `<meta http-equiv="Content-Security-Policy" content="${CSP}"><base target="_blank"><style>body{margin:0;padding:12px;font-family:Roboto,sans-serif;font-size:14px;line-height:1.6;word-break:break-word}img{max-width:100%;height:auto}</style>`;

/**
 * HTML documents (an email's HTML part, reports). Shown in a sandboxed iframe: no scripts, no forms, and its styles can't reach the
 * app. Scripts, event handlers and form fields are also stripped before, so nothing runs even if the sandbox were loosened. Remote
 * content is blocked by the frame's CSP, so opening an email doesn't tell its sender (tracking pixels).
 */
export class HtmlRenderer extends MediaRenderer {
    get mimeTypes() { return ['text/html', 'application/xhtml+xml']; }

    get icon() { return 'mdi-language-html5'; }

    extension() { return 'html'; }

    async sanitize(data: MediaData) {
        const clean = DOMPurify.sanitize(await this.text(data), { WHOLE_DOCUMENT: true, FORBID_TAGS: ['form', 'input', 'textarea', 'select', 'button', 'base'] });
        return /<head>/i.test(clean) ? clean.replace(/<head>/i, `<head>${HEAD}`) : HEAD + clean;
    }

    render(safe: string) {
        return h('iframe', {
            class: 'media-viewer__frame border rounded',
            srcdoc: safe,
            // Same origin only so the viewer can read the height; without allow-scripts nothing in it runs
            sandbox: 'allow-same-origin allow-popups allow-popups-to-escape-sandbox',
            referrerpolicy: 'no-referrer',
            onLoad: (e: Event) => {
                const frame = e.target as HTMLIFrameElement;
                const doc = frame.contentDocument;
                if (doc) frame.style.height = `${doc.documentElement.scrollHeight}px`;
            },
        });
    }
}
