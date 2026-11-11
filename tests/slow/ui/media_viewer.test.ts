// The media viewer in a browser: an email opens on the text automations read; its HTML, which tries to run script, is
// shown without running it; attachments and forwarded messages open in place; Markdown and audio artifacts are shown by
// their renderers, and Download hands over the content (an email as the server's .eml).
import { describe, it, expect, beforeAll, afterAll, inject } from 'vitest';
import { chromium, type Browser, type Page } from '@playwright/test';
import { adminClient, adminSessionClient, seedArtifact, seedEmail, type TestClient } from '../../helpers/client';
import { simpleParser } from 'mailparser';

const MESSAGE_ID = '<media-viewer-test@example.com>';
const SEEDED_ID = '<media-viewer-attachments@example.com>';
const LONG_TEXT = `${'Read by automations. '.repeat(800)}AFTER THE CUT`;   // longer than limits.llm.max_input_chars (15000)
const EVIL_HTML = `<html><head><script>window.parent.__pwned = 'script'</script></head><body>
  <h1 id="greeting">Hello viewer</h1>
  <img src="x" onerror="window.parent.__pwned = 'onerror'">
  <img src="TRACKER/pixel.gif?u=1" width="1" height="1">
  <div style="background: url(TRACKER/bg.png)">styled</div>
  <img id="inline" src="data:image/gif;base64,R0lGODlhAQABAAAAACw=">
  <a href="javascript:window.parent.__pwned = 'link'" id="link">click</a>
  <form action="https://example.com"><input name="password"></form>
</body></html>`;
const FILES = [
    { name: 'viewer-test.md', mime: 'text/markdown', content: '# Report\n\n- **bold** item\n\n<script>window.__pwned = "md"</script>' },
    { name: 'viewer-test.mp3', mime: 'audio/mpeg', content: 'ID3' },
];

describe('media viewer', () => {
    let browser: Browser;
    let client: TestClient;
    let page: Page;
    const seeded: { id: string }[] = [];
    let seededEmail: { id: string };

    beforeAll(async () => {
        client = await adminClient();
        const session = await adminSessionClient();
        const me = await session.ok('GET', '/api/user/account');
        const ownerId = String((Array.isArray(me) ? me[0] : me).id);
        for (const f of FILES) seeded.push(await seedArtifact(ownerId, f.name, f.mime, f.content));
        seededEmail = await seedEmail(ownerId, {
            messageId: SEEDED_ID, subject: 'Quote request', text: LONG_TEXT, plain: LONG_TEXT, html: '<p>Hello</p>',
            attachments: [{ filename: 'prices.csv', mime: 'text/csv', content: 'product,price\npump,120\n' }, { filename: 'offer.pdf', mime: 'application/pdf', content: '%PDF-1.4 x' }],
            skipped: [{ filename: 'tracker.zip', mime: 'application/zip', reason: 'type' }],
            forwarded: { subject: 'Original request', from: 'customer@example.com', text: 'Please send a quote for the pump.', attachments: [{ filename: 'specs.csv', mime: 'text/csv', content: 'spec,value\nflow,10\n' }] },
        });
        await client.ok('POST', '/api/v0.1/app/email/import', [{ messageId: MESSAGE_ID, from: 'evil@example.com', to: 'me@example.com', subject: 'Viewer test', date: new Date().toISOString(), text: 'Plain hello from the text part', html: EVIL_HTML.replaceAll('TRACKER', `${inject('baseUrl')}/tracker`) }]);

        browser = await chromium.launch();
        const ctx = await browser.newContext({ baseURL: inject('baseUrl'), acceptDownloads: true });
        const res = await ctx.request.post('/api/auth/login', { data: { user: inject('adminUser'), password: inject('adminPassword') } });
        expect(res.status()).toBe(200);
        // The "connect a mailbox" reminder would cover the pages (the test admin has no source)
        await ctx.addInitScript(() => sessionStorage.setItem('twinbox_imap_reminder_dismissed', 'true'));
        page = await ctx.newPage();
    }, 240_000);

    afterAll(async () => {
        await browser?.close();
        if (seeded.length) await client.request('DELETE', '/api/v0.1/app/artifacts', { ids: seeded.map((a) => a.id) });
        if (seededEmail) await client.request('DELETE', `/api/v0.1/app/email/${seededEmail.id}`);
    });

    it('shows an email\'s HTML without running anything in it or loading anything remote', async () => {
        const remote: string[] = [];
        // The "tracker" is the test server, so a request that isn't blocked finishes (a 404). Chromium reports one the CSP
        // blocks too, then fails it with 'csp'; only finished ones went out.
        page.on('requestfinished', (r) => { if (r.url().includes('/tracker/')) remote.push(r.url()); });
        await page.goto(`/repositories?message_id=${encodeURIComponent(MESSAGE_ID)}`, { waitUntil: 'networkidle', timeout: 180_000 });
        const dialog = page.locator('.media-viewer');
        await expect.poll(() => dialog.isVisible(), { timeout: 30_000 }).toBe(true);
        // The body renders once the record is loaded and sanitized, after the dialog opens
        await expect.poll(() => dialog.textContent(), { timeout: 30_000 }).toContain('evil@example.com');   // header rows
        expect(await dialog.textContent()).toContain('me@example.com');
        expect(await dialog.locator('.v-card-subtitle').textContent()).toMatch(/^application\/vnd\.twinbox\.message\+json · [\d.,]+ (B|KB)$/);
        const chips = dialog.locator('.media-viewer__part');
        expect(await chips.allTextContents()).toEqual([expect.stringMatching(/^Automation text · /), expect.stringMatching(/^text\/html · /)]);

        // First what automations read
        await expect.poll(() => dialog.locator('pre').textContent()).toContain('Plain hello from the text part');
        expect(await page.locator('.media-viewer__frame').count()).toBe(0);

        // The HTML: nothing in it runs or loads from elsewhere
        await chips.nth(1).click();
        const frame = page.frameLocator('.media-viewer__frame');
        expect(await frame.locator('#greeting').textContent()).toBe('Hello viewer');
        expect(await frame.locator('script, form, input, [onerror]').count()).toBe(0);
        expect(await frame.locator('#link').getAttribute('href')).toBeNull();
        expect(await page.locator('.media-viewer__frame').getAttribute('sandbox')).not.toContain('allow-scripts');
        expect(await page.evaluate(() => (window as any).__pwned)).toBeUndefined();
        expect(await frame.locator('#inline').getAttribute('src')).toMatch(/^data:/);   // embedded images stay
        expect(remote, 'tracking requests').toEqual([]);

        // Download: the server's .eml
        const download = page.waitForEvent('download');
        await dialog.getByRole('button', { name: /download/i }).last().click();
        const file = await download;
        expect(file.suggestedFilename()).toBe('Viewer test.eml');
        const eml = await simpleParser(await streamToBuffer(await file.createReadStream()));
        expect(eml.subject).toBe('Viewer test');
        expect(eml.html).toContain('Hello viewer');
    }, 240_000);

    it('marks where automations stop reading, and opens attachments and forwarded messages in place', async () => {
        await page.goto(`/repositories?message_id=${encodeURIComponent(SEEDED_ID)}`, { waitUntil: 'networkidle', timeout: 180_000 });
        const dialog = page.locator('.media-viewer');
        await expect.poll(() => dialog.locator('.media-viewer__cut').isVisible(), { timeout: 30_000 }).toBe(true);
        expect(await dialog.locator('.media-viewer__cut').textContent()).toContain('Automations read up to here');
        const chips = dialog.locator('.media-viewer__part');
        // The text/plain rendition says the same as the automation text: one chip, not two
        expect(await chips.allTextContents()).toEqual([
            expect.stringMatching(/^Automation text · /), expect.stringMatching(/^text\/html · /),
            'Forwarded: Original request', expect.stringMatching(/^prices\.csv · /), expect.stringMatching(/^offer\.pdf · /), expect.stringMatching(/^tracker\.zip · /),
        ]);
        expect(await chips.nth(5).getAttribute('class')).toContain('v-chip--disabled');
        expect(await dialog.textContent()).toContain('Not downloaded (type not allowed)');

        await chips.nth(3).click();                         // a CSV attachment: fetched and shown as text
        await expect.poll(() => dialog.locator('pre').textContent(), { timeout: 30_000 }).toContain('pump,120');
        await chips.nth(4).click();                         // a PDF: no preview, a download link
        await expect.poll(() => dialog.textContent(), { timeout: 30_000 }).toContain('No preview for this type');
        expect(await dialog.locator('a[href^="/api/v0.1/app/files/"]').count()).toBe(1);

        await chips.nth(2).click();                         // the forwarded message: its own headers, text and attachments
        await expect.poll(() => dialog.textContent(), { timeout: 30_000 }).toContain('customer@example.com');
        expect(await dialog.textContent()).toContain('Please send a quote for the pump.');
        expect(await dialog.locator('.media-viewer__part', { hasText: 'specs.csv' }).count()).toBe(1);
        await page.locator('.media-viewer').getByRole('button', { name: /close/i }).last().click();
    }, 240_000);

    it('downloads an email with its stored attachments and forwarded message as .eml', async () => {
        const res = await fetch(`${inject('baseUrl')}/api/v0.1/app/email/${seededEmail.id}?format=eml`, { headers: { authorization: `Bearer ${inject('apiToken')}` } });
        expect(res.status).toBe(200);
        expect(res.headers.get('content-type')).toBe('message/rfc822');
        expect(res.headers.get('content-disposition')).toMatch(/^attachment; filename="Quote request\.eml"/);
        const eml = await simpleParser(Buffer.from(await res.arrayBuffer()));
        expect(eml.attachments.map((a) => a.filename)).toEqual(['prices.csv', 'offer.pdf', 'Original request.eml']);
        expect(eml.attachments[0]!.content.toString()).toContain('pump,120');
        const forwarded = await simpleParser(eml.attachments[2]!.content);
        expect(forwarded.attachments.map((a) => a.filename)).toEqual(['specs.csv']);
        expect((await fetch(`${inject('baseUrl')}/api/v0.1/app/email/${seededEmail.id}?format=xml`, { headers: { authorization: `Bearer ${inject('apiToken')}` } })).status).toBe(400);
    });

    it('shows a Markdown artifact formatted and an audio artifact in a player', async () => {
        await page.goto('/artifacts', { waitUntil: 'networkidle', timeout: 180_000 });
        const row = (name: string) => page.locator('tr', { hasText: name });

        await row('viewer-test.md').locator('.mdi-eye').click();
        const body = page.locator('.media-viewer .markdown-body');
        await expect.poll(() => body.isVisible(), { timeout: 30_000 }).toBe(true);
        expect(await body.locator('h1').textContent()).toBe('Report');
        expect(await body.locator('strong').textContent()).toBe('bold');
        expect(await body.locator('script').count()).toBe(0);
        expect(await page.evaluate(() => (window as any).__pwned)).toBeUndefined();
        await page.locator('.media-viewer').getByRole('button', { name: /close/i }).last().click();
        await expect.poll(() => page.locator('.media-viewer').isVisible()).toBe(false);

        await row('viewer-test.mp3').locator('.mdi-eye').click();
        const audio = page.locator('.media-viewer audio');
        await expect.poll(() => audio.isVisible(), { timeout: 30_000 }).toBe(true);
        expect(await audio.getAttribute('src')).toMatch(/^blob:/);
    }, 240_000);
});

const streamToBuffer = async (stream: NodeJS.ReadableStream) => {
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(Buffer.from(chunk as Buffer));
    return Buffer.concat(chunks);
};
