import { describe, it, expect, beforeAll } from 'vitest';
import { adminClient, fixture, importFixtureEmails, type TestClient } from '../../helpers/client';

const byMessageId = (client: TestClient, id: string) =>
    client.ok<any[]>('GET', `/api/v0.1/app/email?message_id=${encodeURIComponent(id)}`);

describe('emails', () => {
    let client: TestClient;
    beforeAll(async () => { client = await adminClient(); });

    it('imports exported email records, once', async () => {
        await importFixtureEmails(client);
        const again = await importFixtureEmails(client);
        expect(again.every((e: any) => e === null)).toBe(true);   // known message ids are skipped

        const all = await client.ok<any[]>('GET', '/api/v0.1/app/email');
        const fixtures = fixture<any[]>('emails.json');
        for (const f of fixtures) expect(all.some((e) => e.messageId === f.messageId)).toBe(true);
        expect(all.filter((e) => e.staging_item === 1).length).toBeGreaterThanOrEqual(fixtures.filter((f) => f.staging_item).length);
    });

    it('derives the text of an HTML-only email', async () => {
        const [listed] = await byMessageId(client, '<html-only-1@shop.example.com>');
        const email = await client.ok<any>('GET', `/api/v0.1/app/email/${listed.id}`);
        expect(email.text).toContain('Up to 30% off all garden tools');
        expect(email.text).not.toContain('<b>');
    });

    it('lists emails without their structure, and gives one with it', async () => {
        const [listed] = await byMessageId(client, '<html-only-1@shop.example.com>');
        expect(listed.content).toBeUndefined();
        expect(listed.text).toBeUndefined();
        expect(listed.attachments).toBe(0);
        const one = await client.ok<any>('GET', `/api/v0.1/app/email/${listed.id}`);
        expect(one.content.renditions.map((r: any) => r.mime)).toEqual(['text/html']);
        expect(one.content.envelope.from[0].address).toBe(listed.from);
    });

    it('imports its own export again: the structure, without references to files', async () => {
        const messageId = '<export-roundtrip@example.com>';
        await client.ok('POST', '/api/v0.1/app/email/import', [{
            messageId, from: 'a@example.com', to: 'b@example.com', subject: 'Roundtrip', date: '2026-10-10T10:00:00.000Z', text: 'automation text',
            content: {
                envelope: { from: [{ name: 'A', address: 'a@example.com' }], to: [], cc: [], reply_to: [], subject: 'Roundtrip' },
                renditions: [{ mime: 'text/plain', size: 4, content: 'body' }, { mime: 'application/x-evil', size: 1, content: 'x' }],
                parts: [{ id: '1', mime: 'application/pdf', filename: 'a.pdf', size: 9, disposition: 'attachment', content_id: null, status: 'stored', file_id: 'someone-elses-file' }],
                embedded: [],
            },
        }]);
        const [listed] = await byMessageId(client, messageId);
        const one = await client.ok<any>('GET', `/api/v0.1/app/email/${listed.id}`);
        expect(one.text).toBe('automation text');
        expect(one.content.renditions.map((r: any) => r.mime)).toEqual(['text/plain']);
        expect(one.content.parts).toEqual([expect.objectContaining({ filename: 'a.pdf', status: 'removed' })]);
        expect(one.content.parts[0].file_id).toBeUndefined();
        await client.ok('DELETE', `/api/v0.1/app/email/${listed.id}`);
    });

    it('finds nothing for a pruned message id (the "pruned" notice)', async () => {
        expect(await byMessageId(client, '<long-gone@example.com>')).toEqual([]);
    });
});
