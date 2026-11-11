// Test suites (see tests/README.md):
//   fast   tests/fast/**    pure functions, no server, no network. Runs before every commit.
//   slow   tests/slow/**    one throwaway Nuxt dev server (own database) + stub LLM/TTS. Runs on push / in CI.
//   local  tests/local/**   real mail server and services. Only by hand (npm run test:local).
import { existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { defineConfig } from 'vitest/config';

const root = fileURLToPath(new URL('.', import.meta.url));

// The base layer: the local checkout nuxt.config.ts extends, else the copy c12 downloaded (CI, github: extends).
const LOCAL_BASE = '/home/mwolf/Desktop/Git/GITHUB/nuxt-base-app';
const c12Dir = join(root, 'node_modules/.c12');
const baseApp = existsSync(LOCAL_BASE)
    ? LOCAL_BASE
    : join(c12Dir, readdirSync(c12Dir).find((d) => d.startsWith('github_')) ?? '');

export default defineConfig({
    resolve: {
        alias: {
            '#shared': join(root, 'shared'),
            '#server': join(root, 'server'),
            '#base': baseApp,
            '#bs': join(baseApp, 'server'),
            '#layers/nuxt-base-app': baseApp,
        },
    },
    test: {
        projects: [
            {
                extends: true,
                test: {
                    name: 'fast',
                    include: ['tests/fast/**/*.test.ts'],
                    environment: 'node',
                },
            },
            {
                extends: true,
                test: {
                    name: 'slow',
                    include: ['tests/slow/**/*.test.ts'],
                    environment: 'node',
                    globalSetup: ['tests/helpers/global_setup.ts'],
                    // One shared server: test files run one after another and clean up after themselves
                    fileParallelism: false,
                    testTimeout: 120_000,
                    hookTimeout: 300_000,
                },
            },
            {
                extends: true,
                test: {
                    name: 'local',
                    include: ['tests/local/**/*.test.ts'],
                    environment: 'node',
                    // The slow suite's throwaway server, with the real services (global_setup: project "local")
                    globalSetup: ['tests/helpers/global_setup.ts'],
                    fileParallelism: false,
                    testTimeout: 600_000,
                    hookTimeout: 300_000,
                },
            },
        ],
    },
});
