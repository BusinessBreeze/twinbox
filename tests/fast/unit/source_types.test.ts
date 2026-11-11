import { describe, it, expect } from 'vitest';
import { sourceTypes, getSourceType } from '#shared/source_types';
import { searchName } from '#shared/source_types/imap';
import { EMAIL_MIME } from '#shared/utils/automation_tasks';

// The source types both the app and the server import (no route serves them)
const message = (res: any) => res.error?.issues[0]?.message;

describe('shared source types', () => {
    it('lists IMAP and the built-in staging type with their facts', () => {
        expect(sourceTypes.map((t) => t.type)).toEqual(['imap', 'staging']);
        expect(getSourceType('imap')).toMatchObject({ pollable: true, builtin: false, itemMime: EMAIL_MIME, secretKeys: ['credential'] });
        expect(getSourceType('staging')).toMatchObject({ pollable: false, builtin: true, defaultName: 'Staging', secretKeys: [] });
        expect(getSourceType('nope')).toBeUndefined();
    });

    it('checks each IMAP config field with its own message (the form uses the same rules)', () => {
        const { shape } = getSourceType('imap')!.configSchema;
        expect(shape.port.safeParse('993').success).toBe(true);
        expect(message(shape.port.safeParse(70000))).toBe('table.sources.rules.config.port.invalid');
        expect(message(shape.host.safeParse('bad host'))).toBe('table.sources.rules.config.host.invalid');
        expect(message(shape.credential.safeParse(''))).toBe('table.sources.rules.config.credential.required');
    });

    it('requires a search name', () => {
        expect(message(searchName.safeParse('  '))).toBe('sources.searches.name_required');
        expect(searchName.safeParse(' Inbox ').data).toBe('Inbox');
    });
});
