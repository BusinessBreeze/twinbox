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

// The account page of a user who is not an admin: role names come with the account (the role list is an admin route)
describe('own account of a user', () => {
    it('shows the names of the user\'s roles without the admin role list', async () => {
        const { adminClient, TestClient } = await import('../../helpers/client');
        const admin = await adminClient();
        const roles = await admin.ok<any[]>('GET', '/api/admin/role');
        const userRole = (Array.isArray(roles) ? roles : []).find((r: any) => r.name === 'user');
        await admin.ok('POST', '/api/admin/account', { user: 'roles-of-a-user', password: 'roles-test-password', roles: [userRole.id] });
        const user = new TestClient(admin.baseUrl);
        expect((await user.login('roles-of-a-user', 'roles-test-password')).status).toBe(200);

        const [account] = await user.ok<any[]>('GET', '/api/user/account');
        expect(account.roles).toEqual([userRole.id]);
        expect(account.role_names).toEqual(['user']);
        expect((await user.get('/api/admin/role')).status).toBe(403);
    });
});
