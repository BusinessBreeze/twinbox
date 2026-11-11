// Secrets for the tests come from tests/.env locally and from the environment in CI (GitHub secrets).
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const ENV_FILE = fileURLToPath(new URL('../.env', import.meta.url));

export const loadTestEnv = () => {
    if (existsSync(ENV_FILE)) process.loadEnvFile(ENV_FILE);
};

export const requireEnv = (name: string): string => {
    const value = process.env[name];
    if (!value) throw new Error(`${name} is not set (tests/.env, see tests/.env.example)`);
    return value;
};
