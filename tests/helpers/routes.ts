// Every API route of the app (twinbox and the base layer), read from the route files the way Nitro registers them:
// server/api/v0.1/app/email/[id].delete.ts -> DELETE /api/v0.1/app/email/:id. For tests that call all routes, so a
// new route is covered without editing the test.
import { existsSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../..', import.meta.url));
// Same lookup as vitest.config.ts: the local base checkout, else the copy c12 downloaded
const LOCAL_BASE = '/home/mwolf/Desktop/Git/GITHUB/nuxt-base-app';
const c12 = join(root, 'node_modules/.c12');
const baseApp = existsSync(LOCAL_BASE) ? LOCAL_BASE : join(c12, readdirSync(c12).find((d) => d.startsWith('github_')) ?? '');

export interface Route {
    method: string;         // GET when the file has no method suffix
    path: string;           // with :name for each [name] segment
    params: string[];
}

const METHODS = ['get', 'post', 'put', 'patch', 'delete'];

const routesIn = (apiDir: string): Route[] => {
    if (!existsSync(apiDir)) return [];
    return readdirSync(apiDir, { recursive: true, encoding: 'utf8' })
        .filter((f) => /\.(ts|js)$/.test(f))
        .map((file) => {
            const parts = relative(apiDir, join(apiDir, file)).replace(/\.(ts|js)$/, '').split(/[\\/]/);
            const last = parts.pop()!.split('.');
            const method = METHODS.includes(last.at(-1)!) && last.length > 1 ? last.pop()!.toUpperCase() : 'GET';
            const name = last.join('.');
            const segments = [...parts, ...(name === 'index' ? [] : [name])];
            const params = segments.filter((s) => /^\[.+\]$/.test(s)).map((s) => s.slice(1, -1).replace(/^\.\.\./, ''));
            return { method, path: `/api/${segments.map((s) => (/^\[.+\]$/.test(s) ? `:${s.slice(1, -1).replace(/^\.\.\./, '')}` : s)).join('/')}`, params };
        });
};

/** All routes, the app's overriding the base's at the same method and path. */
export const apiRoutes = (): Route[] => {
    const all = new Map<string, Route>();
    for (const r of [...routesIn(join(baseApp, 'server/api')), ...routesIn(join(root, 'server/api'))]) all.set(`${r.method} ${r.path}`, r);
    return [...all.values()].sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method));
};
