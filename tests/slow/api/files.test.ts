// The file route (/api/v0.1/app/files/:id) hardens every response: stored files may come from strangers, so the
// browser must never sniff a type, run a script or show anything but safe types inline.
import { describe, it, expect, beforeAll, afterAll, inject } from 'vitest';
import { adminClient, adminSessionClient, seedArtifact, seedEmail, type TestClient } from '../../helpers/client';

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');

describe('file route', () => {
    let client: TestClient;
    let owner: string;
    const seeded: Record<string, { id: string; file_id: string }> = {};

    const get = (fileId: string, query = '') => fetch(`${inject('baseUrl')}/api/v0.1/app/files/${fileId}${query}`, {
        headers: { authorization: `Bearer ${inject('apiToken')}` },
    });

    beforeAll(async () => {
        client = await adminClient();
        const me = await (await adminSessionClient()).ok('GET', '/api/user/account');
        owner = String((Array.isArray(me) ? me[0] : me).id);
        seeded.png = await seedArtifact(owner, 'pixel.png', 'image/png', PNG);
        seeded.html = await seedArtifact(owner, 'page.html', 'text/html', '<script>alert(1)</script>');
        seeded.md = await seedArtifact(owner, 'notes.md', 'text/markdown', '# Notes');
        seeded.odd = await seedArtifact(owner, 'evil"\r\nX-Injected: 1 Ä.txt', 'text/plain', 'odd name');
    });

    afterAll(async () => {
        await client.request('DELETE', '/api/v0.1/app/artifacts', { ids: Object.values(seeded).map((s) => s.id) });
    });

    it('sends every file without sniffing, under a sandbox CSP, as a download by default', async () => {
        for (const { file_id } of Object.values(seeded)) {
            const res = await get(file_id);
            expect(res.status).toBe(200);
            expect(res.headers.get('x-content-type-options')).toBe('nosniff');
            expect(res.headers.get('content-security-policy')).toMatch(/^sandbox;/);
            expect(res.headers.get('content-disposition')).toMatch(/^attachment;/);
        }
        expect(Buffer.from(await (await get(seeded.png!.file_id)).arrayBuffer()).equals(PNG)).toBe(true);
    });

    it('shows only safe types inline, text as plain text', async () => {
        const png = await get(seeded.png!.file_id, '?inline=1');
        expect(png.headers.get('content-disposition')).toMatch(/^inline;/);
        expect(png.headers.get('content-type')).toBe('image/png');

        const html = await get(seeded.html!.file_id, '?inline=1');
        expect(html.headers.get('content-disposition')).toMatch(/^attachment;/);

        const md = await get(seeded.md!.file_id, '?inline=1');
        expect(md.headers.get('content-disposition')).toMatch(/^inline;/);
        expect(md.headers.get('content-type')).toBe('text/plain; charset=utf-8');
    });

    it('keeps a sender\'s file name from adding headers', async () => {
        const res = await get(seeded.odd!.file_id);
        expect(res.status).toBe(200);
        expect(res.headers.get('x-injected')).toBeNull();
        expect(res.headers.get('content-disposition')).toContain("filename*=UTF-8''evil%22X-Injected%3A%201%20%C3%84.txt");
    });

    it('removes an email\'s attachments and keeps the email; the storage page counts what is left', async () => {
        const before = await client.ok<any>('GET', '/api/v0.1/app/storage');
        const email = await seedEmail(owner, {
            messageId: '<remove-attachments@example.com>', subject: 'With attachments', text: 'see attached',
            attachments: [{ filename: 'a.csv', mime: 'text/csv', content: 'x'.repeat(5000) }],
            forwarded: { subject: 'Fwd', from: 'c@example.com', text: 'inner', attachments: [{ filename: 'b.csv', mime: 'text/csv', content: 'y'.repeat(3000) }] },
        });
        const [listed] = await client.ok<any[]>('GET', `/api/v0.1/app/email?message_id=${encodeURIComponent('<remove-attachments@example.com>')}`);
        expect(listed.attachments).toBe(2);                                  // its own and the forwarded message's
        const during = await client.ok<any>('GET', '/api/v0.1/app/storage');
        expect(during.attachments.bytes - before.attachments.bytes).toBe(8000);
        expect(during.attachments.count - before.attachments.count).toBe(2);
        expect(during.files.bytes).toBe(during.attachments.bytes + during.artifacts.bytes);
        expect(during.files.limit_bytes).toBe(1024 * 1024 * 1024);

        const updated = await client.ok<any>('POST', `/api/v0.1/app/email/${email.id}/remove_attachments`);
        expect(updated.content.parts.map((p: any) => [p.filename, p.status, p.file_id])).toEqual([['a.csv', 'removed', undefined]]);
        expect(updated.content.embedded[0].parts.map((p: any) => p.status)).toEqual(['removed']);
        for (const fileId of email.file_ids) expect((await get(fileId)).status).toBe(404);
        const after = await client.ok<any>('GET', '/api/v0.1/app/storage');
        expect(after.attachments).toEqual(before.attachments);
        expect((await client.ok<any>('GET', `/api/v0.1/app/email/${email.id}`)).subject).toBe('With attachments');

        await client.ok('DELETE', `/api/v0.1/app/email/${email.id}`);
        expect((await client.request('POST', `/api/v0.1/app/email/${email.id}/remove_attachments`)).status).toBe(404);
    });

    it('releases the files of a deleted email', async () => {
        const email = await seedEmail(owner, { messageId: '<delete-files@example.com>', subject: 'Delete me', text: 'x', attachments: [{ filename: 'c.csv', mime: 'text/csv', content: 'z' }] });
        expect((await get(email.file_ids[0]!)).status).toBe(200);
        await client.ok('DELETE', `/api/v0.1/app/email/${email.id}`);
        expect((await get(email.file_ids[0]!)).status).toBe(404);
    });
});
