// User events: kept until the user deletes them (bell, dashboard); there is no "read" any more.
import { describe, it, expect, beforeAll, afterAll, inject } from 'vitest';
import { TestClient, adminClient, waitForEvent } from '../../helpers/client';

const rows = (body: any): any[] => (Array.isArray(body) ? body : body?.data ?? []);

describe('deleting events', () => {
    let admin: TestClient;
    let other: TestClient;
    let otherId: string;
    let eventId: string;

    beforeAll(async () => {
        admin = await adminClient();
        // A connection test against a closed port fails at once and leaves an error event (category source)
        await admin.post('/api/v0.1/app/sources/test', {
            name: 'Events test', type: 'imap',
            config: { host: '127.0.0.1', port: 1, use_ssl: false, username: 'u', credential: 'p' },
        });
        const events = await admin.ok<any[]>('GET', '/api/user/event/search?limit=50&category=source&level=error');
        const event = events.find((e: any) => e.message === 'events.user.error_source_test_failed' && e.metadata?.source === 'Events test');
        expect(event).toBeTruthy();
        eventId = event.id;

        const userRole = rows(await admin.ok('GET', '/api/admin/role')).find((r: any) => r.name === 'user');
        otherId = (await admin.ok('POST', '/api/admin/account', { user: 'events-test-other', password: 'events-test-other-pw', roles: [userRole.id] })).id;
        other = new TestClient(inject('baseUrl'));
        expect((await other.login('events-test-other', 'events-test-other-pw')).status).toBe(200);
    });

    afterAll(async () => {
        await admin.ok('DELETE', `/api/admin/account/${otherId}`);
    });

    const exists = async (id: string) =>
        (await admin.ok<any[]>('GET', `/api/user/event/search?limit=200&id=${id}`)).some((e: any) => e.id === id);

    it('needs ids', async () => {
        expect((await admin.delete('/api/user/event', {})).status).toBe(400);
    });

    it('never deletes the events of another user', async () => {
        const res = await other.ok<any>('DELETE', '/api/user/event', { ids: [eventId] });
        expect(res).toEqual([]);
        expect(await exists(eventId)).toBe(true);
    });

    it('deletes the own events', async () => {
        const res = await admin.ok<any>('DELETE', '/api/user/event', { ids: [eventId] });
        expect(rows(res).map((e: any) => e.id)).toEqual([eventId]);
        expect(await exists(eventId)).toBe(false);
    });

    // The dashboard matches source problems to its cards by metadata.source_id
    it('names the source by id in its problem events', async () => {
        const source = await admin.ok('POST', '/api/v0.1/app/sources', {
            name: 'Unreachable', type: 'imap', config: { host: '127.0.0.1', port: 1, use_ssl: false, username: 'u', credential: 'p' },
        });
        const automation = await admin.ok('POST', '/api/v0.1/app/automation', { name: 'On unreachable', active: 1, source_key: `${source.id}:INBOX:`, tasks: [] });
        await admin.ok('POST', `/api/v0.1/app/sources/${source.id}/run`);
        const event = await waitForEvent(admin, (e) => e.message === 'events.user.warn_source_fetch_failed' && e.metadata?.source === 'Unreachable');
        expect(event.metadata.source_id).toBe(source.id);
        await admin.ok('DELETE', `/api/v0.1/app/automation/${automation.id}`);
        await admin.ok('DELETE', `/api/v0.1/app/sources/${source.id}`);
    });

    it('has no "mark as read" any more', async () => {
        // No API route takes it: Nuxt answers with the HTML page instead
        const res = await admin.post('/api/user/event', { ids: ['x'] });
        expect(typeof res.body).toBe('string');
        expect(String(res.body)).toContain('<!DOCTYPE html>');
    });
});
