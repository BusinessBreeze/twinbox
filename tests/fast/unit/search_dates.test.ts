import { describe, it, expect, vi, afterEach } from 'vitest';
import { resolveRelativeSearchDates, withCreationSince } from '#server/jobs/sources/types/imap/search_dates';

const DAY = 24 * 60 * 60 * 1000;

describe('resolveRelativeSearchDates (IMAP saved searches)', () => {
    afterEach(() => { vi.useRealTimers(); });

    it('turns "_since_days: 7" into a since date 7 days back', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-10-30T12:00:00Z'));
        expect(resolveRelativeSearchDates({ _since_days: 7 })).toEqual({ since: new Date('2026-10-23T12:00:00Z') });
    });

    it('resolves nested groups and keeps other criteria', () => {
        const now = Date.now();
        const res = resolveRelativeSearchDates({ seen: false, or: [{ _before_days: '2' }, { from: 'a@example.com' }] });
        expect(res.seen).toBe(false);
        expect(res.or[1]).toEqual({ from: 'a@example.com' });
        expect(Math.abs(res.or[0].before.getTime() - (now - 2 * DAY))).toBeLessThan(1000);
    });

    it('leaves a non-numeric value under its original key', () => {
        expect(resolveRelativeSearchDates({ _since_days: 'soon' })).toEqual({ _since_days: 'soon' });
    });
});

describe('withCreationSince (new saved searches)', () => {
    const now = new Date('2026-10-31T09:00:00Z');

    it('adds a fixed since date N days back', () => {
        expect(withCreationSince(undefined, 7, now)).toEqual({ since: '2026-10-24' });
        expect(withCreationSince({ seen: false }, 7, now)).toEqual({ since: '2026-10-24', seen: false });
        expect(withCreationSince('{"from":"a@b.c"}', 7, now)).toEqual({ since: '2026-10-24', from: 'a@b.c' });
    });

    it('keeps a since date of the search itself', () => {
        expect(withCreationSince({ since: '2026-01-01' }, 7, now)).toEqual({ since: '2026-01-01' });
        expect(withCreationSince({ _since_days: 3 }, 7, now)).toEqual({ _since_days: 3 });
    });

    it('adds nothing for 0 days', () => {
        expect(withCreationSince({ seen: true }, 0, now)).toEqual({ seen: true });
    });
});
