// limits from server/metadata/app_defaults.json, for the server and the forms. Each value can be overridden by an env
// variable named after its path: limits.jobs_queue.max_depth -> LIMITS_JOBS_QUEUE_MAX_DEPTH (number lists comma separated).
// On the server the overrides are applied when this module loads. The browser has no env: plugins/limits.ts copies the
// server's values in at startup (setLimits), so read values when needed instead of keeping copies.
import appDefaults from '../server/metadata/app_defaults.json';
import { withEnvOverrides } from '#layers/nuxt-base-app/shared/utils/env_overrides';

export type Limits = typeof appDefaults.limits;

const serverEnv = !('window' in globalThis) && typeof process !== 'undefined' ? process.env : {};

export const limits: Limits = withEnvOverrides(appDefaults.limits, 'LIMITS', serverEnv);

/** Replaces the values in place (the browser takes the server's). */
export const setLimits = (values: Limits) => {
    for (const [group, entries] of Object.entries(values)) {
        Object.assign((limits as any)[group] ??= {}, entries);
    }
};
