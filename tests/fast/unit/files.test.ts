// The file store (server/services/app/files.ts, artifacts.ts) against an in-memory SQLite database built from the
// app's migrations and a throwaway files folder: owner scoping, dedup per owner, quota, release and the sweeper.
import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { sqliteTable, text } from 'drizzle-orm/sqlite-core';

const client = createClient({ url: ':memory:' });
const db = drizzle({ client });
const accounts = sqliteTable('accounts', { id: text('id').primaryKey() });
vi.mock('hub:db', () => ({ db }));
vi.mock('hub:db:schema', () => ({ accounts }));

const dir = join(__dirname, '../../.tmp', `files-unit-${process.pid}`);
process.env.FILES_DIR = dir;

const { fileService, FileQuotaError } = await import('#server/services/app/files');
const { artifactService } = await import('#server/services/app/artifacts');
const { contentDisposition } = await import('#server/utils/http_files');
const { emailRecordSize, emailStoredSize, fileIdsReferencedByEmails } = await import('#server/db/email_content');
const { storageService } = await import('#server/services/app/storage');
const { emails } = await import('#server/db/schema');
const { limits } = await import('#shared/limits');

const migrations = join(__dirname, '../../../server/db/migrations/sqlite');
for (const file of readdirSync(migrations).filter((f) => f.endsWith('.sql')).sort()) {
    for (const statement of readFileSync(join(migrations, file), 'utf8').split('--> statement-breakpoint')) {
        if (statement.trim()) await client.execute(statement);
    }
}

const blobs = () => (existsSync(dir) ? readdirSync(dir, { recursive: true, withFileTypes: true }).filter((d) => d.isFile()).length : 0);
const HOUR = 60 * 60 * 1000;
const age = (table: string, id: string) => client.execute({ sql: `UPDATE ${table} SET created_at = ? WHERE id = ?`, args: [Math.floor((Date.now() - 2 * HOUR) / 1000), id] });

describe('file store', () => {
    beforeEach(async () => {
        for (const t of ['files', 'artifacts', 'accounts', 'emails']) await client.execute(`DELETE FROM ${t}`);
        await client.execute("INSERT INTO accounts (id, user, password, created_at, updated_at) VALUES ('a', 'a', 'x', 0, 0), ('b', 'b', 'x', 0, 0)");
        rmSync(dir, { recursive: true, force: true });
        mkdirSync(dir, { recursive: true });
        limits.files.max_user_mb = 1024;
    });
    afterAll(() => rmSync(dir, { recursive: true, force: true }));

    it('stores bytes under a generated key and gives them back only to the owner', async () => {
        const file = await fileService.create('a', Buffer.from('hello'), { mime: 'text/plain', filename: '../../etc/passwd' });
        expect(file.storage_key).toMatch(/^[0-9a-f]{2}\/[0-9a-f]{32}$/);
        expect(readdirSync(dir, { recursive: true }).join(' ')).not.toContain('passwd');
        expect((await fileService.read('a', file.id))?.toString()).toBe('hello');
        expect(await fileService.get('b', file.id)).toBeUndefined();
        expect(await fileService.open('b', file.id)).toBeNull();
        expect(await fileService.read('b', file.id)).toBeNull();
    });

    it('deduplicates per owner only', async () => {
        const a1 = await fileService.create('a', Buffer.from('same'), { mime: 'text/plain' });
        const a2 = await fileService.create('a', Buffer.from('same'), { mime: 'text/plain' });
        const b1 = await fileService.create('b', Buffer.from('same'), { mime: 'text/plain' });
        expect(a2.id).toBe(a1.id);
        expect(b1.id).not.toBe(a1.id);
        expect(b1.storage_key).not.toBe(a1.storage_key);
        expect(blobs()).toBe(2);
    });

    it('refuses files over the quota', async () => {
        limits.files.max_user_mb = 1;
        await fileService.create('a', Buffer.alloc(700 * 1024, 1), { mime: 'application/octet-stream' });
        await expect(fileService.create('a', Buffer.alloc(700 * 1024, 2), { mime: 'application/octet-stream' })).rejects.toBeInstanceOf(FileQuotaError);
        await fileService.create('b', Buffer.alloc(700 * 1024, 2), { mime: 'application/octet-stream' });   // b's own quota
        expect(blobs()).toBe(2);
    });

    it('keeps a file while an artifact uses it, and releases it with the last one', async () => {
        const one = await artifactService.create('a', { bytes: Buffer.from('report'), mime: 'text/markdown', filename: 'one.md' });
        const two = await artifactService.create('a', { bytes: Buffer.from('report'), mime: 'text/markdown', filename: 'two.md' });
        expect(two.file_id).toBe(one.file_id);
        expect((await artifactService.list('a')).map((x) => x.filename).sort()).toEqual(['one.md', 'two.md']);

        expect(await artifactService.delete('b', [one.id])).toBe(0);   // not b's
        expect(await artifactService.delete('a', [one.id])).toBe(1);
        expect(await fileService.get('a', one.file_id)).toBeDefined();
        expect(await artifactService.delete('a', [two.id])).toBe(1);
        expect(await fileService.get('a', one.file_id)).toBeUndefined();
        expect(blobs()).toBe(0);
    });

    it('keeps a file while an email part (or a forwarded message\'s part) references it', async () => {
        const own = await fileService.create('a', Buffer.from('attachment'), { mime: 'application/pdf' });
        const nested = await fileService.create('a', Buffer.from('forwarded attachment'), { mime: 'application/pdf' });
        const part = (file_id: string) => ({ id: '1', mime: 'application/pdf', filename: 'x.pdf', size: 1, disposition: 'attachment', content_id: null, status: 'stored', file_id });
        await client.execute({
            sql: "INSERT INTO emails (id, message_id, owner_id, \"from\", \"to\", content, created_at, updated_at) VALUES ('e1', '<e1@x>', 'a', 'x@x', 'y@y', ?, 0, 0)",
            args: [JSON.stringify({ envelope: {}, renditions: [], parts: [part(own.id)], embedded: [{ kind: 'forwarded', part_id: '2', envelope: {}, renditions: [], parts: [part(nested.id)], embedded_skipped: 0 }] })],
        });
        await fileService.release('a', [own.id, nested.id]);
        expect(await fileService.get('a', own.id)).toBeDefined();
        expect(await fileService.get('a', nested.id)).toBeDefined();
        await client.execute('DELETE FROM emails');
        await fileService.release('a', [own.id, nested.id]);
        expect(await fileService.get('a', own.id)).toBeUndefined();
        expect(await fileService.get('a', nested.id)).toBeUndefined();
    });

    it('sweeps old unreferenced files, blobs without a row and files of deleted accounts', async () => {
        const kept = await artifactService.create('a', { bytes: Buffer.from('kept'), mime: 'text/plain', filename: 'k.txt' });
        const young = await fileService.create('a', Buffer.from('young'), { mime: 'text/plain' });
        const old = await fileService.create('a', Buffer.from('old'), { mime: 'text/plain' });
        await age('files', old.id);
        await age('files', kept.file_id);
        const gone = await artifactService.create('c', { bytes: Buffer.from('of a deleted account'), mime: 'text/plain', filename: 'c.txt' });
        mkdirSync(join(dir, 'ab'), { recursive: true });
        const stray = join(dir, 'ab', 'ab'.padEnd(32, '0'));
        writeFileSync(stray, 'stray');
        utimesSync(stray, new Date(Date.now() - 2 * HOUR), new Date(Date.now() - 2 * HOUR));

        expect(await fileService.sweep()).toEqual({ orphaned: 1, unreferenced: 1, blobs: 1 });
        expect(await fileService.get('a', kept.file_id)).toBeDefined();
        expect(await fileService.get('a', young.id)).toBeDefined();
        expect(await fileService.get('a', old.id)).toBeUndefined();
        expect(await fileService.get('c', gone.file_id)).toBeUndefined();
        expect(await artifactService.list('c')).toEqual([]);
        expect(existsSync(stray)).toBe(false);
        expect(blobs()).toBe(2);
    });
});

describe('artifact retention', () => {
    const DAY = 24 * 60 * 60 * 1000;
    const automation = (id: string, owner: string, options: Record<string, unknown>) => client.execute({
        sql: 'INSERT INTO automations (id, owner_id, name, options, tasks, created_at, updated_at) VALUES (?, ?, ?, ?, \'[]\', 0, 0)',
        args: [id, owner, id, JSON.stringify(options)],
    });
    const artifact = async (owner: string, automationId: string | null, ageDays: number, name: string) => {
        const a = await artifactService.create(owner, { bytes: Buffer.from(name), mime: 'text/plain', filename: name, automationId });
        await client.execute({ sql: 'UPDATE artifacts SET created_at = ? WHERE id = ?', args: [Math.floor((Date.now() - ageDays * DAY) / 1000), a.id] });
        return a;
    };
    const names = async (owner: string) => (await artifactService.list(owner)).map((a) => a.filename).sort();

    beforeEach(async () => {
        for (const t of ['files', 'artifacts', 'automations']) await client.execute(`DELETE FROM ${t}`);
        rmSync(dir, { recursive: true, force: true });
    });

    it('keeps each automation\'s artifacts for its days, or only its newest, and nothing else is touched', async () => {
        await automation('by-days', 'a', { artifact_keep_days: 7 });
        await automation('by-count', 'a', { artifact_keep_last: 2 });
        await automation('keep-all', 'a', {});
        await artifact('a', 'by-days', 10, 'days-old');
        await artifact('a', 'by-days', 1, 'days-new');
        for (const age of [4, 3, 2, 1]) await artifact('a', 'by-count', age, `count-${age}`);
        await artifact('a', 'keep-all', 400, 'all-old');
        await artifact('a', null, 400, 'no-automation');
        await artifact('b', 'by-days', 400, 'other-owner');   // b's artifact with the id of a's automation: not a's to prune

        expect(await artifactService.applyRetention()).toBe(3);
        expect(await names('a')).toEqual(['all-old', 'count-1', 'count-2', 'days-new', 'no-automation']);
        expect(await names('b')).toEqual(['other-owner']);
        expect(blobs()).toBe(6);   // the deleted artifacts' files are released
    });
});

describe('email structure in SQL, and storage usage', () => {
    const part = (file_id: string, size: number, status = 'stored') => ({ id: '1', mime: 'application/pdf', filename: 'x.pdf', size, disposition: 'attachment', content_id: null, status, file_id });
    const email = (id: string, owner: string, text: string, content: object) => client.execute({
        sql: "INSERT INTO emails (id, message_id, owner_id, \"from\", \"to\", text, content, created_at, updated_at) VALUES (?, ?, ?, 'x@x', 'y@y', ?, ?, 0, 0)",
        args: [id, `<${id}@x>`, owner, text, JSON.stringify(content)],
    });

    beforeEach(async () => {
        for (const t of ['files', 'artifacts', 'emails']) await client.execute(`DELETE FROM ${t}`);
        rmSync(dir, { recursive: true, force: true });
        limits.files.max_user_mb = 1024;
    });

    it('measures an email with and without its stored attachments, and finds the files its parts reference', async () => {
        const content = {
            envelope: {}, renditions: [], parts: [part('f-own', 1000), part('f-skipped', 5000, 'skipped')],
            embedded: [{ kind: 'forwarded', part_id: '2', envelope: {}, renditions: [], parts: [part('f-fwd', 300)], embedded_skipped: 0 }],
        };
        await email('e1', 'a', 'hello', content);
        const row = await db.select({ record: emailRecordSize, stored: emailStoredSize }).from(emails).get();
        expect(row!.record).toBe(5 + JSON.stringify(content).length);
        expect(row!.stored).toBe(row!.record + 1000);              // the own stored part; skipped ones take no space
        expect((await fileIdsReferencedByEmails(['f-own', 'f-fwd', 'f-skipped', 'other'])).sort()).toEqual(['f-fwd', 'f-own', 'f-skipped']);
        expect(await fileIdsReferencedByEmails([])).toEqual([]);
    });

    it('sums each category for the owner only', async () => {
        const attachment = await fileService.create('a', Buffer.alloc(700, 1), { mime: 'application/pdf' });
        await artifactService.create('a', { bytes: Buffer.alloc(300, 2), mime: 'text/markdown', filename: 'r.md' });
        await artifactService.create('b', { bytes: Buffer.alloc(999, 3), mime: 'text/markdown', filename: 'b.md' });
        await email('e1', 'a', 'hello', { envelope: {}, renditions: [], parts: [part(attachment.id, 700)], embedded: [] });
        await email('e2', 'b', 'not a\'s', { envelope: {}, renditions: [], parts: [], embedded: [] });

        const usage = await storageService.usage('a');
        expect(usage.attachments).toEqual({ bytes: 700, count: 1 });
        expect(usage.artifacts).toEqual({ bytes: 300, count: 1 });
        expect(usage.files).toEqual({ bytes: 1000, limit_bytes: 1024 * 1024 * 1024 });
        expect(usage.emails.count).toBe(1);
        expect(usage.emails.bytes).toBeGreaterThan(5);
    });
});

describe('contentDisposition', () => {
    it('makes one safe header line of any file name', () => {
        const header = contentDisposition('attachment', 'evil\r\nSet-Cookie: x=1 "quoted" back\\slash Ärger €.pdf');
        expect(header).not.toMatch(/[\r\n]/);
        expect(header).toMatch(/^attachment; filename="[^"\\]*"; filename\*=UTF-8''[\w%.!~-]+$/);
        expect(decodeURIComponent(header.split("UTF-8''")[1]!)).toBe('evilSet-Cookie: x=1 "quoted" back\\slash Ärger €.pdf');
        expect(contentDisposition('inline', '')).toBe(`inline; filename="file"; filename*=UTF-8''file`);
    });
});
