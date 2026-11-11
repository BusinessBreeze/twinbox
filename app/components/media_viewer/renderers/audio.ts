import { h } from 'vue';
import { MediaRenderer, type MediaData } from './renderer';

const EXTENSIONS: Record<string, string> = {
    'audio/mpeg': 'mp3', 'audio/wav': 'wav', 'audio/ogg': 'ogg', 'audio/mp4': 'm4a', 'audio/aac': 'aac', 'audio/flac': 'flac', 'audio/webm': 'webm',
};

/** Audio, with the browser's player. The data is the file as a Blob; the player gets a local object URL of it. */
export class AudioRenderer extends MediaRenderer {
    get mimeTypes() { return ['audio/*']; }

    get icon() { return 'mdi-music-note'; }

    extension(mime: string) { return EXTENSIONS[mime.split(';')[0]!] ?? 'audio'; }

    sanitize(data: MediaData, mime: string) {
        if (typeof data === 'string') throw new Error('media_viewer: audio must be given as a Blob');
        return URL.createObjectURL(new Blob([data], { type: mime }));
    }

    render(safe: string) {
        return h('div', { class: 'd-flex flex-column align-center py-6' }, [
            h('i', { class: 'mdi mdi-music-note text-primary mb-4', style: 'font-size: 64px;' }),
            h('audio', { controls: true, class: 'w-100', style: 'max-width: 500px;', src: safe }),
        ]);
    }

    release(safe: string) {
        if (safe.startsWith('blob:')) URL.revokeObjectURL(safe);
    }
}
