// transferMessages against a fake IMAP connection: copies before moves, a missing destination fails only its own
// transfer, and without the MOVE extension nothing is moved (imapflow's fallback could expunge other messages).
import { describe, it, expect, vi, beforeEach } from 'vitest';

const state = { capabilities: new Map<string, boolean>(), calls: [] as string[], refuse: '' };

vi.mock('#server/jobs/sources/deps', () => ({}));

vi.mock('imapflow', () => ({
    ImapFlow: class {
        get capabilities() { return state.capabilities; }
        async connect() {}
        async logout() {}
        close() {}
        async list() { return [{ path: 'INBOX' }, { path: 'Archive' }, { path: 'News' }]; }
        async getMailboxLock(folder: string) { state.calls.push(`lock ${folder}`); return { release() {} }; }
        async messageCopy(uids: number[], dest: string) { state.calls.push(`copy ${uids} ${dest}`); return dest !== state.refuse && { destination: dest }; }
        async messageMove(uids: number[], dest: string) { state.calls.push(`move ${uids} ${dest}`); return dest !== state.refuse && { destination: dest }; }
        async messageDelete() { state.calls.push('delete'); return true; }
    },
}));

const { transferMessages } = await import('#server/jobs/sources/types/imap/client');
const config = { host: 'imap.invalid', port: 993, use_ssl: true, username: 'u' };

describe('transferMessages', () => {
    beforeEach(() => {
        state.calls = [];
        state.refuse = '';
        state.capabilities = new Map([['IMAP4rev1', true], ['MOVE', true]]);
    });

    it('copies first, then moves, per folder', async () => {
        const res = await transferMessages(config, [
            { op: 'move', folder: 'INBOX', destination: 'Archive', uids: [1, 2] },
            { op: 'copy', folder: 'INBOX', destination: 'News', uids: [1] },
        ]);
        expect(state.calls).toEqual(['lock INBOX', 'copy 1 News', 'move 1,2 Archive']);
        expect(res.map((r) => [r.op, r.status])).toEqual([['copy', 'done'], ['move', 'done']]);
    });

    it('moves nothing without the MOVE extension, but still copies', async () => {
        state.capabilities.delete('MOVE');
        const res = await transferMessages(config, [
            { op: 'move', folder: 'INBOX', destination: 'Archive', uids: [1] },
            { op: 'copy', folder: 'INBOX', destination: 'News', uids: [1] },
        ]);
        expect(state.calls).toEqual(['lock INBOX', 'copy 1 News']);
        expect(state.calls.some((c) => c.startsWith('move') || c === 'delete')).toBe(false);
        expect(res.find((r) => r.op === 'move')!.status).toBe('unsupported');
    });

    it('reports a missing destination and a refused command, and goes on with the rest', async () => {
        state.refuse = 'News';
        const res = await transferMessages(config, [
            { op: 'move', folder: 'INBOX', destination: 'Gone', uids: [1] },
            { op: 'copy', folder: 'INBOX', destination: 'News', uids: [2] },
            { op: 'move', folder: 'INBOX', destination: 'Archive', uids: [3] },
        ]);
        expect(Object.fromEntries(res.map((r) => [r.destination, r.status]))).toEqual({ Gone: 'folder_missing', News: 'failed', Archive: 'done' });
    });
});

describe('IMAP automation options', () => {
    it('keeps a chosen folder and drops an empty one', async () => {
        const { imapDefinition } = await import('#server/jobs/sources/types/imap/definition');
        const parsed = imapDefinition.optionsSchema.parse({ copy_to: ' News ', move_to: '' });
        expect(parsed.copy_to).toBe('News');
        expect(parsed.move_to).toBeUndefined();
        expect(imapDefinition.optionsSchema.safeParse({ move_to: 'Arch\nive' }).success).toBe(false);
    });
});
