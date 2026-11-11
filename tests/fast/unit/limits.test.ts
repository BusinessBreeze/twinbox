import { describe, it, expect } from 'vitest';
import { systemPruneLimits, effectivePruneLimits, limitAboveCap } from '#server/jobs/sources/limits';

describe('source pruning limits', () => {
    it('reads the SOURCE_* caps from the environment; unset, invalid or 0 = no cap', () => {
        expect(systemPruneLimits({})).toEqual({ retention_days: 0, max_items: 0, max_size_mb: 0 });
        expect(systemPruneLimits({ SOURCE_RETENTION_DAYS: '30', SOURCE_MAX_ITEMS: 'x', SOURCE_MAX_SIZE_MB: '-5' }))
            .toEqual({ retention_days: 30, max_items: 0, max_size_mb: 0 });
    });

    it('without a cap the source sets any value; 0 stays "no limit"', () => {
        const none = { retention_days: 0, max_items: 0, max_size_mb: 0 };
        expect(effectivePruneLimits({ retention_days: 999, max_items: 0, max_size_mb: '5' }, none))
            .toEqual({ retention_days: 999, max_items: 0, max_size_mb: 5 });
    });

    it('with a cap the source can only go lower, and gets the cap when it sets nothing', () => {
        const caps = { retention_days: 60, max_items: 200, max_size_mb: 0 };
        expect(effectivePruneLimits({ retention_days: 10, max_items: 0, max_size_mb: 50 }, caps))
            .toEqual({ retention_days: 10, max_items: 200, max_size_mb: 50 });
        expect(effectivePruneLimits({ retention_days: 90 }, caps).retention_days).toBe(60);
    });

    it('names the first own value above its cap', () => {
        const caps = { retention_days: 60, max_items: 200, max_size_mb: 0 };
        expect(limitAboveCap({ retention_days: 60, max_items: 201 }, caps)).toBe('max_items');
        expect(limitAboveCap({ max_size_mb: 100000 }, caps)).toBeNull();     // no cap
    });
});
