// Artifacts: what automations produced and delivered to the local channel (or a test run wrote). Each is a record
// pointing at a file of the file store; deleting artifacts releases their files. Every call is scoped to the owner.
import { db } from 'hub:db';
import { and, desc, eq, gte, inArray, lt, notInArray } from 'drizzle-orm';
import { artifacts, automations, files } from '#server/db/schema';
import { fileService } from './files';
import { notifyUser } from '#bs/utils/user_stream';

export interface NewArtifact {
    bytes: Buffer;
    mime: string;
    filename: string;
    label?: string | null;
    automationId?: string | null;
    sourceRefs?: string[];
}

/** One artifact as the API returns it: the record plus its file's type and size. */
const columns = {
    id: artifacts.id,
    file_id: artifacts.file_id,
    automation_id: artifacts.automation_id,
    label: artifacts.label,
    source_refs: artifacts.source_refs,
    createdAt: artifacts.createdAt,
    filename: artifacts.filename,
    mime: files.mime,
    size: files.size,
};

const listed = () => db.select(columns).from(artifacts)
    .innerJoin(files, and(eq(files.id, artifacts.file_id), eq(files.owner_id, artifacts.owner_id)));

export const artifactService = {
    async create(ownerId: string, item: NewArtifact) {
        const file = await fileService.create(ownerId, item.bytes, { mime: item.mime, filename: item.filename });
        const [artifact] = await db.insert(artifacts).values({
            id: crypto.randomUUID(),
            owner_id: ownerId,
            file_id: file.id,
            filename: item.filename,
            automation_id: item.automationId || null,
            label: item.label || null,
            source_refs: item.sourceRefs ?? [],
        }).returning();
        notifyUser(ownerId, 'artifacts');               // live updates: artifacts and storage pages, dashboard counts
        return { ...artifact!, mime: file.mime, size: file.size };
    },

    /** Newest first; `since` limits it to artifacts created from then on. */
    async list(ownerId: string, since?: Date) {
        const owner = eq(artifacts.owner_id, ownerId);
        return listed().where(since ? and(owner, gte(artifacts.createdAt, since)) : owner).orderBy(desc(artifacts.createdAt));
    },

    async get(ownerId: string, id: string) {
        if (!ownerId || !id) return undefined;
        return listed().where(and(eq(artifacts.owner_id, ownerId), eq(artifacts.id, id))).get();
    },

    async count(ownerId: string) {
        return db.$count(artifacts, eq(artifacts.owner_id, ownerId));
    },

    /**
     * Each automation's artifact retention (options.artifact_keep_days, artifact_keep_last; 0 = keep all): deletes the
     * older artifacts it made and releases their files. Run by the hourly file sweeper; returns how many were deleted.
     */
    async applyRetention() {
        let deleted = 0;
        const all = await db.select({ id: automations.id, owner_id: automations.owner_id, options: automations.options }).from(automations);
        for (const a of all) {
            const days = Number(a.options?.artifact_keep_days) || 0;
            const last = Number(a.options?.artifact_keep_last) || 0;
            if (!days && !last) continue;
            const mine = and(eq(artifacts.owner_id, a.owner_id), eq(artifacts.automation_id, a.id));
            const ids = new Set<string>();
            if (days) {
                const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
                for (const r of await db.select({ id: artifacts.id }).from(artifacts).where(and(mine, lt(artifacts.createdAt, cutoff)))) ids.add(r.id);
            }
            if (last) {
                const keep = (await db.select({ id: artifacts.id }).from(artifacts).where(mine).orderBy(desc(artifacts.createdAt), desc(artifacts.id)).limit(last)).map((r) => r.id);
                const over = await db.select({ id: artifacts.id }).from(artifacts).where(keep.length ? and(mine, notInArray(artifacts.id, keep)) : mine);
                for (const r of over) ids.add(r.id);
            }
            deleted += await this.delete(a.owner_id, [...ids]);
        }
        return deleted;
    },

    /** Deletes the owner's artifacts among `ids` and releases their files; returns how many were deleted. */
    async delete(ownerId: string, ids: string[]) {
        if (!ownerId || ids.length === 0) return 0;
        let count = 0;
        for (let i = 0; i < ids.length; i += 500) {
            const removed = await db.delete(artifacts)
                .where(and(eq(artifacts.owner_id, ownerId), inArray(artifacts.id, ids.slice(i, i + 500))))
                .returning({ file_id: artifacts.file_id });
            await fileService.release(ownerId, removed.map((r) => r.file_id));
            count += removed.length;
        }
        if (count > 0) notifyUser(ownerId, 'artifacts');     // also retention (applyRetention deletes through here)
        return count;
    },
};
