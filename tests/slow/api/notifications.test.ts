import { describe, it, expect, beforeAll } from 'vitest';
import { adminClient, createLocalChannel, type TestClient } from '../../helpers/client';

// The server validates notification channels with the shared rules (shared/rules/notification_channels.ts in the base app)
const BASE = '/api/user/notification';
const local = { name: 'Rules check', provider: 'local', type: 'disk', config: { template: 'file://' } };
const reason = (res: any) => String(res.body?.statusMessage || res.body?.message || '');

describe('notification channel validation', () => {
    let client: TestClient;
    beforeAll(async () => { client = await adminClient(); });

    it('creates a valid channel and drops config keys its template does not use', async () => {
        const created = await createLocalChannel(client, 'Rules local');   // the fixture carries a stray "schema" key
        expect(created.config).toEqual({ template: 'file://' });
    });

    it('refuses an empty name', async () => {
        const res = await client.post(BASE, { ...local, name: ' ' });
        expect(res.status).toBe(422);
        expect(reason(res)).toContain('table.notification_channels.rules.name.required');
    });

    it('refuses a type the provider does not offer', async () => {
        const res = await client.post(BASE, { ...local, type: 'carrier_pigeon' });
        expect(res.status).toBe(422);
        expect(reason(res)).toContain('table.notification_channels.rules.type.invalid');
    });

    it('refuses a template the type does not offer', async () => {
        const res = await client.post(BASE, { ...local, config: { template: 'ftp://{host}' } });
        expect(res.status).toBe(422);
        expect(reason(res)).toContain('table.notification_channels.rules.config.template');
    });

    it('checks a partial update as the whole channel', async () => {
        const created = await client.ok('POST', BASE, { ...local, name: 'Rules partial' });
        const renamed = await client.ok('PATCH', `${BASE}/${created.id}`, { name: 'Rules renamed' });
        expect(renamed.name).toBe('Rules renamed');
        expect(renamed.config).toEqual({ template: 'file://' });

        const res = await client.patch(`${BASE}/${created.id}`, { type: 'carrier_pigeon' });
        expect(res.status).toBe(422);
    });

    it('reports an invalid channel as a failed test instead of throwing', async () => {
        const res = await client.post(`${BASE}/test`, { ...local, type: 'carrier_pigeon' });
        expect(res.status).toBe(200);
        expect(res.body.ok).toBe(false);
    });
});
