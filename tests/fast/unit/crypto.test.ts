import { describe, it, expect, beforeAll } from 'vitest';
import { encryptValue, decryptValue } from '#server/utils/crypto/simple';

describe('config encryption (sources store their whole config encrypted)', () => {
    beforeAll(() => { process.env.SECRET_ENCRYPTION_KEY = 'unit-test-key'; });

    it('round-trips a config and never contains the plain secret', () => {
        const config = JSON.stringify({ host: 'imap.example.com', credential: 'hunter2-secret' });
        const stored = encryptValue(config);
        expect(stored.startsWith('enc:')).toBe(true);
        expect(stored).not.toContain('hunter2');
        expect(decryptValue(stored)).toBe(config);
    });

    it('uses a new IV every time', () => {
        expect(encryptValue('same')).not.toBe(encryptValue('same'));
    });

    it('does not encrypt twice and passes empty values through', () => {
        const once = encryptValue('x');
        expect(encryptValue(once)).toBe(once);
        expect(encryptValue('')).toBe('');
    });

    it('fails with another key', () => {
        const stored = encryptValue('secret');
        process.env.SECRET_ENCRYPTION_KEY = 'another-key';
        expect(() => decryptValue(stored)).toThrow();
        process.env.SECRET_ENCRYPTION_KEY = 'unit-test-key';
    });
});
