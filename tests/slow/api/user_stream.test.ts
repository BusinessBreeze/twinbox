// Live updates (base: server/api/user/stream.get.ts, server/utils/user_stream.ts): event names only, only the owner's,
// session only, at most limits.stream.max_per_user streams per user.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestClient, adminClient, fixture, seedArtifact } from '../../helpers/client';

const PASSWORD = 'stream-test-password';
const rows = (body: any): any[] => (Array.isArray(body) ? body : Array.isArray(body?.data) ? body.data : []);

/** An open stream: everything it received, as lines. */
const openStream = async (client: TestClient) => {
    const ctrl = new AbortController();
    const res = await fetch(`${client.baseUrl}/api/user/stream`, {
        headers: { ...(client.cookie ? { cookie: client.cookie } : {}), ...(client.token ? { authorization: `Bearer ${client.token}` } : {}) },
        signal: ctrl.signal,
    });
    const stream = { status: res.status, type: res.headers.get('content-type') || '', text: '', ended: false, close: () => ctrl.abort() };
    if (res.status === 200 && res.body) {
        (async () => {
            const reader = res.body!.getReader();
            const decoder = new TextDecoder();
            try {
                for (;;) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    stream.text += decoder.decode(value, { stream: true });
                }
            } catch { /* aborted */ }
            stream.ended = true;
        })();
    } else {
        await res.text().catch(() => '');
    }
    return stream;
};
type Stream = Awaited<ReturnType<typeof openStream>>;
const messages = (s: Stream) => s.text.split('\n').filter((l) => l.startsWith('data:'));
const until = async (check: () => boolean, ms = 5000) => {
    const end = Date.now() + ms;
    while (!check() && Date.now() < end) await new Promise((r) => setTimeout(r, 50));
    return check();
};

describe('live update stream', () => {
    let admin: TestClient;
    let a: TestClient;
    let b: TestClient;
    const opened: Stream[] = [];
    const open = async (client: TestClient) => { const s = await openStream(client); opened.push(s); return s; };

    beforeAll(async () => {
        admin = await adminClient();
        const userRole = rows(await admin.ok('GET', '/api/admin/role')).find((r: any) => r.name === 'user');
        for (const user of ['stream-a', 'stream-b']) {
            await admin.ok('POST', '/api/admin/account', { user, password: PASSWORD, roles: [userRole.id] });
        }
        a = new TestClient(admin.baseUrl);
        b = new TestClient(admin.baseUrl);
        expect((await a.login('stream-a', PASSWORD)).status).toBe(200);
        expect((await b.login('stream-b', PASSWORD)).status).toBe(200);
    });
    afterAll(() => opened.forEach((s) => s.close()));

    it('refuses anonymous requests and API tokens', async () => {
        // Anonymous requests are refused by the base's session middleware before the route (403, like all /api/user)
        expect([401, 403]).toContain((await open(new TestClient(admin.baseUrl))).status);
        expect((await open(admin)).status).toBe(403);
    });

    it('sends a user event of A to A only, as a name without data', async () => {
        const sa = await open(a);
        const sb = await open(b);
        expect(sa.status).toBe(200);
        expect(sa.type).toContain('text/event-stream');
        expect(await until(() => sa.text.includes('retry: 5000'))).toBe(true);

        // An invalid channel test stores an error event for the caller
        await a.post('/api/user/notification/test', {});
        expect(await until(() => messages(sa).includes('data: events'))).toBe(true);
        await new Promise((r) => setTimeout(r, 1500));
        // B gets nothing of A's ('system' goes to everyone every 30 s and may arrive meanwhile)
        expect(messages(sb).filter((m) => m !== 'data: system')).toEqual([]);

        // Nothing but names and comments on the wire
        for (const line of sa.text.split('\n').filter(Boolean)) expect(line).toMatch(/^(data: [a-z_]+|retry: \d+|: ping)$/);
    });

    it('tells the other tabs when events are deleted', async () => {
        const events = rows(await a.ok('GET', '/api/user/event/search?limit=5'));
        expect(events.length).toBeGreaterThan(0);
        const tab = await open(a);
        await until(() => tab.text.includes('retry'));
        await new Promise((r) => setTimeout(r, 1100));     // past the cooldown of the event above
        await a.request('DELETE', '/api/user/event', { ids: [events[0].id] });
        expect(await until(() => messages(tab).includes('data: events'))).toBe(true);
    });

    it('tells the owner about automation changes and a source run: jobs, sources, automations', async () => {
        const tab = await open(a);
        await until(() => tab.text.includes('retry'));
        await new Promise((r) => setTimeout(r, 1100));     // past the cooldown of earlier names
        const staging = (await a.ok<any[]>('GET', '/api/v0.1/app/sources')).find((src) => src.type === 'staging');
        await a.ok('POST', '/api/v0.1/app/email/import', fixture('emails.json').slice(0, 2));
        const automation = await a.ok('POST', '/api/v0.1/app/automation', { name: 'Stream run', source_key: staging.id, tasks: [] });
        expect(await until(() => messages(tab).includes('data: automations'))).toBe(true);

        await new Promise((r) => setTimeout(r, 1100));
        const before = messages(tab).length;
        await a.ok('POST', `/api/v0.1/app/sources/${staging.id}/run`);
        // queued (jobs), polled (sources), ran (automations), ended (jobs); names within a second may arrive together
        expect(await until(() => {
            const after = messages(tab).slice(before);
            return ['data: jobs', 'data: sources', 'data: automations'].every((m) => after.includes(m));
        }, 20_000)).toBe(true);
        expect(messages(tab).slice(before)[0]).toBe('data: jobs');

        await new Promise((r) => setTimeout(r, 1100));
        const beforeDelete = messages(tab).length;
        await a.ok('DELETE', `/api/v0.1/app/automation/${automation.id}`);
        expect(await until(() => messages(tab).slice(beforeDelete).includes('data: automations'))).toBe(true);
    });

    it('tells the owner when emails and artifacts change', async () => {
        const tab = await open(a);
        await until(() => tab.text.includes('retry'));
        const after = async (action: () => Promise<unknown>, name: string) => {
            await new Promise((r) => setTimeout(r, 1100));                 // past the cooldown of earlier names
            const before = messages(tab).length;
            await action();
            return until(() => messages(tab).slice(before).includes(`data: ${name}`));
        };
        // stored (an import of emails not yet known), then deleted
        const fresh = fixture<any[]>('emails.json').slice(2, 3).map((e) => ({ ...e, messageId: e.messageId.replace('@', '.stream@') }));
        expect(await after(() => a.ok('POST', '/api/v0.1/app/email/import', fresh), 'emails')).toBe(true);
        const email = (await a.ok<any[]>('GET', '/api/v0.1/app/email')).find((e) => e.messageId === fresh[0].messageId);
        expect(await after(() => a.ok('DELETE', `/api/v0.1/app/email/${email.id}`), 'emails')).toBe(true);

        const me = await a.ok('GET', '/api/user/account');
        const artifact = await seedArtifact(me.id ?? me[0]?.id, 'stream.txt', 'text/plain', 'live update test');
        expect(await after(() => a.ok('DELETE', `/api/v0.1/app/artifacts/${artifact.id}`), 'artifacts')).toBe(true);
    });

    it('closes the oldest stream above the limit of one user', async () => {
        const streams: Stream[] = [];
        for (let i = 0; i < 11; i++) { streams.push(await open(b)); await until(() => streams[i]!.text.includes('retry')); }
        expect(await until(() => streams[0]!.ended)).toBe(true);
        expect(streams[10]!.ended).toBe(false);
    });

    it('ends the user\'s streams on sign-out', async () => {
        const c = new TestClient(admin.baseUrl);
        expect((await c.login('stream-a', PASSWORD)).status).toBe(200);
        const s = await open(c);
        await until(() => s.text.includes('retry'));
        await c.post('/api/auth/logout', {});
        expect(await until(() => s.ended)).toBe(true);
    });
});
