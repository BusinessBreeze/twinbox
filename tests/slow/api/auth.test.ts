import { describe, it, expect, inject } from 'vitest';
import { createClient } from '@libsql/client';
import { TestClient, adminClient, adminSessionClient } from '../../helpers/client';

describe('login and the initial admin', () => {
    it('logs the configured admin in', async () => {
        const client = new TestClient(inject('baseUrl'));
        const res = await client.login(inject('adminUser'), inject('adminPassword'));
        expect(res.status).toBe(200);
        expect(client.cookie).not.toBe('');
    });

    it('rejects a wrong password and an unknown user', async () => {
        const client = new TestClient(inject('baseUrl'));
        expect((await client.login(inject('adminUser'), 'wrong-password-123')).status).toBe(401);
        expect((await client.login('nobody', inject('adminPassword'))).status).toBe(401);
    });

    it('has no default admin@admin.com account', async () => {
        const client = new TestClient(inject('baseUrl'));
        expect((await client.login('admin@admin.com', '!1adminadmin')).status).toBe(401);
    });

    // The first admin has no password of its own: it signs in with ADMIN_PASSWORD until it sets one
    it('shows the reminder while the admin signs in with ADMIN_PASSWORD', async () => {
        const client = await adminClient();
        expect((await client.ok('GET', '/api/user/account/initial_password')).active).toBe(true);
    });

    it('stops accepting ADMIN_PASSWORD once the admin has its own password', async () => {
        const own = 'own-password-of-the-admin';
        const session = await adminSessionClient();
        const me = await session.ok('GET', '/api/user/account');
        const id = (Array.isArray(me) ? me[0] : me).id;
        try {
            await session.ok('PATCH', `/api/user/account/password/${id}`, { password: own });
            const fresh = () => new TestClient(inject('baseUrl'));
            expect((await fresh().login(inject('adminUser'), inject('adminPassword'))).status).toBe(401);
            expect((await fresh().login(inject('adminUser'), own)).status).toBe(200);
            expect((await session.ok('GET', '/api/user/account/initial_password')).active).toBe(false);
        } finally {
            // Back to no own password: the other test files sign in with ADMIN_PASSWORD
            const db = createClient({ url: inject('dbUrl') });
            await db.execute({ sql: `update accounts set password = '' where id = ?`, args: [id] });
            db.close();
        }
        expect((await new TestClient(inject('baseUrl')).login(inject('adminUser'), inject('adminPassword'))).status).toBe(200);
    });

    it('protects the API without a session', async () => {
        const client = new TestClient(inject('baseUrl'));
        expect((await client.get('/api/v0.1/app/sources')).status).toBe(403);
    });
});
