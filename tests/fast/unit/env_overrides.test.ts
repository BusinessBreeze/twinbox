import { describe, it, expect } from 'vitest';
import { withEnvOverrides } from '#base/shared/utils/env_overrides';

const defaults = {
    queue: { max_depth: 100 },
    notifications: { retry_delays_ms: [2000, 8000, 20000] },
    flags: { enabled: false },
    names: { model: 'small' },
};

describe('withEnvOverrides', () => {
    it('keeps the defaults without env', () => {
        expect(withEnvOverrides(defaults, 'LIMITS', {})).toEqual(defaults);
    });

    it('names the env variable after the path', () => {
        const out = withEnvOverrides(defaults, 'LIMITS', { LIMITS_QUEUE_MAX_DEPTH: '250' });
        expect(out.queue.max_depth).toBe(250);
        expect(defaults.queue.max_depth).toBe(100);   // the defaults are not changed
    });

    it('parses number lists, booleans and text', () => {
        const out = withEnvOverrides(defaults, 'LIMITS', {
            LIMITS_NOTIFICATIONS_RETRY_DELAYS_MS: '1000, 5000',
            LIMITS_FLAGS_ENABLED: 'true',
            LIMITS_NAMES_MODEL: 'large',
        });
        expect(out.notifications.retry_delays_ms).toEqual([1000, 5000]);
        expect(out.flags.enabled).toBe(true);
        expect(out.names.model).toBe('large');
    });

    it('ignores an invalid value and keeps the default', () => {
        const out = withEnvOverrides(defaults, 'LIMITS', { LIMITS_QUEUE_MAX_DEPTH: 'lots', LIMITS_NOTIFICATIONS_RETRY_DELAYS_MS: '1,x' });
        expect(out.queue.max_depth).toBe(100);
        expect(out.notifications.retry_delays_ms).toEqual([2000, 8000, 20000]);
    });
});
