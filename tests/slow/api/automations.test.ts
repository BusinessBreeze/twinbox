import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { adminClient, deleteAllAutomations, stagingSource, type TestClient } from '../../helpers/client';

describe('automations', () => {
    let client: TestClient;
    let staging: any;
    let imap: any;            // a source record only: never connected
    let searchId: string;

    beforeAll(async () => {
        client = await adminClient();
        await deleteAllAutomations(client);
        staging = await stagingSource(client);
        imap = await client.ok('POST', '/api/v0.1/app/sources', {
            name: 'Mailbox', type: 'imap',
            config: { host: 'imap.invalid', port: 993, use_ssl: true, username: 'user@example.com', credential: 'x-password' },
            settings: { searches: [{ name: 'Unread', search: { seen: false } }] },
        });
        searchId = imap.settings.searches.find((s: any) => s.name === 'Unread').id;   // [0] is the server's "Default"
    });
    afterAll(async () => {
        await deleteAllAutomations(client);
        await client.ok('DELETE', `/api/v0.1/app/sources/${imap.id}`);
    });

    it('subscribes to staging with just its id; filter prompt goes into the options', async () => {
        const created = await client.ok('POST', '/api/v0.1/app/automation', {
            name: 'Form fields', source_key: staging.id, filter_prompt: 'Only newsletters', options: { add_source_links: true }, tasks: [],
        });
        expect(created).toMatchObject({ source_id: staging.id, source_key: staging.id, filter_prompt: 'Only newsletters' });
        expect(created.options).toEqual({ add_source_links: true, filter_prompt: 'Only newsletters' });
        expect((await client.ok('GET', `/api/v0.1/app/automation/${created.id}`)).source_label).toBe('Staging');
    });

    it('accepts IMAP keys with and without a search and labels them', async () => {
        const folder = await client.ok('POST', '/api/v0.1/app/automation', { name: 'Folder', source_key: `${imap.id}:INBOX:`, tasks: [] });
        const search = await client.ok('POST', '/api/v0.1/app/automation', { name: 'Search', source_key: `${imap.id}:News:2026:${searchId}`, tasks: [] });
        expect(folder.source_id).toBe(imap.id);
        const labels = Object.fromEntries((await client.ok<any[]>('GET', '/api/v0.1/app/automation')).map((a) => [a.name, a.source_label]));
        expect(labels.Folder).toBe('Mailbox › INBOX');
        expect(labels.Search).toBe('Mailbox › News:2026 › Unread');   // a ':' inside the folder name is fine
        expect(search.source_key).toBe(`${imap.id}:News:2026:${searchId}`);
    });

    it('rejects a malformed key, an unknown search and an unknown source', async () => {
        const status = async (source_key: string) => (await client.post('/api/v0.1/app/automation', { name: `Bad ${source_key}`, source_key, tasks: [] })).body.statusMessage;
        expect(await status(`${imap.id}:INBOX`)).toBe('error automations.source_key.invalid');           // delimiters are required
        expect(await status(`${imap.id}:INBOX:s_missing`)).toBe('error automations.source_key.search_deleted');
        expect(await status(`${staging.id}:extra`)).toBe('error automations.source_key.invalid');
        expect(await status('missing-source')).toBe('error automations.source_key.source_not_found');
    });

    it('drops options the source type does not support', async () => {
        const opts = { mark_read: true, mark_important: true, add_source_links: true };
        const onStaging = await client.ok('POST', '/api/v0.1/app/automation', { name: 'No flags', source_key: staging.id, options: opts, tasks: [] });
        expect(onStaging.options).toEqual({ add_source_links: true });
        const onImap = await client.ok('POST', '/api/v0.1/app/automation', { name: 'Flags', source_key: `${imap.id}:INBOX:`, options: opts, tasks: [] });
        expect(onImap.options).toEqual(opts);
    });

    it('keeps the options when only "active" changes', async () => {
        const created = await client.ok('POST', '/api/v0.1/app/automation', {
            name: 'Toggle', source_key: staging.id, filter_prompt: 'x', options: { add_source_links: true }, tasks: [],
        });
        const updated = await client.ok('PATCH', `/api/v0.1/app/automation/${created.id}`, { active: 0 });
        expect(updated.active).toBe(0);
        expect(updated.options).toEqual({ add_source_links: true, filter_prompt: 'x' });
    });

    // Names are never changed by the server: a duplicate is refused (the browser picks a free name)
    it('refuses duplicate and missing task labels', async () => {
        const task = (id: string, label: string) => ({ id, type: 'create_artifact', version: 1, label, inputs: ['source'], args: { prompt: 'Sum up' } });
        const dupe = await client.post('/api/v0.1/app/automation', { name: 'Labels', source_key: staging.id, tasks: [task('t1', 'Summary'), task('t2', 'summary ')] });
        expect(dupe.status).toBe(422);
        expect(dupe.body.statusMessage).toBe('error table.automation.rules.tasks.label.duplicate');
        expect(dupe.body.data.field).toBe('tasks.t2');

        const missing = await client.post('/api/v0.1/app/automation', { name: 'Labels', source_key: staging.id, tasks: [task('t1', ' ')] });
        expect(missing.body.statusMessage).toBe('error table.automation.rules.tasks.label.required');
    });

    it('refuses a taken automation name on create, update and template add', async () => {
        const first = await client.ok('POST', '/api/v0.1/app/automation', { name: 'Taken', source_key: staging.id, tasks: [] });
        const second = await client.ok('POST', '/api/v0.1/app/automation', { name: 'Free', source_key: staging.id, tasks: [] });
        for (const res of [
            await client.post('/api/v0.1/app/automation', { name: ' taken', source_key: staging.id, tasks: [] }),
            await client.patch(`/api/v0.1/app/automation/${second.id}`, { name: 'TAKEN' }),
            await client.post('/api/v0.1/app/automation/add_template', { title: 'Taken', tasks: [] }),
        ]) {
            expect(res.status).toBe(422);
            expect(res.body.statusMessage).toBe('error table.automation.rules.name.duplicate');
        }
        // its own name is not a collision
        expect((await client.patch(`/api/v0.1/app/automation/${first.id}`, { name: 'Taken' })).status).toBe(200);
    });

    it('adds a library template with a notification task for a user without a local channel', async () => {
        // A fresh account has no channels: "Add" must create the local one itself (it once failed with "Required")
        const channels = await client.ok<any[]>('GET', '/api/user/notification');
        for (const c of channels.filter((c) => c.provider === 'local' || /local/i.test(c.name))) {
            await client.ok('DELETE', `/api/user/notification/${c.id}`);
        }
        const created = await client.ok('POST', '/api/v0.1/app/automation/add_template', {
            title: 'Template with notification', filter: { prompt: 'Only research' },
            tasks: [{ name: 'send_items', arguments: { source: 'email' } }],
        });
        const destination = created.tasks[0].args.destination;
        expect(created.tasks[0].type).toBe('notification');
        expect(destination).toBeTruthy();
        const channel = await client.ok('GET', `/api/user/notification/${destination}`);
        expect(channel).toMatchObject({ provider: 'local', type: 'disk' });
        await client.ok('DELETE', `/api/v0.1/app/automation/${created.id}`);
    });

    it('saves a form that sends back the run fields, without writing them', async () => {
        // The edit form returns the whole record; after a run last_run_at comes back as text (it once failed with
        // automations.update.bad_payload)
        const created = await client.ok('POST', '/api/v0.1/app/automation', { name: 'Ran before', source_key: staging.id, tasks: [] });
        const updated = await client.ok('PATCH', `/api/v0.1/app/automation/${created.id}`, {
            ...created, source_key: `${imap.id}:INBOX:`,
            last_run_at: '2026-11-11T14:25:53.000Z', last_issue_at: '2026-11-11T14:25:53.000Z', last_issue_level: 'warn',
        });
        expect(updated.source_key).toBe(`${imap.id}:INBOX:`);
        expect(updated.last_run_at ?? null).toBeNull();
        expect(updated.last_issue_level ?? null).toBeNull();
        await client.ok('DELETE', `/api/v0.1/app/automation/${created.id}`);
    });

    it('rejects a task that reads from an unknown input', async () => {
        const res = await client.post('/api/v0.1/app/automation', {
            name: 'Bad input', source_key: staging.id,
            tasks: [{ id: 't1', type: 'create_artifact', version: 1, label: 'S', inputs: ['nowhere'], args: { prompt: 'x' } }],
        });
        expect(res.status).toBe(422);
        expect(res.body.statusMessage).toBe('error table.automation.rules.tasks.inputs.not_found');
        expect(res.body.data.field).toBe('tasks.t1');
    });

    it('exports the source name and the rest of the key, and imports it again', async () => {
        await deleteAllAutomations(client);
        await client.ok('POST', '/api/v0.1/app/automation', { name: 'Exported staging', source_key: staging.id, filter_prompt: 'keep', tasks: [] });
        await client.ok('POST', '/api/v0.1/app/automation', { name: 'Exported imap', source_key: `${imap.id}:INBOX:${searchId}`, tasks: [] });
        const exported = await client.ok('GET', '/api/v0.1/app/automation/export');   // { version, timestamp, data }
        const byName = Object.fromEntries(exported.data.map((a: any) => [a.name, a]));
        expect(byName['Exported staging']).toMatchObject({ source_name: 'Staging', source_key_suffix: '' });
        expect(byName['Exported imap']).toMatchObject({ source_name: 'Mailbox', source_key_suffix: `:INBOX:${searchId}` });
        expect(byName['Exported imap'].source_label).toBeUndefined();

        await deleteAllAutomations(client);
        await client.ok('POST', '/api/v0.1/app/automation/import', exported);
        const imported = Object.fromEntries((await client.ok<any[]>('GET', '/api/v0.1/app/automation')).map((a) => [a.name, a]));
        expect(imported['Exported staging']).toMatchObject({ source_key: staging.id, filter_prompt: 'keep' });
        expect(imported['Exported imap'].source_key).toBe(`${imap.id}:INBOX:${searchId}`);
    });
});
