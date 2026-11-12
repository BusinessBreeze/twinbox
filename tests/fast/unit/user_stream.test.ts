// The base's live update notifier (server/utils/user_stream.ts): names only, per owner, coalesced, never throws.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { notifyUser, notifyAll, registerStream, closeUserStreams, openStreamCount } from '#base/server/utils/user_stream';

const connection = (ownerId: string, opts: { failing?: boolean } = {}) => {
    const conn = {
        ownerId, written: [] as string[], closed: false,
        write(chunk: string) { if (opts.failing) throw new Error('gone'); conn.written.push(chunk); },
        close() { conn.closed = true; },
    };
    return conn;
};
const names = (conn: { written: string[] }) => conn.written.join('').split('\n\n').filter(Boolean);

describe('user stream notifier', () => {
    const unregister: Array<() => void> = [];
    const open = (conn: ReturnType<typeof connection>, max = 10) => { unregister.push(registerStream(conn, max)); return conn; };

    beforeEach(() => { vi.useFakeTimers(); vi.spyOn(console, 'warn').mockImplementation(() => {}); });
    afterEach(() => { unregister.splice(0).forEach((u) => u()); vi.useRealTimers(); vi.restoreAllMocks(); });

    it('sends a name only to that owner\'s streams', () => {
        const a1 = open(connection('a')), a2 = open(connection('a')), b = open(connection('b'));
        notifyUser('a', 'emails');
        expect(names(a1)).toEqual(['data: emails']);
        expect(names(a2)).toEqual(['data: emails']);
        expect(b.written).toEqual([]);
    });

    it('sends the first name at once and the same name only once per second', () => {
        const a = open(connection('a'));
        notifyUser('a', 'emails');
        notifyUser('a', 'emails');
        notifyUser('a', 'jobs');
        notifyUser('a', 'emails');
        expect(names(a)).toEqual(['data: emails']);
        vi.advanceTimersByTime(1000);
        expect(names(a)).toEqual(['data: emails', 'data: emails', 'data: jobs']);
        vi.advanceTimersByTime(5000);
        expect(names(a)).toHaveLength(3);
    });

    it('refuses names that could break the wire format', () => {
        const a = open(connection('a'));
        for (const bad of ['emails\n\ndata: x', 'Emails', 'a-b', '', 'x y']) notifyUser('a', bad);
        notifyAll('bad name');
        expect(a.written).toEqual([]);
    });

    it('notifyAll reaches every owner', () => {
        const a = open(connection('a')), b = open(connection('b'));
        notifyAll('system');
        expect(names(a)).toEqual(['data: system']);
        expect(names(b)).toEqual(['data: system']);
    });

    it('drops a failing connection without throwing', () => {
        const dead = open(connection('a', { failing: true })), alive = open(connection('a'));
        expect(() => notifyUser('a', 'events')).not.toThrow();
        expect(dead.closed).toBe(true);
        expect(openStreamCount('a')).toBe(1);
        expect(names(alive)).toEqual(['data: events']);
    });

    it('closes the oldest stream above the per-user limit', () => {
        const first = open(connection('a'), 2);
        vi.advanceTimersByTime(10);
        const second = open(connection('a'), 2);
        vi.advanceTimersByTime(10);
        open(connection('a'), 2);
        expect(first.closed).toBe(true);
        expect(second.closed).toBe(false);
        expect(openStreamCount('a')).toBe(2);
    });

    it('closes all streams of a user (sign-out) and ignores a missing owner', () => {
        const a1 = open(connection('a')), a2 = open(connection('a')), b = open(connection('b'));
        closeUserStreams('a');
        expect([a1.closed, a2.closed, b.closed]).toEqual([true, true, false]);
        expect(openStreamCount('a')).toBe(0);
        expect(() => { notifyUser(undefined, 'events'); closeUserStreams(null); }).not.toThrow();
    });
});
