// The file store: every stored binary is a `files` row (owner, mime, size, hash) plus a blob on disk
// (./files_storage.ts). This module is the only code that touches either; records (artifacts, email parts) reference
// files by id. Every lookup is scoped to the owner, so another user's file is "not found", never "forbidden".
// Same bytes for the same owner are stored once; never shared across owners. See docs/specs/SPEC_attachments.md.
//
// Consistency without cross-store transactions: the blob is written before its row, and a row before the record that
// references it. Whatever a failure leaves behind (a blob without a row, a row without a reference) is removed by
// sweep() after an hour.
import { createHash } from 'node:crypto';
import { db } from 'hub:db';
import { accounts } from 'hub:db:schema';
import { and, eq, inArray, lt, notInArray, sum } from 'drizzle-orm';
import { artifacts, files } from '#server/db/schema';
import { fileIdsReferencedByEmails } from '#server/db/email_content';
import { limits } from '#shared/limits';
import * as storage from './files_storage';

export type FileRow = typeof files.$inferSelect;

/** Thrown by create() when the owner's files would exceed limits.files.max_user_mb. */
export class FileQuotaError extends Error {
    override name = 'FileQuotaError';
}

const GRACE_MS = 60 * 60 * 1000;
const MB = 1024 * 1024;

const sha256 = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');

/** Of `ids`, those still referenced by a record: an artifact, or a part of an email (or of an embedded message). */
const referenced = async (ids: string[]): Promise<Set<string>> => {
    const found = new Set<string>();
    for (let i = 0; i < ids.length; i += 500) {
        const chunk = ids.slice(i, i + 500);
        const rows = await db.select({ id: artifacts.file_id }).from(artifacts).where(inArray(artifacts.file_id, chunk));
        for (const r of rows) found.add(r.id);
        for (const id of await fileIdsReferencedByEmails(chunk)) found.add(id);
    }
    return found;
};

const deleteRows = async (rows: Pick<FileRow, 'id' | 'storage_key'>[]) => {
    for (let i = 0; i < rows.length; i += 500) {
        const chunk = rows.slice(i, i + 500);
        await db.delete(files).where(inArray(files.id, chunk.map((r) => r.id)));
        for (const row of chunk) await storage.remove(row.storage_key);
    }
};

export const fileService = {
    /** Stores the bytes for the owner; returns the existing file when the owner already has the same bytes. */
    async create(ownerId: string, bytes: Buffer, meta: { mime: string; filename?: string | null }): Promise<FileRow> {
        const hash = sha256(bytes);
        const same = () => db.select().from(files).where(and(eq(files.owner_id, ownerId), eq(files.sha256, hash))).get();
        const existing = await same();
        if (existing) return existing;

        if ((await this.usage(ownerId)) + bytes.length > limits.files.max_user_mb * MB) {
            throw new FileQuotaError(`Storage quota of ${limits.files.max_user_mb} MB reached`);
        }

        const key = await storage.put(bytes);
        try {
            return await db.insert(files).values({
                id: crypto.randomUUID(),
                owner_id: ownerId,
                storage_key: key,
                mime: meta.mime,
                size: bytes.length,
                sha256: hash,
                filename: meta.filename || null,
            }).returning().get();
        } catch (err) {
            // The same bytes stored concurrently: keep that one
            await storage.remove(key);
            const raced = await same();
            if (raced) return raced;
            throw err;
        }
    },

    async get(ownerId: string, id: string): Promise<FileRow | undefined> {
        if (!ownerId || !id) return undefined;
        return db.select().from(files).where(and(eq(files.id, id), eq(files.owner_id, ownerId))).get();
    },

    /** The file and a stream of its bytes; null when it doesn't exist or isn't the owner's. */
    async open(ownerId: string, id: string) {
        const file = await this.get(ownerId, id);
        return file ? { file, stream: storage.read(file.storage_key) } : null;
    },

    async read(ownerId: string, id: string): Promise<Buffer | null> {
        const opened = await this.open(ownerId, id);
        if (!opened) return null;
        const chunks: Buffer[] = [];
        for await (const chunk of opened.stream) chunks.push(chunk as Buffer);
        return Buffer.concat(chunks);
    },

    /** Bytes stored for the owner. */
    async usage(ownerId: string): Promise<number> {
        const row = await db.select({ total: sum(files.size) }).from(files).where(eq(files.owner_id, ownerId)).get();
        return Number(row?.total ?? 0);
    },

    /** Deletes those of the owner's files in `ids` that no record references any more (call after deleting records). */
    async release(ownerId: string, ids: string[]) {
        const unique = [...new Set(ids.filter(Boolean))];
        if (unique.length === 0) return;
        const rows = await db.select({ id: files.id, storage_key: files.storage_key }).from(files)
            .where(and(eq(files.owner_id, ownerId), inArray(files.id, unique)));
        const used = await referenced(rows.map((r) => r.id));
        await deleteRows(rows.filter((r) => !used.has(r.id)));
    },

    /**
     * Removes leftovers older than an hour: files of deleted accounts (and their artifacts), files no record references,
     * blobs without a row. Returns what it removed.
     */
    async sweep() {
        const cutoff = new Date(Date.now() - GRACE_MS);
        const owners = (await db.select({ id: accounts.id }).from(accounts)).map((a) => a.id);

        // Records of deleted accounts are not deleted here (emails stay as before); their files are.
        // No accounts at all is a fresh or broken database, not a reason to delete everything
        const orphaned = owners.length === 0 ? [] : await db.select({ id: files.id, storage_key: files.storage_key })
            .from(files).where(notInArray(files.owner_id, owners));
        if (owners.length) await db.delete(artifacts).where(notInArray(artifacts.owner_id, owners));
        await deleteRows(orphaned);

        const old = await db.select({ id: files.id, storage_key: files.storage_key }).from(files).where(lt(files.createdAt, cutoff));
        const used = await referenced(old.map((r) => r.id));
        const unreferenced = old.filter((r) => !used.has(r.id));
        await deleteRows(unreferenced);

        const keys = new Set((await db.select({ key: files.storage_key }).from(files)).map((r) => r.key));
        let blobs = 0;
        for await (const blob of storage.list()) {
            if (!keys.has(blob.key) && blob.mtimeMs < cutoff.getTime()) {
                await storage.removePath(blob.path);
                blobs++;
            }
        }
        return { orphaned: orphaned.length, unreferenced: unreferenced.length, blobs };
    },
};
