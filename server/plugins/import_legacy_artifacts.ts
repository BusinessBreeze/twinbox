// One-off at boot: artifacts the old local channel wrote as plain files (<LOCAL_ARTIFACTS_DIR or ./Artifacts>/<userId>/*)
// become artifacts in the file store. A marker file (.imported) in the folder then makes later starts skip it; the
// folder is not renamed (in Docker it is a mounted volume) and nothing is deleted. Remove this plugin once no
// installation has such a folder.
import { existsSync } from 'node:fs';
import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { artifactService } from '#server/services/app/artifacts';
import { emitTelemetryEvent, EventScope, EventLevel } from '#bs/utils/telemetry/event';

const MIME: Record<string, string> = {
    md: 'text/markdown', txt: 'text/plain', html: 'text/html', json: 'application/json', csv: 'text/csv',
    mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', m4a: 'audio/mp4', flac: 'audio/flac',
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', pdf: 'application/pdf',
};

const importFolder = async (dir: string) => {
    let count = 0;
    for (const owner of await readdir(dir, { withFileTypes: true })) {
        if (!owner.isDirectory()) continue;
        for (const name of await readdir(join(dir, owner.name))) {
            const path = join(dir, owner.name, name);
            const info = await stat(path);
            if (!info.isFile()) continue;
            await artifactService.create(owner.name, {
                bytes: await readFile(path),
                mime: MIME[extname(name).slice(1).toLowerCase()] || 'application/octet-stream',
                filename: name,
            });
            count++;
        }
    }
    return count;
};

export default defineNitroPlugin(async () => {
    const dir = resolve(process.env.LOCAL_ARTIFACTS_DIR || 'Artifacts');
    const marker = join(dir, '.imported');
    if (!existsSync(dir) || existsSync(marker)) return;
    try {
        const count = await importFolder(dir);
        await writeFile(marker, `Imported into the file store on ${new Date().toISOString()}; this folder is no longer used.\n`);
        await emitTelemetryEvent({ scope: EventScope.SYSTEM, level: EventLevel.INFO, category: 'files', message: `Imported ${count} artifacts from ${dir}` });
    } catch (err: any) {
        // No marker: the next start tries again (the bytes are deduplicated, their artifact records may repeat)
        await emitTelemetryEvent({ scope: EventScope.SYSTEM, level: EventLevel.ERROR, category: 'files', message: `Importing artifacts from ${dir} failed: ${err?.message || err}` });
    }
});
