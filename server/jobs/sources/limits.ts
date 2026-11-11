// Pruning limits of a source: the source's own values, capped by the system (env). 0 = no limit.
// Pure (no database), so the rules are unit-tested in tests/fast.
export interface PruneLimits {
    retention_days: number;     // delete what is older than N days
    max_items: number;          // keep the newest N items
    max_size_mb: number;        // keep the newest items up to N MB
}

export const PRUNE_LIMIT_KEYS = ['retention_days', 'max_items', 'max_size_mb'] as const;

const ENV: Record<keyof PruneLimits, string> = {
    retention_days: 'SOURCE_RETENTION_DAYS',
    max_items: 'SOURCE_MAX_ITEMS',
    max_size_mb: 'SOURCE_MAX_SIZE_MB',
};

const num = (v: unknown) => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
};

/** The system caps from the environment (default 0: no cap, sources may set any value). */
export const systemPruneLimits = (env: Record<string, string | undefined> = process.env): PruneLimits => ({
    retention_days: num(env[ENV.retention_days]),
    max_items: num(env[ENV.max_items]),
    max_size_mb: num(env[ENV.max_size_mb]),
});

/** What applies to a source: its own value, never above the cap; the cap alone when it sets none. */
export const effectivePruneLimits = (own: Partial<Record<keyof PruneLimits, unknown>>, system: PruneLimits): PruneLimits => {
    const pick = (key: keyof PruneLimits) => {
        const mine = num(own[key]);
        const cap = system[key];
        if (cap > 0) return mine > 0 ? Math.min(mine, cap) : cap;
        return mine;
    };
    return { retention_days: pick('retention_days'), max_items: pick('max_items'), max_size_mb: pick('max_size_mb') };
};

/** The first of a source's own values that is above its cap, or null. */
export const limitAboveCap = (own: Partial<Record<keyof PruneLimits, unknown>>, system: PruneLimits): keyof PruneLimits | null =>
    PRUNE_LIMIT_KEYS.find((key) => system[key] > 0 && num(own[key]) > system[key]) ?? null;
