import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
    adminUser, envAdminPassword, hasOwnPassword, matchesEnvPassword, NO_OWN_PASSWORD,
} from '#base/server/services/core/initial_admin';

const KEYS = ['ADMIN_USER', 'ADMIN_PASSWORD', 'ADMIN_PASSWORD_FILE'] as const;

// The first admin has no password of its own and signs in with ADMIN_PASSWORD until it sets one
describe('initial admin (ADMIN_PASSWORD until an own password is set)', () => {
    let dir: string;
    const saved: Record<string, string | undefined> = {};

    beforeEach(() => {
        for (const k of KEYS) { saved[k] = process.env[k]; delete process.env[k]; }
        dir = mkdtempSync(join(tmpdir(), 'twinbox-admin-'));
    });
    afterEach(() => {
        for (const k of KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
        rmSync(dir, { recursive: true, force: true });
    });

    it('defaults to user "admin", else ADMIN_USER', () => {
        expect(adminUser()).toBe('admin');
        process.env.ADMIN_USER = 'root';
        expect(adminUser()).toBe('root');
    });

    it('has no default password', () => {
        expect(envAdminPassword()).toBeUndefined();
        expect(matchesEnvPassword('')).toBe(false);
        expect(matchesEnvPassword('anything-at-all')).toBe(false);
    });

    it('checks a sign-in against ADMIN_PASSWORD', () => {
        process.env.ADMIN_PASSWORD = 'configured-password';
        expect(matchesEnvPassword('configured-password')).toBe(true);
        expect(matchesEnvPassword('configured-passwor')).toBe(false);
        expect(matchesEnvPassword('configured-password!')).toBe(false);
    });

    it('reads ADMIN_PASSWORD_FILE (Docker secret), trimmed; ADMIN_PASSWORD wins', () => {
        const file = join(dir, 'secret');
        writeFileSync(file, 'from-a-secret-file\n');
        process.env.ADMIN_PASSWORD_FILE = file;
        expect(envAdminPassword()).toBe('from-a-secret-file');
        process.env.ADMIN_PASSWORD = 'from-the-env';
        expect(envAdminPassword()).toBe('from-the-env');
    });

    it('fails on a missing ADMIN_PASSWORD_FILE', () => {
        process.env.ADMIN_PASSWORD_FILE = join(dir, 'missing');
        expect(() => envAdminPassword()).toThrow(/does not exist/);
    });

    it('tells accounts with their own password from those without', () => {
        expect(hasOwnPassword({ password: NO_OWN_PASSWORD })).toBe(false);
        expect(hasOwnPassword({ password: null })).toBe(false);
        expect(hasOwnPassword({ password: 'salt:hash' })).toBe(true);
    });
});
