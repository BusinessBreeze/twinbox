// Bad input on every create/update route: wrong types, null, blank, huge or control-character text, an oversized body,
// odd ids and artifact paths that try to leave the user's folder. Each must be refused with a clean 4xx (the field
// named where there is one), never a 5xx; valid but unusual text (Unicode, emoji) must be accepted unchanged.
import { describe, it, expect, beforeAll, afterAll, inject } from 'vitest';
import { TestClient, adminClient, adminSessionClient, deleteAllAutomations, stagingSource, type ApiResponse } from '../../helpers/client';

const rows = (body: any): any[] => (Array.isArray(body) ? body : Array.isArray(body?.data) ? body.data : []);

// Values a text field must not accept
const BAD_TEXT: Array<[string, unknown]> = [
    ['a number', 123], ['a boolean', true], ['null', null], ['an object', { a: 1 }], ['an array', ['x']],
    ['blank', '   '], ['huge', 'x'.repeat(100_000)], ['control characters', 'a\u0000b\u0007c'],
];
const UNUSUAL = 'Ünïcödé 📬 名前 – “quotes” & <tags>';

const expectRefused = (res: ApiResponse, what: string) => {
    expect.soft(res.status, `${what}: no server error (${JSON.stringify(res.body).slice(0, 160)})`).toBeLessThan(500);
    expect.soft(res.status, `${what}: refused (${JSON.stringify(res.body).slice(0, 160)})`).toBeGreaterThanOrEqual(400);
};

describe('bad input', () => {
    let client: TestClient;
    let session: TestClient;
    let staging: any;
    let me: any;

    beforeAll(async () => {
        client = await adminClient();
        session = await adminSessionClient();
        await deleteAllAutomations(client);
        staging = await stagingSource(client);
        me = rows(await client.ok('GET', '/api/user/account'))[0] ?? await client.ok('GET', '/api/user/account');
    });
    afterAll(async () => {
        await deleteAllAutomations(client);
        for (const s of rows((await client.get('/api/v0.1/app/sources')).body).filter((s: any) => s.type !== 'staging')) {
            await client.request('DELETE', `/api/v0.1/app/sources/${s.id}`);
        }
    });

    // One text field per route, the rest of the body valid
    const imapConfig = { host: 'imap.example.com', port: 993, use_ssl: true, username: 'u', credential: 'p' };
    const routes: Array<{ what: string; method: string; path: () => string; body: (v: unknown) => unknown; as?: () => TestClient }> = [
        { what: 'source name', method: 'POST', path: () => '/api/v0.1/app/sources', body: (v) => ({ name: v, type: 'imap', config: imapConfig }) },
        { what: 'source host', method: 'POST', path: () => '/api/v0.1/app/sources', body: (v) => ({ name: 'Bad host', type: 'imap', config: { ...imapConfig, host: v } }) },
        { what: 'automation name', method: 'POST', path: () => '/api/v0.1/app/automation', body: (v) => ({ name: v, active: 0, source_key: staging.id, tasks: [] }) },
        { what: 'automation filter', method: 'POST', path: () => '/api/v0.1/app/automation', body: (v) => ({ name: 'Bad filter', active: 0, source_key: staging.id, filter_prompt: v, tasks: [] }) },
        { what: 'channel name', method: 'POST', path: () => '/api/user/notification', body: (v) => ({ name: v, provider: 'apprise', type: 'json', config: {} }) },
        { what: 'token description', method: 'POST', path: () => '/api/user/account/tokens', body: (v) => ({ description: v }), as: () => session },
        { what: 'username', method: 'PATCH', path: () => `/api/user/account/${me.id}`, body: (v) => ({ user: v }) },
        { what: 'draft intent', method: 'POST', path: () => '/api/v0.1/app/automation/draft', body: (v) => ({ intent: v, channel_id: 'x' }) },
        { what: 'role name', method: 'POST', path: () => '/api/admin/role', body: (v) => ({ name: v, permissions: [] }) },
        { what: 'account user', method: 'POST', path: () => '/api/admin/account', body: (v) => ({ user: v, password: 'long-enough-password', roles: [] }) },
    ];

    for (const route of routes) {
        it(`refuses bad values for the ${route.what}`, async () => {
            for (const [label, value] of BAD_TEXT) {
                // Blank/huge/control text is fine where any text is allowed (filter prompt: blank = no filter, huge = refused)
                // null and blank clear the filter
                if (route.what === 'automation filter' && (label === 'blank' || label === 'null' || label === 'control characters')) continue;
                if (route.what === 'draft intent' && (label === 'blank' || label === 'control characters')) continue;
                const res = await (route.as?.() ?? client).request(route.method, route.path(), route.body(value));
                expectRefused(res, `${route.what} as ${label}`);
            }
        });
    }

    it('accepts Unicode and emoji and returns them unchanged', async () => {
        const source = await client.ok('POST', '/api/v0.1/app/sources', { name: UNUSUAL, type: 'imap', config: imapConfig });
        expect(source.name).toBe(UNUSUAL);
        const automation = await client.ok('POST', '/api/v0.1/app/automation', { name: UNUSUAL, active: 0, source_key: staging.id, filter_prompt: UNUSUAL, tasks: [] });
        expect(automation.name).toBe(UNUSUAL);
        expect(automation.filter_prompt).toBe(UNUSUAL);
        expect((await client.ok('GET', `/api/v0.1/app/automation/${automation.id}`)).name).toBe(UNUSUAL);
    });

    it('refuses bodies of the wrong shape', async () => {
        for (const body of [[1, 2], 'text', 42, null]) {
            expectRefused(await client.post('/api/v0.1/app/sources', body), `source body ${JSON.stringify(body)}`);
            expectRefused(await client.post('/api/v0.1/app/automation', body), `automation body ${JSON.stringify(body)}`);
        }
        expectRefused(await client.post('/api/v0.1/app/automation', { name: 'Bad tasks', active: 0, source_key: staging.id, tasks: 'all' }), 'tasks as text');
        expectRefused(await client.post('/api/v0.1/app/automation', { name: 'Bad task', active: 0, source_key: staging.id, tasks: [{ id: 1 }] }), 'task without type');
        expectRefused(await client.post('/api/v0.1/app/email/import', { not: 'a list' }), 'email import body');
    });

    it('refuses an oversized body without falling over', async () => {
        const res = await client.post('/api/v0.1/app/automation', { name: 'Big', active: 0, source_key: staging.id, tasks: [], padding: 'x'.repeat(8 * 1024 * 1024) });
        expectRefused(res, '8 MB body');
        expect(res.status).toBe(413);
        expect((await client.get('/api/v0.1/app/automation')).status).toBe(200);   // still serving
    });

    it('answers odd ids with "not found", not an error', async () => {
        for (const id of ["'; DROP TABLE sources; --", '%00', '../../etc/passwd', 'x'.repeat(5000)]) {
            for (const path of [`/api/v0.1/app/sources/${encodeURIComponent(id)}`, `/api/v0.1/app/automation/${encodeURIComponent(id)}`, `/api/user/notification/${encodeURIComponent(id)}`]) {
                const res = await client.get(path);
                expect(res.status, `${path} -> ${res.status}`).toBeLessThan(500);
                expect(res.body?.data ?? null, `${path} returned data`).toBeFalsy();
            }
        }
        expect((await client.get('/api/v0.1/app/sources')).status).toBe(200);
    });

    it('never serves anything but the user\'s own stored files', async () => {
        for (const name of ['../../../../etc/passwd', '..%2F..%2F..%2Fetc%2Fpasswd', '../other-user/file.md', '/etc/passwd', '%2e%2e%2f%2e%2e%2fetc%2fpasswd', "'; DROP TABLE files; --"]) {
            const id = name.includes('%') ? name : encodeURIComponent(name);
            for (const path of [`/api/v0.1/app/files/${id}`, `/api/v0.1/app/files/${id}?inline=1`, `/api/v0.1/app/artifacts/${id}`]) {
                const res = await session.get(path);
                expect(res.status, `${path} -> ${res.status}`).toBeGreaterThanOrEqual(400);
                expect(res.status).toBeLessThan(500);
                expect(String(res.body)).not.toContain('root:');
            }
            const del = await session.request('DELETE', `/api/v0.1/app/artifacts/${id}`);
            expect(del.status, `delete artifact ${name} -> ${del.status}`).toBeLessThan(500);
        }
        expect(require('node:fs').existsSync('/etc/passwd')).toBe(true);
    });
});
