import { describe, it, expect } from 'vitest';
import { zod_rules, configSchema, tokenRule, templateKeys, choiceValues } from '#base/shared/rules/notification_channels';

const message = (res: any) => res.success ? null : res.error.issues[0].message;

// Shaped like a service description from Apprise / the IMAP provider
const ntfy = {
    templates: ['{schema}://{host}:{port}/{targets}', '{schema}://{host}/{targets}'],
    tokens: {
        schema: { name: 'Schema', type: 'choice:string', required: true, values: ['ntfy', 'ntfys'] },
        host: { name: 'Host', type: 'string', required: true },
        port: { name: 'Port', type: 'int', min: 1, max: 65535 },
        targets: { name: 'Topic', type: 'list:string', required: true, regex: ['^[a-z0-9_-]+$', 'i'] },
        priority: { name: 'Priority', type: 'choice:int', values: [1, 2, 3] },
    },
};
const preset = {
    templates: ['{schema}://{record_id}/{folder}'],
    tokens: {
        schema: { type: 'choice:string', required: true, values: ['imap_connection'] },
        record_id: { type: 'choice:string', required: true, values: [{ title: 'Work', value: 'src1' }] },
        folder: { type: 'choice:string', conditional_field: 'record_id', values: { src1: ['INBOX', 'Junk'] } },
    },
};
const valid = { template: '{schema}://{host}:{port}/{targets}', schema: 'ntfys', host: 'ntfy.example.com', port: '443', targets: 'alerts' };

describe('notification channel fixed fields', () => {
    it('requires a name of at most 100 characters', () => {
        expect(message(zod_rules.name.safeParse(''))).toBe('table.notification_channels.rules.name.required');
        expect(message(zod_rules.name.safeParse('x'.repeat(101)))).toBe('table.notification_channels.rules.name.too_long');
        expect(zod_rules.name.safeParse('Alerts').success).toBe(true);
    });
    it('requires provider and type', () => {
        expect(message(zod_rules.provider.safeParse(undefined))).toBe('table.notification_channels.rules.provider.required');
        expect(message(zod_rules.type.safeParse(''))).toBe('table.notification_channels.rules.type.required');
    });
});

describe('notification channel config', () => {
    it('lists the keys a template uses', () => {
        expect(templateKeys('{schema}://{user}:{password}@{host}')).toEqual(['schema', 'user', 'password', 'host']);
        expect(templateKeys('file://')).toEqual([]);
    });

    it('accepts a valid config and coerces numbers', () => {
        const rv = configSchema(ntfy, valid).safeParse(valid);
        expect(rv.success).toBe(true);
        expect((rv as any).data.port).toBe(443);
    });

    it('refuses a template the service does not offer', () => {
        const config = { ...valid, template: '{schema}://{host}' };
        expect(message(configSchema(ntfy, config).safeParse(config))).toBe('table.notification_channels.rules.config.template');
    });

    it('refuses a missing required token, but not a missing optional one', () => {
        const noHost = { ...valid, host: '  ' };
        expect(message(configSchema(ntfy, noHost).safeParse(noHost))).toBe('table.notification_channels.rules.config.required');
        const noPort = { ...valid, template: '{schema}://{host}/{targets}', port: undefined };
        expect(configSchema(ntfy, noPort).safeParse(noPort).success).toBe(true);
    });

    it('checks number ranges, choices and regex', () => {
        expect(message(tokenRule(ntfy.tokens.port).safeParse('70000'))).toBe('table.notification_channels.rules.config.max');
        expect(message(tokenRule(ntfy.tokens.port).safeParse('abc'))).toBe('table.notification_channels.rules.config.number');
        expect(message(tokenRule(ntfy.tokens.schema).safeParse('http'))).toBe('table.notification_channels.rules.config.choice');
        expect(tokenRule(ntfy.tokens.priority).safeParse(2).success).toBe(true);
        expect(message(tokenRule(ntfy.tokens.targets).safeParse('bad topic!'))).toBe('table.notification_channels.rules.config.regex');
    });

    it('allows long values (no fixed length limit)', () => {
        expect(tokenRule(ntfy.tokens.host).safeParse('h'.repeat(200)).success).toBe(true);
    });

    it('passes parameters to the message builder', () => {
        const msg = (key: string, params?: Record<string, unknown>) => `${key}:${JSON.stringify(params ?? {})}`;
        expect(message(tokenRule(ntfy.tokens.port, undefined, msg).safeParse(0))).toBe('table.notification_channels.rules.config.min:{"min":1}');
    });

    it('checks a dependent choice against the value it depends on', () => {
        const ok = { template: preset.templates[0], schema: 'imap_connection', record_id: 'src1', folder: 'Junk' };
        expect(configSchema(preset, ok).safeParse(ok).success).toBe(true);
        const badFolder = { ...ok, folder: 'Archive' };
        expect(message(configSchema(preset, badFolder).safeParse(badFolder))).toBe('table.notification_channels.rules.config.choice');
        const otherSource = { ...ok, record_id: 'someone_elses' };
        expect(message(configSchema(preset, otherSource).safeParse(otherSource))).toBe('table.notification_channels.rules.config.choice');
    });

    it('does not check a dependent choice whose values are unknown', () => {
        expect(choiceValues(preset.tokens.folder, 'src2')).toBeNull();
        expect(tokenRule(preset.tokens.folder, 'src2').safeParse('Anything').success).toBe(true);
    });
});
