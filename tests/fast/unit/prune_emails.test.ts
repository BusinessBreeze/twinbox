// Email pruning against a real (in-memory) SQLite database built from the app's migrations.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { emails } from '#server/db/schema';

const client = createClient({ url: ':memory:' });
const db = drizzle({ client });
const released: Array<{ owner_id: string; content?: any }> = [];
const releaseEmailFiles = async (rows: typeof released) => { released.push(...rows); };
vi.mock('hub:db', () => ({ db }));
vi.mock('#server/jobs/sources/deps', async () => ({
    db, emails, releaseEmailFiles, emailStoredSize: (await import('#server/db/email_content')).emailStoredSize,
}));

const { pruneEmails, ownEmails, unownedEmails } = await import('#server/jobs/sources/types/email/prune');

const migrations = join(__dirname, '../../../server/db/migrations/sqlite');
for (const file of readdirSync(migrations).filter((f) => f.endsWith('.sql')).sort()) {
    for (const statement of readFileSync(join(migrations, file), 'utf8').split('--> statement-breakpoint')) {
        if (statement.trim()) await client.execute(statement);
    }
}

const DAY = 24 * 60 * 60 * 1000;
let n = 0;
const add = (opts: { source?: string | null; ageDays?: number; staged?: boolean; size?: number; attachment?: number }) => db.insert(emails).values({
    id: `e${++n}`, messageId: `<m${n}@example.com>`, owner_id: 'u1', from: 'a@example.com', to: 'b@example.com',
    subject: `Email ${n}`, text: 'x'.repeat(opts.size ?? 10), date: new Date().toISOString(),
    content: {
        envelope: { from: [], to: [], cc: [], reply_to: [] }, renditions: [], embedded: [],
        parts: opts.attachment ? [{ id: '1', mime: 'application/pdf', filename: 'a.pdf', size: opts.attachment, disposition: 'attachment', content_id: null, status: 'stored', file_id: `f${n}` }] : [],
    },
    staging_item: opts.staged ? 1 : 0, source_id: opts.source === undefined ? 'src' : opts.source,
    createdAt: new Date(Date.now() - (opts.ageDays ?? 0) * DAY), updatedAt: new Date(),
});
const subjects = async () => (await db.select({ s: emails.subject }).from(emails)).map((r) => r.s).sort();
const none = { retention_days: 0, max_items: 0, max_size_mb: 0 };

describe('pruneEmails', () => {
    beforeEach(async () => { await client.execute('DELETE FROM emails'); n = 0; released.length = 0; });

    it('deletes nothing without limits', async () => {
        await add({ ageDays: 400 });
        expect(await pruneEmails(ownEmails('u1', 'src'), none)).toBe(0);
    });

    it('deletes by age, keeps staged emails and other sources\' emails', async () => {
        await add({ ageDays: 40 });                         // Email 1: too old
        await add({ ageDays: 5 });                          // Email 2
        await add({ ageDays: 40, staged: true });           // Email 3: staged, kept
        await add({ ageDays: 40, source: 'other' });        // Email 4: another source's
        expect(await pruneEmails(ownEmails('u1', 'src'), { ...none, retention_days: 30 })).toBe(1);
        expect(await subjects()).toEqual(['Email 2', 'Email 3', 'Email 4']);
    });

    it('keeps the newest N', async () => {
        for (const age of [5, 4, 3, 2, 1]) await add({ ageDays: age });   // Email 1 oldest … Email 5 newest
        expect(await pruneEmails(ownEmails('u1', 'src'), { ...none, max_items: 2 })).toBe(3);
        expect(await subjects()).toEqual(['Email 4', 'Email 5']);
    });

    it('keeps the newest emails up to the size limit, then deletes all older ones', async () => {
        const mb = 1024 * 1024;
        await add({ ageDays: 3, size: 10 });                // Email 1: small but older than the cut
        await add({ ageDays: 2, size: mb });                // Email 2: doesn't fit any more
        await add({ ageDays: 1, size: mb / 2 });            // Email 3: newest, fits
        expect(await pruneEmails(ownEmails('u1', 'src'), { ...none, max_size_mb: 1 })).toBe(2);
        expect(await subjects()).toEqual(['Email 3']);
    });

    it('counts stored attachments towards the size and releases the files of what it deletes', async () => {
        const mb = 1024 * 1024;
        await add({ ageDays: 2, size: 10, attachment: mb });   // Email 1: small text, a 1 MB attachment
        await add({ ageDays: 1, size: 10 });                    // Email 2
        expect(await pruneEmails(ownEmails('u1', 'src'), { ...none, max_size_mb: 1 })).toBe(1);
        expect(await subjects()).toEqual(['Email 2']);
        expect(released.map((r) => r.content.parts.map((p: any) => p.file_id))).toEqual([['f1']]);
    });

    it('prunes emails without a source separately (staging owns them)', async () => {
        await add({ ageDays: 40, source: null });
        await add({ ageDays: 40 });
        expect(await pruneEmails(unownedEmails('u1'), { ...none, retention_days: 30 })).toBe(1);
        expect(await subjects()).toEqual(['Email 2']);
    });
});
