// Task definitions (server/jobs/automations/tasks/*/definition.ts): what the task chooser builds its cards from.
import { describe, it, expect } from 'vitest';
import type { TaskDefinition } from '#server/jobs/automations/tasks/types';

const modules = import.meta.glob<Record<string, TaskDefinition>>('../../../server/jobs/automations/tasks/*/definition.ts', { eager: true });
const definitions = Object.values(modules).flatMap((m) => Object.values(m)).filter((d): d is TaskDefinition => !!d?.type && Array.isArray(d.args));

describe('task definitions', () => {
    it('are found', () => {
        expect(definitions.map((d) => d.type)).toEqual(expect.arrayContaining(['notification', 'create_artifact']));
    });

    // show_if names another argument; a rename there would hide the field for good
    it('show_if points at a channel argument of the same task', () => {
        for (const def of definitions) {
            for (const arg of def.args.filter((a) => a.show_if)) {
                const target = def.args.find((a) => a.key === arg.show_if!.arg);
                expect(target?.set_type, `${def.type}.${arg.key}`).toBe('channel');
                expect(arg.show_if!.provider.length, `${def.type}.${arg.key}`).toBeGreaterThan(0);
            }
        }
    });

    it('offers "reply in the original thread" only for IMAP channels', () => {
        const notification = definitions.find((d) => d.type === 'notification')!;
        expect(notification.args.find((a) => a.key === 'keep_threadid')?.show_if).toEqual({ arg: 'destination', provider: ['imap'] });
    });
});
