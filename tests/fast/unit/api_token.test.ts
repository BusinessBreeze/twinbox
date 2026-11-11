import { describe, it, expect } from 'vitest';
import { generateApiToken, hashApiToken } from '#base/server/utils/api_token';
import { token_rules } from '#base/shared/rules/account';

describe('API tokens', () => {
    it('makes a prefixed random token of 32 bytes', () => {
        const token = generateApiToken('tbx_');
        expect(token).toMatch(/^tbx_[A-Za-z0-9_-]{43}$/);
        expect(generateApiToken('tbx_')).not.toBe(token);
    });

    it('stores a sha256 hex hash, the same for the same token', () => {
        const token = generateApiToken();
        expect(hashApiToken(token)).toMatch(/^[0-9a-f]{64}$/);
        expect(hashApiToken(token)).toBe(hashApiToken(token));
        expect(hashApiToken(token)).not.toBe(hashApiToken(token + 'x'));
    });

    it('checks the description', () => {
        expect(token_rules.description.safeParse('  CI deploy ').data).toBe('CI deploy');
        expect(token_rules.description.safeParse('   ').error?.issues[0]?.message).toBe('table.api_tokens.rules.description.required');
        expect(token_rules.description.safeParse('x'.repeat(101)).error?.issues[0]?.message).toBe('table.api_tokens.rules.description.too_long');
        expect(token_rules.description.safeParse(5).error?.issues[0]?.message).toBe('table.api_tokens.rules.description.type');
    });
});
