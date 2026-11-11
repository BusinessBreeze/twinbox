import { describe, it, expect, beforeAll } from 'vitest';
import { adminClient, stagingSource, type TestClient } from '../../helpers/client';

// genericService.validate: each field that is sent is checked (0, '' and false included); a field that isn't sent
// keeps its stored value. Errors carry the rule's message key and the field.
const reason = (res: any) => String(res.body?.statusMessage || res.body?.message || '');

describe('field validation on create and update', () => {
    let client: TestClient;
    let imapId: string;
    beforeAll(async () => {
        client = await adminClient();
        const imap = await client.ok('POST', '/api/v0.1/app/sources', {
            name: 'Validation IMAP', type: 'imap',
            config: { host: 'imap.example.com', port: 993, use_ssl: true, username: 'u', credential: 'p' },
        });
        imapId = imap.id;
    });

    it('refuses an empty name on update with the rule message', async () => {
        const res = await client.patch(`/api/v0.1/app/sources/${imapId}`, { name: '' });
        expect(res.status).toBe(422);
        expect(reason(res)).toBe('error table.sources.rules.name.min');
        expect(res.body?.data?.field).toBe('name');
    });

    it('accepts 0 and keeps the fields that are not sent', async () => {
        const updated = await client.ok('PATCH', `/api/v0.1/app/sources/${imapId}`, { retention_days: 0, max_items: 0 });
        expect(updated.retention_days).toBe(0);
        expect(updated.name).toBe('Validation IMAP');
        expect(updated.poll_seconds).toBe(3600);
    });

    it('applies LIMITS_* env overrides (the tests set LIMITS_SOURCES_MIN_POLL_SECONDS=120)', async () => {
        const res = await client.patch(`/api/v0.1/app/sources/${imapId}`, { poll_seconds: 90 });
        expect(res.status).toBe(422);
        expect(reason(res)).toBe('error table.sources.rules.poll_seconds.min');
        expect((await client.ok('PATCH', `/api/v0.1/app/sources/${imapId}`, { poll_seconds: 120 })).poll_seconds).toBe(120);
    });

    it('sends the server limits to the browser in the page payload', async () => {
        const html = await (await fetch(client.baseUrl + '/login')).text();
        expect(html).toContain('min_poll_seconds');
    });

    it('checks numbers sent as text', async () => {
        const res = await client.patch(`/api/v0.1/app/sources/${imapId}`, { poll_seconds: 'soon' });
        expect(res.status).toBe(422);
        expect(reason(res)).toBe('error table.sources.rules.poll_seconds.invalid');
    });

    it('reports the config field of the source type', async () => {
        const res = await client.post('/api/v0.1/app/sources', {
            name: 'Bad port', type: 'imap',
            config: { host: 'imap.example.com', port: 70000, use_ssl: true, username: 'u', credential: 'p' },
        });
        expect(res.status).toBe(422);
        expect(reason(res)).toBe('error table.sources.rules.config.port.invalid');
        expect(res.body?.data?.field).toBe('config.port');
    });

    it('refuses an empty automation name on update', async () => {
        const staging = await stagingSource(client);
        const created = await client.ok('POST', '/api/v0.1/app/automation', { name: 'Validation auto', active: 0, source_key: staging.id, tasks: [] });
        const res = await client.patch(`/api/v0.1/app/automation/${created.id}`, { name: '' });
        expect(res.status).toBe(422);
        expect(reason(res)).toBe('error table.automation.rules.name.min');
        await client.ok('DELETE', `/api/v0.1/app/automation/${created.id}`);
    });

    it('refuses an empty username for the own account', async () => {
        const me = await client.ok('GET', '/api/user/account');
        const id = (Array.isArray(me) ? me[0] : me).id;
        const res = await client.patch(`/api/user/account/${id}`, { user: '' });
        expect(res.status).toBe(422);
        expect(reason(res)).toBe('error table.account.rules.user.required');
    });
});
