// Copy and move after the tasks, against the real test mailbox (by hand: npm run test:local; tests/helpers/test_mailbox.ts).
// No filter prompt and no tasks, so no LLM: every email passes. One source run covers:
//   TestCmIn       → copied to TestCmCopied and moved to TestCmMoved
//   TestCmConflict → two automations move it to different folders: it stays, a warning per email
//   TestCmMissing  → moved to a folder that doesn't exist: it stays, a warning
// The server must support MOVE (the test account's Dovecot does); without it the move would be refused (unit test).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { adminClient, deleteAllAutomations, userEvents, waitForEvent, type TestClient, type UserEvent } from '../helpers/client';
import { fillFolder, emptyFolder, folderSubjects, removeFolder, testMailboxSource, withMailbox } from '../helpers/test_mailbox';

const IN = 'TestCmIn', COPIED = 'TestCmCopied', MOVED = 'TestCmMoved';
const CONFLICT = 'TestCmConflict', CONFLICT_A = 'TestCmConflictA', CONFLICT_B = 'TestCmConflictB';
const MISSING_IN = 'TestCmMissing', MISSING = 'TestCmNoSuchFolder';
const FOLDERS = [IN, COPIED, MOVED, CONFLICT, CONFLICT_A, CONFLICT_B, MISSING_IN, MISSING];
const RUN_TIMEOUT_MS = 120_000;

describe('IMAP copy / move after the tasks (live mailbox)', () => {
    let client: TestClient;
    let source: any;
    let events: UserEvent[];
    const started = Math.floor(Date.now() / 1000);
    const name = (n: string) => `Copy-move ${n} ${started}`;
    let before: string[];

    beforeAll(async () => {
        client = await adminClient();
        await deleteAllAutomations(client);
        await fillFolder(IN, 3);
        await fillFolder(CONFLICT, 2);
        await fillFolder(MISSING_IN, 1);
        for (const f of [COPIED, MOVED, CONFLICT_A, CONFLICT_B]) await emptyFolder(f);
        await removeFolder(MISSING);
        before = await folderSubjects(IN);

        source = await client.ok('POST', '/api/v0.1/app/sources', { ...testMailboxSource(), name: `Copy-move mailbox ${started}`, settings: {} });
        const automation = (n: string, folder: string, options: Record<string, string>) => client.ok('POST', '/api/v0.1/app/automation', {
            name: name(n), active: 1, source_key: `${source.id}:${folder}:`, options, tasks: [],
        });
        await automation('in', IN, { copy_to: COPIED, move_to: MOVED });
        await automation('conflict a', CONFLICT, { move_to: CONFLICT_A });
        await automation('conflict b', CONFLICT, { move_to: CONFLICT_B });
        await automation('missing', MISSING_IN, { move_to: MISSING });

        await client.ok('POST', `/api/v0.1/app/sources/${source.id}/run`);
        // The step runs once for all automations: its last event (the missing folder comes after the moves) ends it
        await waitForEvent(client, (e) => e.message === 'events.user.info_source_moved' && e.metadata?.name === name('in'), RUN_TIMEOUT_MS);
        await waitForEvent(client, (e) => e.message === 'events.user.warn_source_target_folder_missing' && e.metadata?.name === name('missing'), RUN_TIMEOUT_MS);
        events = (await userEvents(client)).filter((e) => e.metadata?.source_id === source.id);
    }, RUN_TIMEOUT_MS * 2);

    afterAll(async () => {
        await deleteAllAutomations(client);
        if (source) await client.ok('DELETE', `/api/v0.1/app/sources/${source.id}`);
        for (const f of FOLDERS) await removeFolder(f);
    });

    it('copies and moves the passed emails, and reports both with links', async () => {
        expect(before).toHaveLength(3);
        expect(await folderSubjects(IN)).toEqual([]);
        expect(await folderSubjects(COPIED)).toEqual(before);
        expect(await folderSubjects(MOVED)).toEqual(before);
        for (const message of ['events.user.info_source_copied', 'events.user.info_source_moved']) {
            const event = events.find((e) => e.message === message);
            expect(event?.metadata, message).toMatchObject({ name: name('in'), folder: IN, count: 3 });
            expect(event?.metadata.links.map((l: any) => l.label).sort()).toEqual(before);
        }
    });

    it('leaves an email two automations move to different folders where it is', async () => {
        expect(await folderSubjects(CONFLICT)).toHaveLength(2);
        expect(await folderSubjects(CONFLICT_A)).toEqual([]);
        expect(await folderSubjects(CONFLICT_B)).toEqual([]);
        expect(events.filter((e) => e.message === 'events.user.warn_source_move_conflict' && e.metadata?.folder === CONFLICT)).toHaveLength(2);
    });

    it('reports a destination that does not exist and creates nothing', async () => {
        expect(await folderSubjects(MISSING_IN)).toHaveLength(1);
        expect(await withMailbox(async (c) => (await c.list()).some((m) => m.path === MISSING))).toBe(false);
    });

    it('reports nothing else', async () => {
        const known = ['events.user.warn_source_move_conflict', 'events.user.warn_source_target_folder_missing'];
        const problems = events.filter((e) => ['warn', 'warning', 'error'].includes(e.level) && !known.includes(e.message));
        expect(problems.map((e) => `${e.message} ${JSON.stringify(e.metadata).slice(0, 200)}`)).toEqual([]);
    });
});
