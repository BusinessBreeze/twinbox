// The base layer's database wrappers (server/db/wrappers in nuxt-base-app) against an in-memory SQLite database built
// from the app's migrations: one filter dialect for all, unknown columns refused, single-statement update/delete,
// counts, column selection, and rows read back without re-validating them.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import * as schema from '#server/db/schema';

const client = createClient({ url: ':memory:' });
const db = drizzle({ client });
vi.mock('hub:db', () => ({ db }));
// hub:db:schema is the base layer's tables plus the app's
vi.mock('hub:db:schema', async () => ({ ...(await import('#bs/db/schema')), ...schema }));

const { sources } = schema;
const { whereOf } = await import('#bs/db/wrappers/filter');
const { dbFindAll } = await import('#bs/db/wrappers/db_find_all');
const { dbFindOne } = await import('#bs/db/wrappers/db_find_one');
const { dbCount, dbExists } = await import('#bs/db/wrappers/db_count');
const { dbFindOneAndUpdate } = await import('#bs/db/wrappers/db_find_one_and_update');
const { dbFindOneAndDelete } = await import('#bs/db/wrappers/db_find_one_and_delete');
const { dbDeleteMany } = await import('#bs/db/wrappers/db_delete_many');
const { dbSearch } = await import('#bs/db/wrappers/db_search');

const migrations = join(__dirname, '../../../server/db/migrations/sqlite');
for (const file of readdirSync(migrations).filter((f) => f.endsWith('.sql')).sort()) {
    for (const statement of readFileSync(join(migrations, file), 'utf8').split('--> statement-breakpoint')) {
        if (statement.trim()) await client.execute(statement);
    }
}

const add = (id: string, owner: string, name: string, poll: number | null = 3600) => client.execute({
    sql: "INSERT INTO sources (id, owner_id, name, type, poll_seconds, created_at, updated_at) VALUES (?, ?, ?, 'staging', ?, 0, 0)",
    args: [id, owner, name, poll],
});
const ids = (rows: any[]) => rows.map((r) => r.id).sort();

describe('database wrappers', () => {
    beforeEach(async () => {
        await client.execute('DELETE FROM sources');
        await add('s1', 'a', 'One');
        await add('s2', 'a', 'Two', null);
        await add('s3', 'b', 'Three');
    });

    it('filter with one dialect: value, list, null, notIn; undefined left out', async () => {
        expect(ids(await dbFindAll(db, sources, { owner_id: 'a' }))).toEqual(['s1', 's2']);
        expect(ids(await dbFindAll(db, sources, { id: ['s1', 's3'] }))).toEqual(['s1', 's3']);
        expect(ids(await dbFindAll(db, sources, { id: [] }))).toEqual([]);
        expect(ids(await dbFindAll(db, sources, { poll_seconds: null }))).toEqual(['s2']);
        expect(ids(await dbFindAll(db, sources, { name: { notIn: ['One'] } }))).toEqual(['s2', 's3']);
        expect(ids(await dbFindAll(db, sources, { owner_id: 'a', name: undefined }))).toEqual(['s1', 's2']);
        expect(ids(await dbFindAll(db, sources))).toEqual(['s1', 's2', 's3']);
    });

    it('refuse a filter on a column the table doesn\'t have, instead of ignoring it', async () => {
        expect(() => whereOf(sources, { owner: 'a' })).toThrow(/unknown_column/);
        await expect(dbFindAll(db, sources, { owner: 'a' })).rejects.toThrow(/unknown_column/);
        await expect(dbSearch(db, sources, { owner: 'a' })).rejects.toThrow(/unknown_column/);
        await expect(dbFindAll(db, sources, {}, { cols: ['nope'] })).rejects.toThrow(/unknown_column/);
    });

    it('read only the columns asked for', async () => {
        const [row] = await dbFindAll(db, sources, { id: 's1' }, { cols: ['id', 'name'] });
        expect(row).toEqual({ id: 's1', name: 'One' });
    });

    it('find one, refusing two', async () => {
        expect((await dbFindOne(db, sources, { id: 's1' }))?.name).toBe('One');
        expect(await dbFindOne(db, sources, { id: 'nope' })).toBeNull();
        await expect(dbFindOne(db, sources, { owner_id: 'a' })).rejects.toThrow(/at most 1/);
    });

    it('count and exists', async () => {
        expect(await dbCount(db, sources, { owner_id: 'a' })).toBe(2);
        expect(await dbCount(db, sources)).toBe(3);
        expect(await dbExists(db, sources, { owner_id: 'b' })).toBe(true);
        expect(await dbExists(db, sources, { owner_id: 'c' })).toBe(false);
    });

    it('update and delete one row in place, scoped by the whole filter', async () => {
        expect(await dbFindOneAndUpdate(db, sources, { id: 's3', owner_id: 'a' }, { name: 'Taken' })).toBeNull();   // not a's
        const updated = await dbFindOneAndUpdate(db, sources, { id: 's1', owner_id: 'a' }, { name: 'Renamed' });
        expect(updated?.name).toBe('Renamed');
        expect(updated?.updatedAt.getTime()).toBeGreaterThan(0);
        expect((await dbFindOneAndUpdate(db, sources, { name: 'Three' }, { poll_seconds: 60 }))?.poll_seconds).toBe(60);   // no id: looked up first
        await expect(dbFindOneAndUpdate(db, sources, { owner_id: 'a' }, { name: 'x' })).rejects.toThrow(/at most 1/);

        expect(await dbFindOneAndDelete(db, sources, { id: 's3', owner_id: 'a' })).toBeNull();
        expect((await dbFindOneAndDelete(db, sources, { id: 's3', owner_id: 'b' }))?.id).toBe('s3');
        expect(ids(await dbDeleteMany(db, sources, ['s1', 's2'], { owner_id: 'b' }))).toEqual([]);
        expect(ids(await dbDeleteMany(db, sources, ['s1', 's2'], { owner_id: 'a' }))).toEqual(['s1', 's2']);
    });

    it('return stored rows as they are, without checking them again', async () => {
        // A row the select schema would refuse (a JSON column holding a string): still listed, not a failed list
        await client.execute("UPDATE sources SET settings = '\"not an object\"' WHERE id = 's1'");
        expect(ids(await dbFindAll(db, sources, { owner_id: 'a' }))).toEqual(['s1', 's2']);
    });
});
