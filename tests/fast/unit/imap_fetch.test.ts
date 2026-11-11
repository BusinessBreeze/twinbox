// fetchSince against a fake IMAP connection: bodies are downloaded whole (no cut at the LLM's input limit), attachments
// only when wanted, emails over maxBytes (what would be downloaded) are not downloaded but reported, and no IMAP command
// runs while a fetch is still being iterated. Parsing is the source type's (email_builder).
import { describe, it, expect, vi } from 'vitest';
import { imapView } from '../../helpers/mime_structure';

const LONG_HTML = `<html><head><style>${'p{margin:0}'.repeat(2000)}</style></head><body><p>The end of a long newsletter</p></body></html>`;
const raw = (subject: string, html: string) => Buffer.from([
    'From: news@example.com', 'To: me@example.com', `Subject: ${subject}`, `Message-ID: <${subject}@example.com>`,
    'Date: Mon, 02 Nov 2026 08:00:00 +0000', 'MIME-Version: 1.0', 'Content-Type: text/html; charset=utf-8', '', html,
].join('\r\n'));

const PDF = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(3 * 1024 * 1024, 7)]);
const withPdf = Buffer.from([
    'From: news@example.com', 'To: me@example.com', 'Subject: report', 'Message-ID: <report@example.com>', 'MIME-Version: 1.0',
    'Content-Type: multipart/mixed; boundary="b"', '', '--b', 'Content-Type: text/plain; charset=utf-8', '', 'See the report.',
    '--b', 'Content-Type: application/pdf; name="report.pdf"', 'Content-Disposition: attachment; filename="report.pdf"',
    'Content-Transfer-Encoding: base64', '', PDF.toString('base64').replace(/.{76}/g, '$&\r\n'), '--b--', '',
].join('\r\n'));

const MESSAGES: Array<{ uid: number; subject: string; source?: Buffer; size?: number }> = [
    { uid: 1, subject: 'long', source: raw('long', LONG_HTML) },
    { uid: 2, subject: 'huge', size: 50 * 1024 * 1024 },
    { uid: 3, subject: 'report', source: withPdf },
];
const requested: string[][] = [];   // the BODY[] sections of each part fetch

// parts.ts reaches the builder through the source layer's deps (which would load the app)
vi.mock('#server/jobs/sources/deps', async () => {
    const builder = await import('#server/services/app/email_builder');
    return { OMITTED_HEADER: builder.OMITTED_HEADER, typeAllowed: builder.typeAllowed };
});

vi.mock('imapflow', () => ({
    ImapFlow: class {
        mailbox = { uidValidity: 7 };
        #busy = false;
        async connect() {}
        async logout() {}
        close() {}
        async getMailboxLock() { return { release() {} }; }
        async search() { return MESSAGES.map((m) => m.uid); }
        async *fetch(range: number[] | string, query: Record<string, any>) {
            if (this.#busy) throw new Error('an IMAP command ran while a fetch was iterated');
            this.#busy = true;
            const uids = Array.isArray(range) ? range : String(range).split(',').map(Number);
            try {
                for (const m of MESSAGES.filter((m) => uids.includes(m.uid))) {
                    const envelope = { messageId: `<${m.subject}@example.com>`, subject: m.subject, from: [{ address: 'news@example.com' }] };
                    const view = m.source ? imapView(m.source) : null;
                    const answer: Record<string, any> = { uid: m.uid, envelope, size: m.size ?? m.source!.length };
                    if (query.source) answer.source = m.source;
                    if (query.bodyStructure && view) answer.bodyStructure = view.structure;
                    if (query.headers && view) answer.headers = view.sections.get('HEADER');
                    if (query.bodyParts && view) {
                        requested.push(query.bodyParts);
                        answer.bodyParts = new Map(query.bodyParts.map((k: string) => [k.toLowerCase(), view.sections.get(k)]));
                    }
                    yield answer;
                }
            } finally {
                this.#busy = false;
            }
        }
    },
}));

const { fetchSince } = await import('#server/jobs/sources/types/imap/client');
const config = { host: 'imap.example.com', port: 993, use_ssl: true, username: 'u', credential: 'p' };

describe('IMAP fetch', () => {
    it('downloads emails whole, however long their HTML', async () => {
        const { emails } = await fetchSince(config, { folder: 'INBOX', lastUid: 0, maxItems: 10, maxBytes: 10 * 1024 * 1024 });
        const long = emails.find((e) => e.subject === 'long')!;
        expect(LONG_HTML.length).toBeGreaterThan(15_000);
        expect(long.source.toString()).toContain('The end of a long newsletter');
        expect(long.size).toBe(long.source.length);
        expect(long.tooLarge).toBeUndefined();
    });

    it('reports an email over the size limit without downloading it', async () => {
        const { emails } = await fetchSince(config, { folder: 'INBOX', lastUid: 0, maxItems: 10, maxBytes: 10 * 1024 * 1024 });
        const huge = emails.find((e) => e.subject === 'huge')!;
        expect(huge.tooLarge).toBe(50 * 1024 * 1024);
        expect(huge.source.length).toBe(0);
        expect(huge.from).toBe('news@example.com');
        expect(emails.map((e) => e.uid)).toEqual([1, 2, 3]);   // all move the checkpoint
    });

    it('downloads attachments only when wanted and allowed; the limit applies to what is downloaded', async () => {
        const rules = { enabled: true, max_mb: 10, max_per_email: 5, types: ['application/pdf'] };
        const opts = { folder: 'INBOX', lastUid: 0, maxItems: 10, maxBytes: 1024 * 1024 };
        requested.length = 0;
        const without = (await fetchSince(config, { ...opts, attachments: { wanted: false, rules } })).emails.find((e) => e.uid === 3)!;
        expect(without.tooLarge).toBeUndefined();                   // 4 MB on the server, only the text downloaded
        expect(without.source.length).toBeLessThan(2000);
        expect(without.source.toString()).toContain('See the report.');
        expect(requested.at(-1)).toEqual(['1.MIME', '1', '2.MIME']);

        const wanted = (await fetchSince(config, { ...opts, attachments: { wanted: true, rules } })).emails.find((e) => e.uid === 3)!;
        expect(wanted.tooLarge).toBeGreaterThan(4 * 1024 * 1024);   // with the PDF it is over the 1 MB limit
        const bigger = (await fetchSince(config, { ...opts, maxBytes: 10 * 1024 * 1024, attachments: { wanted: true, rules } })).emails.find((e) => e.uid === 3)!;
        expect(bigger.source.length).toBeGreaterThan(4 * 1024 * 1024);
    });
});
