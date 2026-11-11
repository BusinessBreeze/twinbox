// The admin tables (/api/admin/app/*) show and change the records of all users, not only the admin's own
import { describe, it, expect, beforeAll, afterAll, inject } from 'vitest';
import { TestClient, adminClient, stagingSource } from '../../helpers/client';

const rows = (body: any): any[] => (Array.isArray(body) ? body : body?.data ?? []);

describe('admin tables cover all users', () => {
    let admin: TestClient;
    let other: TestClient;
    let otherId: string;
    let otherStaging: any;
    let otherAutomation: any;

    beforeAll(async () => {
        admin = await adminClient();
        const roles = rows(await admin.ok('GET', '/api/admin/role'));
        const userRole = roles.find((r: any) => r.name === 'user');
        const created = await admin.ok('POST', '/api/admin/account', { user: 'admin-test-other', password: 'admin-test-other-pw', roles: [userRole.id] });
        otherId = created.id;

        other = new TestClient(inject('baseUrl'));
        expect((await other.login('admin-test-other', 'admin-test-other-pw')).status).toBe(200);
        await other.ok('POST', '/api/v0.1/app/email/import', [{
            messageId: '<admin-test-other@test>', subject: 'Mail of another user', from: 'a@example.com', to: 'b@example.com',
            date: '2026-10-09T10:00:00.000Z', text: 'x', html: '', staging_item: 0,
        }]);
        otherStaging = await stagingSource(other);
        otherAutomation = await other.ok('POST', '/api/v0.1/app/automation', { name: 'Shared name', active: 0, source_key: otherStaging.id, tasks: [] });
    });

    afterAll(async () => {
        for (const a of rows(await admin.ok('GET', '/api/admin/app/automation')).filter((a: any) => a.owner_id === otherId)) {
            await admin.ok('DELETE', `/api/admin/app/automation/${a.id}`);
        }
        await admin.ok('DELETE', `/api/admin/account/${otherId}`);
    });

    it('lists the emails, sources and automations of other users', async () => {
        const emails = rows(await admin.ok('GET', '/api/admin/app/email'));
        expect(emails.some((e: any) => e.owner_id === otherId && e.subject === 'Mail of another user')).toBe(true);
        const sources = rows(await admin.ok('GET', '/api/admin/app/sources'));
        expect(sources.some((s: any) => s.id === otherStaging.id && s.owner_id === otherId)).toBe(true);
        const automations = rows(await admin.ok('GET', '/api/admin/app/automation'));
        expect(automations.some((a: any) => a.id === otherAutomation.id && a.owner_id === otherId)).toBe(true);
    });

    it('checks automation names per owner', async () => {
        // The admin's own automation may share the other user's name ...
        const own = await admin.ok('POST', '/api/v0.1/app/automation', { name: 'Shared name', active: 0, source_key: (await stagingSource(admin)).id, tasks: [] });
        await admin.ok('DELETE', `/api/v0.1/app/automation/${own.id}`);
        // ... but a second one of the other user may not
        const dupe = await admin.post('/api/admin/app/automation', { owner_id: otherId, name: 'shared NAME', active: 0, source_key: otherStaging.id, tasks: [] });
        expect(dupe.status).toBe(422);
        expect(dupe.body.statusMessage).toBe('error table.automation.rules.name.duplicate');
    });

    it('changes and deletes the records of other users', async () => {
        const renamed = await admin.ok('PATCH', `/api/admin/app/automation/${otherAutomation.id}`, { name: 'Renamed by admin' });
        expect(renamed.name).toBe('Renamed by admin');

        const email = rows(await admin.ok('GET', '/api/admin/app/email')).find((e: any) => e.owner_id === otherId);
        await admin.ok('DELETE', `/api/admin/app/email/${email.id}`);
        expect(rows(await other.ok('GET', '/api/v0.1/app/email')).some((e: any) => e.id === email.id)).toBe(false);
    });
});
