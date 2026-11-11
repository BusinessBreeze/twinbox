import { describe, it, expect } from 'vitest';
import { zod_rules as sourceRules } from '#shared/rules/app/sources';
import { zod_rules as automationRules, automationOptionsSchema } from '#shared/rules/app/automation';
import { zod_rules as accountRules } from '#base/shared/rules/account';
import { limits } from '#shared/limits';
import { withEnvOverrides } from '#base/shared/utils/env_overrides';

const message = (res: any) => res.success ? null : res.error.issues[0].message;

describe('account rules', () => {
    it.each(['admin', 'anna.b', 'ops_team-1', 'name+tag@example.com'])('accepts username %s', (user) => {
        expect(accountRules.user.safeParse(user).success).toBe(true);
    });

    it('rejects empty, spaces and other punctuation', () => {
        expect(message(accountRules.user.safeParse(''))).toBe('table.account.rules.user.required');
        expect(message(accountRules.user.safeParse('two words'))).toBe('table.account.rules.user.invalid');
        expect(message(accountRules.user.safeParse('semi;colon'))).toBe('table.account.rules.user.invalid');
        expect(message(accountRules.user.safeParse('x'.repeat(129)))).toBe('table.account.rules.user.too_long');
    });

    it('needs 12 to 128 password characters', () => {
        expect(message(accountRules.password.safeParse('short'))).toBe('table.account.rules.password.too_short');
        expect(accountRules.password.safeParse('twelve chars').success).toBe(true);
        expect(message(accountRules.password.safeParse('x'.repeat(129)))).toBe('table.account.rules.password.too_long');
    });
});

describe('source rules', () => {
    it('polls at most once a minute', () => {
        expect(message(sourceRules.poll_seconds.safeParse(59))).toBe('table.sources.rules.poll_seconds.min');
        expect(sourceRules.poll_seconds.safeParse('3600').data).toBe(3600);
    });

    it('fetches 1 to 500 emails per run', () => {
        expect(message(sourceRules.max_items_per_fetch.safeParse(0))).toBe('table.sources.rules.max_items_per_fetch.min');
        expect(message(sourceRules.max_items_per_fetch.safeParse(501))).toBe('table.sources.rules.max_items_per_fetch.max');
        expect(sourceRules.max_items_per_fetch.safeParse(50).success).toBe(true);
    });

    it('takes the type settings as an object (the type validates them)', () => {
        expect(sourceRules.settings.safeParse({ searches: [{ name: 'Unread' }] }).success).toBe(true);
        expect(message(sourceRules.settings.safeParse(['not', 'an', 'object']))).toBe('table.sources.rules.settings.invalid');
    });
});

describe('automation rules', () => {
    it('needs a source key', () => {
        expect(message(automationRules.source_key.safeParse(''))).toBe('table.automation.rules.source_key.required');
        expect(automationRules.source_key.safeParse('id:INBOX:').success).toBe(true);
    });

    it('accepts form booleans as 0/1 in the options', () => {
        const res = automationOptionsSchema.safeParse({ filter_prompt: 'x', mark_read: 1, add_source_links: 0 });
        expect(res.success).toBe(true);
    });

    it('limits the filter prompt to the LLM prompt limit (app_defaults.json)', () => {
        expect(automationOptionsSchema.safeParse({ filter_prompt: 'x'.repeat(limits.llm.max_prompt_chars) }).success).toBe(true);
        expect(message(automationOptionsSchema.safeParse({ filter_prompt: 'x'.repeat(limits.llm.max_prompt_chars + 1) })))
            .toBe('table.automation.rules.options.filter_prompt.too_long');
    });
});

describe('limits', () => {
    // With --project fast --project slow in one run, the slow setup's LIMITS_* env reaches these workers too
    it('come from app_defaults.json and the LIMITS_* env', async () => {
        const defaults = (await import('../../../server/metadata/app_defaults.json')).default;
        expect(limits).toEqual(withEnvOverrides(defaults.limits, 'LIMITS', process.env));
    });
});
