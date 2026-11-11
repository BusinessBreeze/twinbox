// Slow suite setup: stub LLM/TTS + one Nuxt dev server (@nuxt/test-utils) with its own data dir, so the tests never
// touch the developer's database, artifacts or real services. Everything lives in tests/.tmp/<run> and is removed
// afterwards (kept when KEEP_TEST_DATA=1, for debugging).
// Local suite (project "local", by hand): the same throwaway server, but with the real services: LLM, TTS and
// Apprise come from the developer's .env (nothing here overrides them), no stubs.
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { getRandomPort } from 'get-port-please';
import { createTestContext, setTestContext, loadFixture, startServer, stopServer, useTestContext } from '@nuxt/test-utils/e2e';
import type { TestProject } from 'vitest/node';
import { randomUUID } from 'node:crypto';
import { createClient } from '@libsql/client';
import { hashApiToken } from '#base/server/utils/api_token';
import { loadTestEnv, requireEnv } from './env';
import { startStubServices } from './stub_services';

const rootDir = fileURLToPath(new URL('../..', import.meta.url));

declare module 'vitest' {
    export interface ProvidedContext {
        baseUrl: string;
        filesDir: string;       // the test server's file store (tests that seed files the API can't create)
        stubUrl: string;
        adminUser: string;
        adminPassword: string;
        apiToken: string;
        dbUrl: string;          // the test server's database (tests that must reset what the API can't)
    }
}

export default async function setup(project: TestProject) {
    loadTestEnv();
    const runDir = join(rootDir, 'tests/.tmp', `run-${Date.now()}`);
    const dataDir = join(runDir, 'data');
    // Empty: the server imports an old artifacts folder at boot, and must not find the developer's ./Artifacts
    const legacyArtifactsDir = join(runDir, 'legacy-artifacts');
    mkdirSync(dataDir, { recursive: true });
    mkdirSync(legacyArtifactsDir, { recursive: true });

    const live = project.name === 'local';
    const stubs = live ? null : await startStubServices();
    const port = await getRandomPort('127.0.0.1');
    const baseUrl = `http://127.0.0.1:${port}`;

    // Explicit values win over the developer's .env (nuxi only fills in variables that aren't set)
    const env: Record<string, string> = {
        APP_DATA_DIR: dataDir,
        LIBSQL_URL: `file:${join(dataDir, 'db/sqlite.db')}`,
        LOCAL_ARTIFACTS_DIR: legacyArtifactsDir,
        BASE_URL: baseUrl,
        ...(stubs ? {
            LLM_BASE_URL: stubs.url,
            LLM_MODEL: 'stub',
            LLM_API_KEY: 'stub',
            LLM_EXTRA_BODY: '',
            TTS_BASE_URL: stubs.url,
            TTS_API_KEY: '',
            APPRISE_URL: '',
        } : {}),
        REGISTRATION_ENABLE: 'false',
        // Pruning caps: one set (tests/slow/api/sources.test.ts checks it), the others unset (0 = no cap)
        SOURCE_RETENTION_DAYS: '0',
        SOURCE_MAX_ITEMS: '1000',
        SOURCE_MAX_SIZE_MB: '0',
        // A limits override (app_defaults.json limits.sources.min_poll_seconds is 60); tests/slow/api/validation.test.ts checks it
        LIMITS_SOURCES_MIN_POLL_SECONDS: '120',
        // Short LLM timeout, so a stub answer marked SLOW_LLM times out (tests/slow/pipeline/dashboard.test.ts)
        ...(stubs ? { LIMITS_LLM_TIMEOUT_MS: '1500' } : {}),
        NUXT_SESSION_COOKIE_SECURE: 'false',
        ADMIN_USER: requireEnv('ADMIN_USER'),
        ADMIN_PASSWORD: requireEnv('ADMIN_PASSWORD'),
        SECRET_ENCRYPTION_KEY: requireEnv('SECRET_ENCRYPTION_KEY'),
        NUXT_SESSION_PASSWORD: requireEnv('NUXT_SESSION_PASSWORD'),
    };
    const apiToken = requireEnv('TEST_API_TOKEN');
    Object.assign(process.env, env);   // loadFixture loads the Nuxt config in this process (hub dir)

    try {
        // Schema first: the server creates the admin at boot, which needs the tables.
        // (Not `nuxt db migrate`: it runs `nuxt prepare`, which restarts a running dev server.)
        execFileSync('node', ['tools/db_migrate.mjs'], { cwd: rootDir, env: process.env, stdio: 'pipe' });

        const ctx = createTestContext({ rootDir, dev: true, server: true, build: true, browser: false, port, env, serverStartTimeout: 240_000 });
        setTestContext(ctx);
        await loadFixture();
        await startServer();
        await seedApiToken(env.LIBSQL_URL!, env.ADMIN_USER!, apiToken);
    } catch (err: any) {
        forgetDataDirInGitignore(dataDir);
        await stubs?.close();
        if (process.env.KEEP_TEST_DATA !== '1') rmSync(runDir, { recursive: true, force: true });
        throw new Error(`Test server did not start: ${err?.stderr?.toString() || err?.message || err}`);
    }

    forgetDataDirInGitignore(dataDir);

    project.provide('baseUrl', baseUrl);
    project.provide('filesDir', join(dataDir, 'files'));   // the server's default: <APP_DATA_DIR>/files
    project.provide('stubUrl', stubs?.url ?? '');
    project.provide('adminUser', env.ADMIN_USER!);
    project.provide('adminPassword', env.ADMIN_PASSWORD!);
    project.provide('apiToken', apiToken);
    project.provide('dbUrl', env.LIBSQL_URL!);

    return async () => {
        await stopServer();
        const ctx = useTestContext();
        await ctx.nuxt?.close();   // the config loaded in this process keeps watchers open
        for (const fn of ctx.teardown || []) await fn();
        setTestContext(undefined);
        await stubs?.close();
        if (process.env.KEEP_TEST_DATA !== '1') rmSync(runDir, { recursive: true, force: true });
    };
}

/**
 * NuxtHub (dev) appends its data dir to .gitignore unless the file already contains it. Each run has a new dir
 * (tests/.tmp/ is ignored anyway), so the line it added is taken out again.
 */
function forgetDataDirInGitignore(dataDir: string) {
    const path = join(rootDir, '.gitignore');
    try {
        const content = readFileSync(path, 'utf-8');
        const cleaned = content.split('\n').filter((line) => line !== relative(rootDir, dataDir)).join('\n').replace(/\n+$/, '\n');
        if (cleaned !== content) writeFileSync(path, cleaned);
    } catch { /* no .gitignore */ }
}

/** Gives the admin (created by the server at boot) the token from tests/.env: only its hash is stored, as in the app. */
const seedApiToken = async (url: string, user: string, token: string) => {
    const db = createClient({ url });
    try {
        const record = { id: randomUUID(), description: 'Test suite', hash: hashApiToken(token), created_at: new Date().toISOString(), last_used_at: null };
        const res = await db.execute({ sql: 'UPDATE accounts SET tokens = ? WHERE user = ?', args: [JSON.stringify([record]), user] });
        if (res.rowsAffected !== 1) throw new Error(`admin account "${user}" not found for the API token`);
    } finally {
        db.close();
    }
};
