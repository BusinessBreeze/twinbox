// Data isolation between users and privilege escalation. User A owns one of everything; user B (role "user", logged
// in like a browser) tries every route on A's records and every admin route. Nothing of A may be returned, changed or
// deleted, and B may not gain rights. A's data is compared before and after.
import { describe, it, expect, beforeAll, afterAll, inject } from 'vitest';
import { TestClient, adminClient, createLocalChannel, stagingSource, userEvents, waitForEvent, type ApiResponse } from '../../helpers/client';
import { apiRoutes } from '../../helpers/routes';

const rows = (body: any): any[] => (Array.isArray(body) ? body : Array.isArray(body?.data) ? body.data : []);
const PASSWORD = 'isolation-test-password';

/** Refused: an error status, or an empty answer (no record). Never a 5xx. */
const expectRefused = (res: ApiResponse, what: string) => {
    expect(res.status, `${what}: no server error`).toBeLessThan(500);
    const data = res.body?.data;
    const empty = data === undefined || data === null || (Array.isArray(data) && data.length === 0);
    expect(res.status >= 400 || empty, `${what}: refused (status ${res.status}, ${JSON.stringify(res.body).slice(0, 160)})`).toBe(true);
};

describe('isolation between users', () => {
    let admin: TestClient;
    let a: TestClient;
    let b: TestClient;
    let bToken: TestClient;     // B through an API token instead of a session
    let aId: string;
    let bId: string;
    const A: Record<string, any> = {};
    let snapshot: string;

    const login = async (user: string) => {
        const client = new TestClient(inject('baseUrl'));
        expect((await client.login(user, PASSWORD)).status).toBe(200);
        return client;
    };

    /** Everything of A that B might touch, as A sees it (compared before and after B's attempts). */
    const stateOfA = async () => JSON.stringify({
        account: rows(await a.get('/api/user/account').then((r) => r.body)).map(({ updatedAt, ...rest }: any) => rest),
        sources: rows((await a.get('/api/v0.1/app/sources')).body).map((s: any) => [s.id, s.name, s.poll_seconds]),
        automations: rows((await a.get('/api/v0.1/app/automation')).body).map((x: any) => [x.id, x.name, x.active]),
        emails: rows((await a.get('/api/v0.1/app/email')).body).map((e: any) => [e.id, e.subject, e.staging_item]),
        channels: rows((await a.get('/api/user/notification')).body).map((c: any) => [c.id, c.name]),
        artifacts: rows((await a.get('/api/v0.1/app/artifacts')).body).map((f: any) => [f.id, f.file_id]).sort(),
        tokens: rows((await a.get('/api/user/account/tokens')).body).map((t: any) => t.id),
    });

    beforeAll(async () => {
        admin = await adminClient();
        const roles = rows(await admin.ok('GET', '/api/admin/role'));
        const userRole = roles.find((r: any) => r.name === 'user');
        aId = (await admin.ok('POST', '/api/admin/account', { user: 'isolation-a', password: PASSWORD, roles: [userRole.id] })).id;
        bId = (await admin.ok('POST', '/api/admin/account', { user: 'isolation-b', password: PASSWORD, roles: [userRole.id] })).id;
        a = await login('isolation-a');
        b = await login('isolation-b');
        bToken = new TestClient(inject('baseUrl'), (await b.ok('POST', '/api/user/account/tokens', { description: 'B token' })).token);

        // A: a source, staged emails, a channel, an automation that delivers there (its test run writes artifacts),
        // an event and an API token
        A.source = await a.ok('POST', '/api/v0.1/app/sources', {
            name: 'A mailbox', type: 'imap', config: { host: '127.0.0.1', port: 1, use_ssl: false, username: 'a', credential: 'secret-of-a' },
        });
        await a.ok('POST', '/api/v0.1/app/email/import', [{
            messageId: '<isolation-a@test>', subject: 'Private mail of A', from: 'x@example.com', to: 'a@example.com',
            date: '2026-10-10T10:00:00.000Z', text: 'Only A may read this.', html: '', staging_item: 1,
        }]);
        A.email = rows((await a.get('/api/v0.1/app/email')).body)[0];
        A.staging = await stagingSource(a);
        A.channel = await createLocalChannel(a, 'A local');
        A.automation = await a.ok('POST', '/api/v0.1/app/automation', {
            name: 'A automation', active: 0, source_key: A.staging.id, tasks: [
                { id: 't_n', type: 'notification', version: 1, label: 'Note', inputs: ['source'], aggregate: false, args: { destination: A.channel.id, keep_threadid: false } },
            ],
        });
        await a.ok('POST', `/api/v0.1/app/automation/${A.automation.id}/test`, {});
        A.artifact = rows((await a.get('/api/v0.1/app/artifacts')).body)[0];
        await a.post('/api/v0.1/app/sources/test', { id: A.source.id, name: 'A mailbox', type: 'imap', config: { host: '127.0.0.1', port: 1, use_ssl: false, username: 'a', credential: 'x' } });
        A.event = await waitForEvent(a, (e) => e.message === 'events.user.error_source_test_failed');
        A.token = await a.ok('POST', '/api/user/account/tokens', { description: 'A token' });
        expect(A.artifact, 'A has an artifact').toBeTruthy();

        snapshot = await stateOfA();
    });

    afterAll(async () => {
        await admin.request('DELETE', `/api/admin/account/${aId}`);
        await admin.request('DELETE', `/api/admin/account/${bId}`);
    });

    it('does not list A\'s records to B', async () => {
        const ids = (res: ApiResponse) => rows(res.body).map((x: any) => x.id);
        expect(ids(await b.get('/api/v0.1/app/sources'))).not.toContain(A.source.id);
        expect(ids(await b.get('/api/v0.1/app/automation'))).not.toContain(A.automation.id);
        expect(ids(await b.get('/api/v0.1/app/email'))).not.toContain(A.email.id);
        expect(ids(await b.get('/api/user/notification'))).not.toContain(A.channel.id);
        expect(ids(await b.get('/api/v0.1/app/artifacts'))).not.toContain(A.artifact.id);
        const storage = (await b.ok('GET', '/api/v0.1/app/storage'));
        expect([storage.artifacts.count, storage.emails.count, storage.files.bytes], 'B\'s storage counts only B\'s').toEqual([0, 0, 0]);
        expect(ids(await b.get('/api/user/event/search?limit=200'))).not.toContain(A.event.id);
        expect(ids(await b.get('/api/user/account/tokens'))).not.toContain(A.token.id);
        expect(rows((await b.get('/api/user/account')).body).map((x: any) => x.id)).toEqual([bId]);
        const keys = (await b.ok('GET', '/api/v0.1/app/sources/keys')).keys.map((k: any) => k.source_id);
        expect(keys).not.toContain(A.source.id);
        for (const path of ['/api/v0.1/app/sources/export', '/api/v0.1/app/automation/export', '/api/v0.1/app/email/export', '/api/user/notification/export']) {
            const text = JSON.stringify((await b.get(path)).body);
            for (const secret of [A.source.id, A.automation.id, 'Private mail of A', A.channel.id, 'secret-of-a']) {
                expect(text, `${path} leaks ${secret}`).not.toContain(secret);
            }
        }
    });

    it('does not let B read A\'s records by id', async () => {
        expectRefused(await b.get(`/api/v0.1/app/sources/${A.source.id}`), 'GET source');
        expectRefused(await b.get(`/api/v0.1/app/automation/${A.automation.id}`), 'GET automation');
        expectRefused(await b.get(`/api/user/notification/${A.channel.id}`), 'GET channel');
        expectRefused(await b.get(`/api/v0.1/app/artifacts/${A.artifact.id}`), 'GET artifact');
        // A file of another user is "not found", never "forbidden" (that would confirm it exists)
        for (const client of [b, bToken]) {
            for (const query of ['', '?inline=1']) {
                const res = await client.get(`/api/v0.1/app/files/${A.artifact.file_id}${query}`);
                expect(res.status, `GET A's file${query}`).toBe(404);
                expect(JSON.stringify(res.body)).not.toContain('Only A may read this');
            }
        }
        expectRefused(await b.get(`/api/v0.1/app/email?message_id=${encodeURIComponent('<isolation-a@test>')}`), 'GET email by message id');
        for (const client of [b, bToken]) {
            for (const format of ['', '?format=json', '?format=eml']) {
                const res = await client.get(`/api/v0.1/app/email/${A.email.id}${format}`);
                expect(res.status, `GET A's email${format}`).toBe(404);
                expect(JSON.stringify(res.body)).not.toContain('Only A may read this');
            }
        }
    });

    it('does not let B change, run or delete A\'s records', async () => {
        expectRefused(await b.patch(`/api/v0.1/app/sources/${A.source.id}`, { name: 'Taken by B', poll_seconds: 600 }), 'PATCH source');
        expectRefused(await b.post(`/api/v0.1/app/sources/${A.source.id}/run`, {}), 'run source');
        expectRefused(await b.patch(`/api/v0.1/app/automation/${A.automation.id}`, { name: 'Taken by B', active: 1 }), 'PATCH automation');
        expectRefused(await b.post(`/api/v0.1/app/automation/${A.automation.id}/test`, {}), 'test automation');
        expectRefused(await b.patch(`/api/user/notification/${A.channel.id}`, { name: 'Taken by B' }), 'PATCH channel');
        await b.request('PATCH', '/api/v0.1/app/email/set_staging', { ids: [A.email.id], staging_item: 0 });
        await b.request('DELETE', `/api/v0.1/app/sources/${A.source.id}`);
        await b.request('DELETE', '/api/v0.1/app/sources', { ids: [A.source.id] });
        await b.request('DELETE', `/api/v0.1/app/automation/${A.automation.id}`);
        await b.request('DELETE', '/api/v0.1/app/automation', { ids: [A.automation.id] });
        await b.request('DELETE', `/api/v0.1/app/email/${A.email.id}`);
        await b.request('DELETE', '/api/v0.1/app/email', { ids: [A.email.id] });
        await b.request('DELETE', `/api/user/notification/${A.channel.id}`);
        await b.request('DELETE', '/api/user/notification', { ids: [A.channel.id] });
        await b.request('DELETE', `/api/v0.1/app/artifacts/${A.artifact.id}`);
        await b.request('DELETE', '/api/v0.1/app/artifacts', { ids: [A.artifact.id] });
        await b.request('DELETE', '/api/user/event', { ids: [A.event.id] });
        await b.request('DELETE', `/api/user/account/tokens/${A.token.id}`);
        await b.patch(`/api/user/account/${aId}`, { lang: 'de' });            // the own account only, whatever the id
        await b.patch(`/api/user/account/password/${aId}`, { password: 'b-sets-a-password' });

        expect(await stateOfA()).toBe(snapshot);
        expect((await new TestClient(inject('baseUrl')).login('isolation-a', PASSWORD)).status).toBe(200);
        expect(rows((await a.get('/api/user/event/search?limit=200')).body).map((e: any) => e.id)).toContain(A.event.id);
    });

    it('keeps B\'s copy of the same email apart from A\'s', async () => {
        // The same message in both mailboxes (or B's source on A's mailbox): B gets its own record, A's stays A's
        await b.ok('POST', '/api/v0.1/app/email/import', [{
            messageId: '<isolation-a@test>', subject: 'B copy', from: 'x@example.com', to: 'b@example.com',
            date: '2026-10-10T10:00:00.000Z', text: 'B text', html: '',
        }]);
        const mine = rows((await b.get(`/api/v0.1/app/email?message_id=${encodeURIComponent('<isolation-a@test>')}`)).body);
        expect(mine.map((e: any) => e.subject)).toEqual(['B copy']);
        expect(mine[0].id).not.toBe(A.email.id);
        await b.request('DELETE', `/api/v0.1/app/email/${mine[0].id}`);
        expect(await stateOfA()).toBe(snapshot);
    });

    it('does not let B use A\'s records in its own', async () => {
        // an automation on A's source, delivering to A's channel
        const onSource = await b.post('/api/v0.1/app/automation', { name: 'B on A source', active: 0, source_key: `${A.source.id}:INBOX:`, tasks: [] });
        expect(onSource.status).toBeGreaterThanOrEqual(400);
        const bStaging = await stagingSource(b);
        const toChannel = await b.post('/api/v0.1/app/automation', {
            name: 'B to A channel', active: 0, source_key: bStaging.id, tasks: [
                { id: 't_n', type: 'notification', version: 1, label: 'Note', inputs: ['source'], aggregate: false, args: { destination: A.channel.id, keep_threadid: false } },
            ],
        });
        expect(toChannel.status, `delivering to A's channel: ${JSON.stringify(toChannel.body).slice(0, 160)}`).toBeGreaterThanOrEqual(400);
        const draft = await b.post('/api/v0.1/app/automation/draft', { intent: 'x', channel_id: A.channel.id });
        expect(draft.status).toBeGreaterThanOrEqual(400);
        // an import naming A's source: never linked to it
        await b.post('/api/v0.1/app/automation/import', [{ name: 'B imported', active: 0, source_name: 'A mailbox', source_key_suffix: ':INBOX:', tasks: [] }]);
        for (const x of rows((await b.get('/api/v0.1/app/automation')).body)) {
            expect(x.source_id, `${x.name} uses A's source`).not.toBe(A.source.id);
        }
    });

    it('refuses every non-admin route that takes an id when B passes one of A\'s ids (session and token)', async () => {
        const values = [aId, A.source.id, A.automation.id, A.email.id, A.channel.id, A.artifact.id, A.artifact.file_id, A.event.id, A.token.id];
        const secrets = ['Private mail of A', 'Only A may read this', 'secret-of-a'];
        const routes = apiRoutes().filter((r) => r.params.length > 0 && !r.path.startsWith('/api/admin') && !r.path.startsWith('/api/auth'));
        expect(routes.map((r) => r.path)).toContain('/api/v0.1/app/files/:id');
        for (const client of [b, bToken]) {
            for (const route of routes) {
                for (const value of values) {
                    const path = route.params.reduce((p, name) => p.replace(`:${name}`, encodeURIComponent(value)), route.path);
                    const res = await client.request(route.method, path, route.method === 'GET' ? undefined : {});
                    const what = `${client === b ? 'session' : 'token'} ${route.method} ${path}`;
                    expect(res.status, `${what}: no server error`).toBeLessThan(500);
                    const text = JSON.stringify(res.body);
                    for (const secret of secrets) expect(text, `${what} leaks "${secret}"`).not.toContain(secret);
                }
            }
        }
        expect(await stateOfA()).toBe(snapshot);
    });

    it('refuses every user route without a login', async () => {
        const anonymous = new TestClient(inject('baseUrl'));
        for (const route of apiRoutes().filter((r) => r.path.startsWith('/api/user') || r.path.startsWith('/api/v0'))) {
            const path = route.params.reduce((p, name) => p.replace(`:${name}`, A.artifact.file_id), route.path);
            const res = await anonymous.request(route.method, path, route.method === 'GET' ? undefined : {});
            expect([401, 403], `${route.method} ${path} -> ${res.status}`).toContain(res.status);
        }
    });

    it('lets the admin read A\'s email, and tells A in its event log', async () => {
        // The admin table lists metadata only; opening one email is a logged access
        const listed = rows(await admin.ok('GET', '/api/admin/app/email')).find((e: any) => e.id === A.email.id);
        expect(listed.subject).toBe('Private mail of A');
        expect(listed.text).toBeUndefined();
        expect(listed.content).toBeUndefined();
        expect((await userEvents(a)).some((e) => e.message === 'events.user.info_admin_read')).toBe(false);

        const opened = await admin.ok('GET', `/api/admin/app/email/${A.email.id}`);
        expect(opened.text).toBe('Only A may read this.');
        const logged = await waitForEvent(a, (e) => e.message === 'events.user.info_admin_read');
        expect(logged.metadata).toMatchObject({ type: 'email', ids: [A.email.id] });
        expect(logged.metadata.admin_id).toBeTruthy();
        expect(await stateOfA()).toBe(snapshot);
    });

    it('does not let B into admin routes or raise its own rights', async () => {
        const adminRoutes: Array<[string, string, unknown?]> = [
            ['GET', '/api/admin/account'], ['GET', `/api/admin/account/${aId}`], ['PATCH', `/api/admin/account/${bId}`, { roles: [] }],
            ['POST', '/api/admin/account', { user: 'made-by-b', password: PASSWORD, roles: [] }], ['DELETE', `/api/admin/account/${aId}`],
            ['GET', `/api/admin/account/${aId}/tokens`], ['DELETE', `/api/admin/account/${aId}/tokens/${A.token.id}`],
            ['POST', '/api/admin/ident/set', { id: aId }],
            ['POST', '/api/admin/role', { name: 'b-admin', permissions: ['*'] }], ['PATCH', '/api/admin/role/x', { permissions: ['*'] }],
            ['GET', '/api/admin/notification'], ['GET', '/api/admin/app/email'], ['GET', '/api/admin/app/sources'], ['GET', '/api/admin/app/automation'],
            ['DELETE', `/api/admin/app/email/${A.email.id}`], ['DELETE', `/api/admin/app/sources/${A.source.id}`], ['DELETE', `/api/admin/app/automation/${A.automation.id}`],
        ];
        for (const [method, path, body] of adminRoutes) {
            const res = await b.request(method, path, body);
            expect(res.status, `${method} ${path} -> ${res.status} ${JSON.stringify(res.body).slice(0, 120)}`).toBeGreaterThanOrEqual(400);
            expect(res.status, `${method} ${path}: no server error`).toBeLessThan(500);
        }

        // Its own account: roles, permissions and cron cannot be set to gain rights
        const adminRole = rows(await admin.ok('GET', '/api/admin/role')).find((r: any) => r.name === 'admin');
        await b.patch(`/api/user/account/${bId}`, { roles: [adminRole.id], permissions: ['*'] });
        const me = rows((await b.get('/api/user/account')).body)[0];
        expect(me.roles).not.toContain(adminRole.id);
        const relogin = new TestClient(inject('baseUrl'));
        await relogin.login('isolation-b', PASSWORD);
        expect((await relogin.get('/api/admin/account')).status).toBeGreaterThanOrEqual(400);
        // Registration (if open) cannot ask for roles either
        const reg = await new TestClient(inject('baseUrl')).post('/api/auth/register', { user: 'isolation-reg', password: PASSWORD, roles: [adminRole.id] });
        if (reg.status < 300) {
            const created = rows(await admin.ok('GET', '/api/admin/account')).find((x: any) => x.user === 'isolation-reg');
            expect(created?.roles ?? []).not.toContain(adminRole.id);
            if (created) await admin.request('DELETE', `/api/admin/account/${created.id}`);
        }

        expect(await stateOfA()).toBe(snapshot);
    });
});
