import { describe, it, expect, inject, beforeAll } from 'vitest';
import { TestClient, adminClient, adminSessionClient } from '../../helpers/client';

// API tokens: created by the logged-in user, shown once, stored as a hash. A request with "Authorization: Bearer"
// runs as the token's account, except for token management, the password, impersonation and auth.
const reason = (res: any) => String(res.body?.statusMessage || res.body?.message || '');

describe('API tokens', () => {
    let client: TestClient;          // session: tokens are managed only with a login
    let accountId: string;
    beforeAll(async () => {
        client = await adminSessionClient();
        accountId = (await client.ok<any[]>('GET', '/api/user/account'))[0].id;
    });

    it('creates a token, shows it once and lists it without secrets', async () => {
        const created = await client.ok('POST', '/api/user/account/tokens', { description: '  Test script ' });
        expect(created.token).toMatch(/^tbx_/);
        expect(created.description).toBe('Test script');
        expect(created.hash).toBeUndefined();

        const list = await client.ok<any[]>('GET', '/api/user/account/tokens');
        const listed = list.find((t) => t.id === created.id);
        expect(listed).toMatchObject({ description: 'Test script', last_used_at: null });
        expect(listed.token).toBeUndefined();
        expect(listed.hash).toBeUndefined();
        await client.ok('DELETE', `/api/user/account/tokens/${created.id}`);
    });

    it('refuses an empty description', async () => {
        const res = await client.post('/api/user/account/tokens', { description: ' ' });
        expect(res.status).toBe(422);
        expect(reason(res)).toBe('error table.api_tokens.rules.description.required');
    });

    it('authenticates API requests with the token and records the use', async () => {
        const created = await client.ok('POST', '/api/user/account/tokens', { description: 'Bearer test' });
        const bearer = new TestClient(inject('baseUrl'), created.token);

        expect((await bearer.get('/api/v0.1/app/sources')).status).toBe(200);
        expect((await bearer.ok<any[]>('GET', '/api/user/account'))[0].id).toBe(accountId);
        expect(bearer.cookie).toBe('');   // no session is started for a token
        // admin routes work with the account's permissions
        expect((await bearer.get('/api/admin/account')).status).toBe(200);

        const listed = (await client.ok<any[]>('GET', '/api/user/account/tokens')).find((t) => t.id === created.id);
        expect(listed.last_used_at).not.toBeNull();
        await client.ok('DELETE', `/api/user/account/tokens/${created.id}`);
    });

    it('rejects unknown and deleted tokens', async () => {
        expect((await new TestClient(inject('baseUrl'), 'tbx_nope').get('/api/v0.1/app/sources')).status).toBe(401);

        const created = await client.ok('POST', '/api/user/account/tokens', { description: 'Deleted' });
        await client.ok('DELETE', `/api/user/account/tokens/${created.id}`);
        const res = await new TestClient(inject('baseUrl'), created.token).get('/api/v0.1/app/sources');
        expect(res.status).toBe(401);
        expect(reason(res)).toBe('error auth.token.invalid');
    });

    it('does not let a token manage tokens, change the password or impersonate', async () => {
        const created = await client.ok('POST', '/api/user/account/tokens', { description: 'Restricted' });
        const bearer = new TestClient(inject('baseUrl'), created.token);

        for (const [method, path] of [
            ['GET', '/api/user/account/tokens'],
            ['POST', '/api/user/account/tokens'],
            ['DELETE', `/api/user/account/tokens/${created.id}`],
            ['PATCH', `/api/user/account/password/${accountId}`],
            ['GET', `/api/admin/account/${accountId}/tokens`],
            ['POST', '/api/admin/ident/set'],
            ['POST', '/api/auth/logout'],
        ]) {
            const res = await bearer.request(method, path, method === 'GET' || method === 'DELETE' ? undefined : {});
            expect(res.status, `${method} ${path}`).toBe(403);
            expect(reason(res)).toBe('error auth.token.not_allowed');
        }
        await client.ok('DELETE', `/api/user/account/tokens/${created.id}`);
    });

    it('lets an admin list and revoke an account\'s tokens', async () => {
        const created = await client.ok('POST', '/api/user/account/tokens', { description: 'Admin revoke' });
        const list = await client.ok<any[]>('GET', `/api/admin/account/${accountId}/tokens`);
        expect(list.map((t) => t.id)).toContain(created.id);
        expect(list[0].hash).toBeUndefined();

        await client.ok('DELETE', `/api/admin/account/${accountId}/tokens/${created.id}`);
        expect((await client.ok<any[]>('GET', '/api/user/account/tokens')).map((t) => t.id)).not.toContain(created.id);
        expect((await client.delete(`/api/admin/account/${accountId}/tokens/${created.id}`)).status).toBe(404);
    });

    it('never returns password or token hashes with accounts', async () => {
        const accounts = await client.ok<any[]>('GET', '/api/admin/account');
        for (const a of accounts) {
            expect(a.password).toBeUndefined();
            expect(a.tokens).toBeUndefined();
        }
    });
});

describe('the test suite token', () => {
    it('is the admin\'s token from tests/.env and is sent by adminClient', async () => {
        const client = await adminClient();
        expect(client.token).toBe(inject('apiToken'));
        const [me] = await client.ok<any[]>('GET', '/api/user/account');
        expect(me.user).toBe(inject('adminUser'));
        expect(client.cookie).toBe('');
    });
});
