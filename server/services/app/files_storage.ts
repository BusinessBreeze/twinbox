// Blob storage on local disk: <FILES_DIR>/<storage_key>, FILES_DIR defaults to <APP_DATA_DIR>/files.
// Keys are generated here (32 random hex characters, the first two as a folder), never taken from input, so nothing
// a sender chose reaches the filesystem. Only server/services/app/files.ts uses this module.
import { createReadStream } from 'node:fs';
import { mkdir, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { join, resolve } from 'node:path';

const KEY = /^[0-9a-f]{2}\/[0-9a-f]{32}$/;

export const filesDir = () => resolve(process.env.FILES_DIR || join(process.env.APP_DATA_DIR || '.data', 'files'));

const pathOf = (key: string) => {
    if (!KEY.test(key)) throw new Error(`Invalid storage key: ${key}`);
    return join(filesDir(), key);
};

/** Writes the bytes under a new key (temp file, then rename: a reader never sees a partial blob). */
export const put = async (bytes: Buffer): Promise<string> => {
    const hex = randomBytes(16).toString('hex');
    const key = `${hex.slice(0, 2)}/${hex}`;
    const path = pathOf(key);
    await mkdir(join(filesDir(), hex.slice(0, 2)), { recursive: true });
    await writeFile(`${path}.tmp`, bytes);
    await rename(`${path}.tmp`, path);
    return key;
};

export const read = (key: string) => createReadStream(pathOf(key));

export const remove = async (key: string) => {
    await rm(pathOf(key), { force: true });
};

/** Every blob (and leftover temp file) with its modification time, for the sweeper. */
export async function* list(): AsyncGenerator<{ key: string; path: string; mtimeMs: number }> {
    const root = filesDir();
    let folders: string[];
    try {
        folders = await readdir(root);
    } catch {
        return;
    }
    for (const folder of folders.filter((f) => /^[0-9a-f]{2}$/.test(f))) {
        for (const name of await readdir(join(root, folder)).catch(() => [] as string[])) {
            const path = join(root, folder, name);
            const info = await stat(path).catch(() => null);
            if (info?.isFile()) yield { key: `${folder}/${name}`, path, mtimeMs: info.mtimeMs };
        }
    }
}

/** Removes a listed path (also temp files, whose names are not valid keys). */
export const removePath = async (path: string) => {
    if (!path.startsWith(filesDir())) throw new Error(`Not in the files folder: ${path}`);
    await rm(path, { force: true });
};
