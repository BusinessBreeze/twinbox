// The email builder (server/services/app/email_builder.ts) on real MIME messages: which renditions exist, the text
// automations read, parts and embedded messages, and the attachment decision.
import { describe, it, expect } from 'vitest';
import MailComposer from 'nodemailer/lib/mail-composer/index.js';
import { buildEmail, parseMessage, storeAttachments, type AttachmentRules } from '#server/services/app/email_builder';

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
const PDF = Buffer.from('%PDF-1.4\n1 0 obj << >> endobj\ntrailer << >>\n%%EOF\n');

const compose = (opts: Record<string, any>) => new MailComposer({
    from: 'Anna Muster <anna@example.com>', to: 'sales@example.com', subject: 'Angebot', messageId: `<${Math.random()}@example.com>`,
    date: new Date('2026-11-02T08:00:00Z'), ...opts,
} as any).compile().build();

const build = async (opts: Record<string, any>) => buildEmail(await parseMessage(await compose(opts)));

const RULES: AttachmentRules = { enabled: true, max_mb: 1, max_per_email: 3, types: ['application/pdf', 'image/png', 'text/csv', 'text/html', 'image/svg+xml'] };
const store = async () => `file-${Math.random()}`;

describe('email builder', () => {
    it('keeps the renditions the message has and reads its text/plain', async () => {
        const email = await build({ text: 'Hallo, plain', html: '<p>Hallo, <b>html</b></p>' });
        expect(email.content.renditions.map((r) => r.mime)).toEqual(['text/html', 'text/plain']);
        expect(email.text).toBe('Hallo, plain');
        expect(email.content.envelope.from).toEqual([{ name: 'Anna Muster', address: 'anna@example.com' }]);
        expect(email.from).toBe('anna@example.com');
        expect(email.thread_id).toBe(email.messageId);
    });

    it('converts an HTML-only message readably, without image or link targets', async () => {
        const email = await build({ html: '<style>p{color:red}</style><h1>Title</h1><p>One</p><ul><li>a</li><li>b</li></ul><img src="https://t.example/x.gif"><a href="https://track.example/?u=1">Link</a>' });
        expect(email.content.renditions.map((r) => r.mime)).toEqual(['text/html']);
        expect(email.text).toContain('One');
        expect(email.text).toMatch(/a\n.*b/);
        expect(email.text).not.toContain('color:red');
        expect(email.text).not.toContain('track.example');
    });

    it('lists attachments as parts, also a PDF-only message and an HTML file', async () => {
        const email = await build({
            text: 'see attached',
            attachments: [
                { filename: 'offer.pdf', content: PDF, contentType: 'application/pdf' },
                { filename: 'page.html', content: '<script>x</script>', contentType: 'text/html' },
            ],
        });
        expect(email.content.parts.map((p) => [p.filename, p.mime, p.disposition, p.status])).toEqual([
            ['offer.pdf', 'application/pdf', 'attachment', 'skipped'],
            ['page.html', 'text/html', 'attachment', 'skipped'],
        ]);
        expect(email.content.renditions.map((r) => r.mime)).toEqual(['text/plain']);   // the .html file is no rendition

        const pdfOnly = await buildEmail(await parseMessage(Buffer.from([
            'From: scanner@example.com', 'To: me@example.com', 'Subject: Scan', 'Message-ID: <scan@example.com>',
            'MIME-Version: 1.0', 'Content-Type: application/pdf; name="scan.pdf"', 'Content-Transfer-Encoding: base64', '', PDF.toString('base64'),
        ].join('\r\n'))));
        expect(pdfOnly.content.renditions).toEqual([]);
        expect(pdfOnly.content.parts.map((p) => p.mime)).toEqual(['application/pdf']);
    });

    it('keeps inline images in the HTML (data: URIs), not as parts', async () => {
        const email = await build({ html: '<p>Logo: <img src="cid:logo@example"></p>', attachments: [{ filename: 'logo.png', content: PNG, cid: 'logo@example' }] });
        expect(email.content.parts).toEqual([]);
        expect(email.content.renditions[0]!.content).toContain('data:image/png;base64,');
    });

    it('follows a forwarded message one level deep and adds its text', async () => {
        const deepest = await compose({ subject: 'Deepest', text: 'too deep' });
        const forwarded = await compose({
            from: 'Kunde <k@kunde.example>', subject: 'Anfrage', text: 'Bitte ein Angebot für die Pumpe.',
            attachments: [{ filename: 'specs.pdf', content: PDF }, { filename: 'old.eml', content: deepest, contentType: 'message/rfc822', contentDisposition: 'attachment' }],
        });
        // Forwarded as attachment (Outlook, Gmail): an embedded message
        const email = await build({ text: 'FYI, see below', attachments: [{ filename: 'fwd.eml', content: forwarded, contentType: 'message/rfc822', contentDisposition: 'attachment' }] });
        expect(email.content.parts).toEqual([]);
        expect(email.content.embedded).toHaveLength(1);
        const fwd = email.content.embedded[0]!;
        expect(fwd.kind).toBe('forwarded');
        expect(fwd.envelope.subject).toBe('Anfrage');
        expect(fwd.parts.map((p) => p.filename)).toEqual(['specs.pdf']);
        expect(fwd.embedded_skipped).toBe(1);
        expect(email.pending.map((p) => p.part.filename)).toEqual(['specs.pdf']);
        expect(email.text).toMatch(/^FYI, see below\n\n---------- Forwarded message ----------\nFrom: Kunde <k@kunde\.example> \| Date: .+ \| Subject: Anfrage\n\nBitte ein Angebot/);
        expect(email.text).not.toContain('too deep');
    });

    it('reads a message attached inline as part of the body, like an inline forward', async () => {
        const forwarded = await compose({ subject: 'Anfrage', text: 'inner text', attachments: [{ filename: 'specs.pdf', content: PDF }] });
        const email = await build({ text: 'FYI', attachments: [{ filename: 'fwd.eml', content: forwarded, contentType: 'message/rfc822', contentDisposition: 'inline' }] });
        expect(email.content.embedded).toEqual([]);
        expect(email.text).toMatch(/^FYI\n[\s\S]*Subject: Anfrage[\s\S]*inner text$/);
        expect(email.content.parts.map((p) => p.filename)).toEqual(['specs.pdf']);
    });

    it('marks the returned message of a bounce', async () => {
        const original = await compose({ subject: 'Original', text: 'lost' });
        const raw = Buffer.from([
            'From: MAILER-DAEMON@example.com', 'To: me@example.com', 'Subject: Undelivered', 'Message-ID: <bounce@example.com>', 'MIME-Version: 1.0',
            'Content-Type: multipart/report; report-type=delivery-status; boundary="b"', '',
            '--b', 'Content-Type: text/plain', '', 'Delivery failed.', '--b', 'Content-Type: message/rfc822', '', original.toString(), '--b--', '',
        ].join('\r\n'));
        const email = await buildEmail(await parseMessage(raw));
        expect(email.content.embedded.map((m) => [m.kind, m.envelope.subject])).toEqual([['bounced', 'Original']]);
        expect(email.text).toContain('---------- Returned message ----------');
    });
});

describe('attachment decision', () => {
    const decide = async (attachments: any[], opts: { wanted?: boolean; rules?: Partial<AttachmentRules>; store?: typeof store } = {}) => {
        const email = await build({ text: 'x', attachments });
        const res = await storeAttachments(email.pending, opts.wanted ?? true, { ...RULES, ...opts.rules }, opts.store ?? store);
        return { parts: email.content.parts.map((p) => [p.filename, p.status, p.reason ?? null, p.status === 'stored' ? p.mime : null]), ...res };
    };

    it('stores nothing while the server or the source says no', async () => {
        for (const opts of [{ rules: { enabled: false } }, { wanted: false }]) {
            expect((await decide([{ filename: 'a.pdf', content: PDF }], opts)).parts).toEqual([['a.pdf', 'skipped', 'disabled', null]]);
        }
    });

    it('checks type, size, count and the content in that order', async () => {
        const { parts } = await decide([
            { filename: 'ok.pdf', content: PDF, contentType: 'application/pdf' },
            { filename: 'big.pdf', content: Buffer.concat([PDF, Buffer.alloc(2 * 1024 * 1024)]), contentType: 'application/pdf' },
            { filename: 'fake.pdf', content: 'not a pdf at all', contentType: 'application/pdf' },
            { filename: 'pixel.png', content: PNG, contentType: 'image/png' },
            { filename: 'renamed.png', content: PDF, contentType: 'image/png' },
            { filename: 'data.zip', content: PDF, contentType: 'application/zip' },
            { filename: 'list.csv', content: 'a,b\n1,2\n', contentType: 'text/csv' },
            { filename: 'fourth.pdf', content: PDF, contentType: 'application/pdf' },
        ]);
        expect(parts).toEqual([
            ['ok.pdf', 'stored', null, 'application/pdf'],
            ['big.pdf', 'too_large', null, null],
            ['fake.pdf', 'skipped', 'mismatch', null],
            ['pixel.png', 'stored', null, 'image/png'],
            ['renamed.png', 'stored', null, 'application/pdf'],   // stored as what it is
            ['data.zip', 'skipped', 'type', null],
            ['list.csv', 'skipped', 'count', null],                // 3 stored already
            ['fourth.pdf', 'skipped', 'count', null],
        ]);
    });

    it('never stores HTML or SVG, whatever the configuration allows', async () => {
        const svg = '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>';
        const { parts } = await decide([
            { filename: 'page.html', content: '<script>x</script>', contentType: 'text/html' },
            { filename: 'logo.svg', content: svg, contentType: 'image/svg+xml' },
            { filename: 'sneaky.csv', content: svg, contentType: 'text/csv' },
        ]);
        expect(parts.map((p) => p[1])).toEqual(['skipped', 'skipped', 'stored']);
        expect(parts[2]![3]).toBe('text/csv');   // text stays text/csv: served as a download, never rendered
    });

    it('reports a full storage once and keeps going', async () => {
        const full = Object.assign(new Error('full'), { name: 'FileQuotaError' });
        const res = await decide([{ filename: 'a.pdf', content: PDF }, { filename: 'b.png', content: PNG }], { store: async () => { throw full; } });
        expect(res.quotaReached).toBe(true);
        expect(res.parts.map((p) => p[2])).toEqual(['quota', 'quota']);
        const failed = await decide([{ filename: 'a.pdf', content: PDF }], { store: async () => { throw new Error('disk'); } });
        expect(failed.parts[0]![1]).toBe('failed');
    });
});
