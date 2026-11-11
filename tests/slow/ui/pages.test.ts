// Every page, loaded in a browser: anonymous, as the admin and as a normal user, in English and German. Console errors
// and warnings (e.g. vue-i18n's "Not found 'key' in 'de' locale messages"), uncaught page errors and failed API calls
// are collected; the test fails with the list. Pages come from the app's own router (base layer pages included), so
// new pages are covered without listing them.
import { describe, it, expect, beforeAll, afterAll, inject } from 'vitest';
import { chromium, type Browser, type BrowserContext } from '@playwright/test';
import { adminClient, type TestClient } from '../../helpers/client';

const LANGS = ['en', 'de'];
const PASSWORD = 'pages-test-password';

// Known noise, not something to fix in the app
const IGNORED: RegExp[] = [
    /\[vite\]/i,                       // dev server messages
    /Download the Vue Devtools/i,
    /\[Vue Router warn\]: No match found/i,
];

interface Finding { page: string; role: string; lang: string; kind: string; text: string }

describe('pages load without console errors or warnings', () => {
    let browser: Browser;
    let admin: TestClient;
    let userId: string;
    let routes: string[] = [];

    beforeAll(async () => {
        admin = await adminClient();
        const userRole = (await admin.ok<any[]>('GET', '/api/admin/role')).find((r: any) => r.name === 'user');
        userId = (await admin.ok('POST', '/api/admin/account', { user: 'pages-user', password: PASSWORD, roles: [userRole.id] })).id;
        browser = await chromium.launch();

        // The app's routes, from its router (static paths only; a route with parameters needs a real id)
        const ctx = await browser.newContext({ baseURL: inject('baseUrl') });
        const page = await ctx.newPage();
        await page.goto('/login', { waitUntil: 'networkidle', timeout: 180_000 });
        routes = await page.evaluate(() => {
            const app = (document.querySelector('#__nuxt') as any)?.__vue_app__;
            const router = app?.config?.globalProperties?.$router;
            return (router?.getRoutes() ?? []).map((r: any) => r.path as string);
        });
        routes = [...new Set(routes)].filter((path) => !path.includes(':')).sort();
        await ctx.close();
    });

    afterAll(async () => {
        await browser?.close();
        if (userId) await admin.request('DELETE', `/api/admin/account/${userId}`);
    });

    /** A browser context in a language, logged in as `user` (or anonymous). */
    const contextFor = async (lang: string, user?: { name: string; password: string }): Promise<BrowserContext> => {
        const ctx = await browser.newContext({ baseURL: inject('baseUrl'), viewport: { width: 1440, height: 900 } });
        await ctx.addCookies([{ name: 'i18n_redirected', value: lang, url: inject('baseUrl') }]);
        if (user) {
            const res = await ctx.request.post('/api/auth/login', { data: { user: user.name, password: user.password } });
            expect(res.status(), `login ${user.name}`).toBe(200);
        }
        return ctx;
    };

    it('finds the pages', () => {
        expect(routes.length).toBeGreaterThan(5);
        console.log(`PAGES ${routes.join(' ')}`);
    });

    it('loads every page for every role and language', async () => {
        const roles: Array<[string, { name: string; password: string } | undefined]> = [
            ['anonymous', undefined],
            ['admin', { name: inject('adminUser'), password: inject('adminPassword') }],
            ['user', { name: 'pages-user', password: PASSWORD }],
        ];
        const findings: Finding[] = [];

        for (const [role, user] of roles) {
            for (const lang of LANGS) {
                const ctx = await contextFor(lang, user);
                for (const path of routes) {
                    const page = await ctx.newPage();
                    const add = (kind: string, text: string) => {
                        if (!IGNORED.some((re) => re.test(text))) findings.push({ page: path, role, lang, kind, text: text.slice(0, 300) });
                    };
                    page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') add(`console.${m.type()}`, m.text()); });
                    page.on('pageerror', (e) => add('pageerror', e.message));
                    page.on('response', (r) => {
                        // Failed API calls (an anonymous visitor's 401/403 on protected data is expected)
                        if (r.url().includes('/api/') && r.status() >= 400 && !(role === 'anonymous' && [401, 403].includes(r.status()))) {
                            add(`api ${r.status()}`, `${r.request().method()} ${new URL(r.url()).pathname}`);
                        }
                    });
                    await page.goto(path, { waitUntil: 'networkidle', timeout: 120_000 }).catch((e) => add('navigation', String(e)));
                    await page.waitForTimeout(500);
                    await page.close();
                }
                await ctx.close();
            }
        }

        // One line per distinct finding, with where it happened
        const grouped = new Map<string, string[]>();
        for (const f of findings) {
            const key = `${f.kind}: ${f.text}`;
            grouped.set(key, [...(grouped.get(key) ?? []), `${f.page} (${f.role}, ${f.lang})`]);
        }
        const report = [...grouped].map(([key, where]) => `${key}\n    on ${[...new Set(where)].slice(0, 6).join(', ')}${where.length > 6 ? ` +${where.length - 6}` : ''}`);
        if (report.length) console.log(`FINDINGS\n${report.join('\n')}`);
        expect(report, report.join('\n')).toEqual([]);
    }, 600_000);   // about 80 page loads
});
