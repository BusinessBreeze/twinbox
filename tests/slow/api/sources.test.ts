// Sources API on the test server. The IMAP sources here are only records (host imap.invalid): nothing connects to
// them, because no test runs them, tests their connection or lists their keys.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { adminClient, deleteAllAutomations, stagingSource, waitForEvent, type TestClient } from '../../helpers/client';

const imapBody = (name: string, searches: any[] = [{ name: 'Recent', search: { _since_days: 3 } }]) => ({
    name, type: 'imap', poll_seconds: 3600, max_items_per_fetch: 20,
    config: { host: 'imap.invalid', port: 993, use_ssl: true, username: 'user@example.com', credential: 'not-a-real-password' },
    settings: { searches },
});

describe('sources', () => {
    let client: TestClient;
    const deleteImapSources = async () => {
        for (const s of await client.ok<any[]>('GET', '/api/v0.1/app/sources')) {
            if (s.type !== 'staging') await client.ok('DELETE', `/api/v0.1/app/sources/${s.id}`);
        }
    };
    beforeAll(async () => { client = await adminClient(); await deleteAllAutomations(client); });
    afterAll(async () => { await deleteAllAutomations(client); await deleteImapSources(); });

    it('creates the staging source on the first listing, once, without settings', async () => {
        await client.ok('GET', '/api/v0.1/app/sources');
        const staging = (await client.ok<any[]>('GET', '/api/v0.1/app/sources')).filter((s) => s.type === 'staging');
        expect(staging).toHaveLength(1);
        expect(staging[0].settings).toEqual({});
    });

    it('ignores deleting the staging source', async () => {
        const staging = await stagingSource(client);
        expect((await client.delete(`/api/v0.1/app/sources/${staging.id}`)).status).toBe(200);
        expect((await stagingSource(client)).id).toBe(staging.id);
    });

    it('lets staging change only its fetch limit, up to the system limit', async () => {
        const staging = await stagingSource(client);
        const lowered = await client.ok('PATCH', `/api/v0.1/app/sources/${staging.id}`, { max_items_per_fetch: 10, name: 'Renamed' });
        expect(lowered.max_items_per_fetch).toBe(10);
        expect(lowered.name).toBe('Staging');
        const tooHigh = await client.patch(`/api/v0.1/app/sources/${staging.id}`, { max_items_per_fetch: 100000 });
        expect(tooHigh.status).toBe(400);
        expect(tooHigh.body.statusMessage).toBe('error sources.max_items_per_fetch.too_high');
        await client.ok('PATCH', `/api/v0.1/app/sources/${staging.id}`, { max_items_per_fetch: 50 });
    });

    it('stores pruning limits per source, capped by the SOURCE_* env (test server: SOURCE_MAX_ITEMS=1000)', async () => {
        const created = await client.ok('POST', '/api/v0.1/app/sources', { ...imapBody('Limits'), retention_days: 30, max_items: 500, max_size_mb: 99999 });
        expect(created).toMatchObject({ retention_days: 30, max_items: 500, max_size_mb: 99999 });   // size: no cap
        const above = await client.patch(`/api/v0.1/app/sources/${created.id}`, { max_items: 1001 });
        expect(above.body.statusMessage).toBe('error sources.max_items.too_high');
        expect((await client.patch(`/api/v0.1/app/sources/${created.id}`, { max_items: -1 })).status).toBeGreaterThanOrEqual(400);
    });

    it('lets staging set its pruning limits (it prunes imported emails)', async () => {
        const staging = await stagingSource(client);
        const updated = await client.ok('PATCH', `/api/v0.1/app/sources/${staging.id}`, { retention_days: 14, max_items: 100 });
        expect(updated).toMatchObject({ retention_days: 14, max_items: 100, name: 'Staging' });
        await client.ok('PATCH', `/api/v0.1/app/sources/${staging.id}`, { retention_days: 0, max_items: 0 });
    });

    it('caps every source at the system limit', async () => {
        const res = await client.post('/api/v0.1/app/sources', { ...imapBody('Too many'), max_items_per_fetch: 100000 });
        expect(res.body.statusMessage).toBe('error sources.max_items_per_fetch.too_high');
    });

    it('offers staging as one key: its id', async () => {
        await deleteImapSources();
        const staging = await stagingSource(client);
        const list = await client.ok('GET', '/api/v0.1/app/sources/keys');
        expect(list.keys).toEqual([{ key: staging.id, label: 'Staging', source_id: staging.id }]);
        expect(list.unavailable).toEqual([]);
    });

    it('refuses to create a built-in or unknown type', async () => {
        expect((await client.post('/api/v0.1/app/sources', { name: 'x', type: 'staging' })).status).toBe(400);
        expect((await client.post('/api/v0.1/app/sources', { name: 'x', type: 'nope' })).status).toBe(400);
    });

    it('never returns the secret and keeps it when the field comes back empty', async () => {
        const created = await client.ok('POST', '/api/v0.1/app/sources', imapBody('Masked'));
        expect(created.config.credential).toBeUndefined();
        expect(created.state).toBeUndefined();          // the type's runtime state stays on the server
        expect(created.config.host).toBe('imap.invalid');
        expect(JSON.stringify(await client.ok('GET', `/api/v0.1/app/sources/${created.id}`))).not.toContain('not-a-real-password');

        // A client can't write the runtime state
        expect((await client.patch(`/api/v0.1/app/sources/${created.id}`, { state: { checkpoints: { x: 1 } } })).body.data.state).toBeUndefined();

        // The config needs a credential: this update only passes when the stored one is kept
        const updated = await client.patch(`/api/v0.1/app/sources/${created.id}`, { config: { host: 'imap2.invalid', credential: '' } });
        expect(updated.status).toBe(200);
        expect(updated.body.data.config.host).toBe('imap2.invalid');
    });

    it('gives saved searches an id once, keeps it on rename and refuses duplicate names', async () => {
        const dupe = await client.post('/api/v0.1/app/sources', imapBody('Searches', [{ name: 'Same' }, { name: 'same ' }]));
        expect(dupe.status).toBe(422);
        expect(dupe.body.statusMessage).toBe('error sources.searches.name_duplicate');
        expect(dupe.body.data.field).toBe('settings.searches.2.name');   // [0] is "Default"

        const created = await client.ok('POST', '/api/v0.1/app/sources', imapBody('Searches', [
            { name: 'Same', search: { seen: false } }, { name: 'Other' },
        ]));
        const [, a, b] = created.settings.searches;     // [0] is the "Default" search every new source gets
        expect(a.id).toMatch(/^s_[0-9a-f]{8}$/);
        expect([a.name, b.name]).toEqual(['Same', 'Other']);

        const renamed = await client.ok('PATCH', `/api/v0.1/app/sources/${created.id}`, {
            settings: { searches: [{ ...a, name: 'Unread' }, b] },
        });
        expect(renamed.settings.searches.map((s: any) => s.id)).toEqual([a.id, b.id]);
        expect(renamed.settings.searches[0].name).toBe('Unread');
    });

    it('starts a new source with a dated "Default" search and dates each new search once', async () => {
        const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);   // limits.sources.new_search_since_days
        const created = await client.ok('POST', '/api/v0.1/app/sources', imapBody('Dated', [
            { name: 'Unread', search: { seen: false } }, { name: 'Own date', search: { _since_days: 3 } },
        ]));
        const [def, unread, own] = created.settings.searches;
        expect(created.settings.searches.map((s: any) => s.name)).toEqual(['Default', 'Unread', 'Own date']);
        expect(def.search).toEqual({ since });
        expect(unread.search).toEqual({ since, seen: false });
        expect(own.search).toEqual({ _since_days: 3 });        // a search with its own date keeps it

        // Removed by the user: not added again; a search added later gets its date
        const edited = await client.ok('PATCH', `/api/v0.1/app/sources/${created.id}`, {
            settings: { searches: [def, { ...unread, search: { seen: false } }, own, { name: 'Later' }] },
        });
        expect(edited.settings.searches[1].search).toEqual({ seen: false });
        expect(edited.settings.searches[3].search).toEqual({ since });

        // A supplied search named "Default" replaces the one the server would add
        const own_default = await client.ok('POST', '/api/v0.1/app/sources', imapBody('Own default', [{ name: 'Default', search: { seen: true } }]));
        expect(own_default.settings.searches.map((s: any) => [s.name, s.search])).toEqual([['Default', { since, seen: true }]]);
    });

    it('warns the automations of a deleted search and of a deleted source', async () => {
        const src = await client.ok('POST', '/api/v0.1/app/sources', imapBody('Warnings'));
        const [search] = src.settings.searches;
        await client.ok('POST', '/api/v0.1/app/automation', { name: 'On search', source_key: `${src.id}:INBOX:${search.id}`, tasks: [] });
        await client.ok('POST', '/api/v0.1/app/automation', { name: 'On folder', source_key: `${src.id}:INBOX:`, tasks: [] });

        await client.ok('PATCH', `/api/v0.1/app/sources/${src.id}`, { settings: { searches: [] } });
        const event = await waitForEvent(client, (e) => e.message === 'events.user.warn_source_key_broken_automation' && e.metadata.name === 'On search');
        expect(event.metadata.source).toBe('Warnings');
        // the folder-only automation still works: no warning for it
        const events = await client.ok<any[]>('GET', '/api/user/event/search?limit=50&sortBy=createdAt&sortDir=desc');
        expect(events.some((e) => e.message === 'events.user.warn_source_key_broken_automation' && JSON.stringify(e.metadata).includes('On folder'))).toBe(false);

        await client.ok('DELETE', `/api/v0.1/app/sources/${src.id}`);
        await waitForEvent(client, (e) => e.message === 'events.user.warn_source_deleted_automation' && e.metadata.name === 'On folder');
    });

    it('exports without secrets and imports with the same search ids', async () => {
        const src = await client.ok('POST', '/api/v0.1/app/sources', imapBody('Roundtrip'));
        const exported = (await client.ok<any[]>('GET', '/api/v0.1/app/sources/export')).find((s) => s.name === 'Roundtrip');
        expect(JSON.stringify(exported)).not.toContain('not-a-real-password');
        expect(exported.id).toBeUndefined();

        await client.ok('DELETE', `/api/v0.1/app/sources/${src.id}`);
        const [imported] = await client.ok<any[]>('POST', '/api/v0.1/app/sources/import', [exported]);
        expect(imported.settings.searches.map((s: any) => s.id)).toEqual(src.settings.searches.map((s: any) => s.id));
    });
});
