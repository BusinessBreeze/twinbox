import type { VNode } from 'vue';

/** What the viewer is given to show: text, or a file's bytes. */
export type MediaData = string | Blob;

/**
 * One way of showing content. The viewer picks the first renderer whose `mimeTypes` match, runs `sanitize` on the
 * data once and then `render` on the result. Subclasses live next to this file and are listed in ./index.ts.
 */
export abstract class MediaRenderer<Safe = string> {
    /** Mime types this renderer shows; `type/*` matches a whole family (e.g. `audio/*`). */
    abstract get mimeTypes(): string[];

    /** Icon in the viewer's header (mdi name). */
    get icon(): string { return 'mdi-file-outline'; }

    /** File extension for a download of this type, without the dot. */
    extension(mime: string): string {
        return mime.split('/')[1]?.split(/[+;]/)[0] || 'bin';
    }

    /** Makes the data safe to show (strips scripts, refuses what isn't this type). */
    abstract sanitize(data: MediaData, mime: string): Safe | Promise<Safe>;

    /** The sanitized content as a VNode, inside the viewer's body. */
    abstract render(safe: Safe): VNode;

    /** Frees what `sanitize` allocated (object URLs); called when the content changes or the viewer closes. */
    release(_safe: Safe): void {}

    handles(mime: string): boolean {
        const type = mime.split(';')[0]!.trim().toLowerCase();
        return this.mimeTypes.some((m) => m === type || (m.endsWith('/*') && type.startsWith(m.slice(0, -1))));
    }

    /** The data as text. */
    protected async text(data: MediaData): Promise<string> {
        return typeof data === 'string' ? data : data.text();
    }
}

/** A byte count for people (1.2 MB). */
export const formatSize = (bytes: number) => {
    const units = ['B', 'KB', 'MB', 'GB'];
    const i = Math.min(units.length - 1, Math.floor(Math.log(Math.max(bytes, 1)) / Math.log(1024)));
    return `${(bytes / 1024 ** i).toLocaleString(undefined, { maximumFractionDigits: i ? 1 : 0 })} ${units[i]}`;
};
