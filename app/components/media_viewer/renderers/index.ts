import type { MediaRenderer } from './renderer';
import { EmailRenderer } from './email';
import { MessageRenderer } from './message';
import { HtmlRenderer } from './html';
import { MarkdownRenderer } from './markdown';
import { TextRenderer } from './text';
import { AudioRenderer } from './audio';

export { MediaRenderer, formatSize, type MediaData } from './renderer';

// Checked in order; the first that handles a mime type shows it
const renderers: MediaRenderer<any>[] = [new MessageRenderer(), new EmailRenderer(), new HtmlRenderer(), new MarkdownRenderer(), new TextRenderer(), new AudioRenderer()];

/** Adds a renderer (an app's own types); it is asked before the built-in ones. */
export function registerRenderer(renderer: MediaRenderer<any>) {
    renderers.unshift(renderer);
}

/** The renderer for a mime type, or undefined if none shows it. */
export function rendererFor(mime: string): MediaRenderer<any> | undefined {
    return renderers.find((r) => r.handles(mime));
}

// Mime types of common file extensions, for content that comes as a file name (artifacts)
const BY_EXTENSION: Record<string, string> = {
    eml: 'message/rfc822', html: 'text/html', htm: 'text/html', md: 'text/markdown', markdown: 'text/markdown', txt: 'text/plain', csv: 'text/csv', json: 'application/json',
    mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', m4a: 'audio/mp4', aac: 'audio/aac', flac: 'audio/flac', webm: 'audio/webm',
};

/** The mime type for a file name, by its extension (`application/octet-stream` if unknown). */
export function mimeFromName(name: string): string {
    return BY_EXTENSION[name.split('.').pop()?.toLowerCase() ?? ''] ?? 'application/octet-stream';
}
