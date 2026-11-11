// Selective IMAP download (server/jobs/sources/types/imap/parts.ts): from the BODYSTRUCTURE, only the body and the
// wanted attachments are fetched; the message rebuilt from those sections reads like the original, with the parts
// left out still listed. The "server" is tests/helpers/mime_structure.ts over real messages composed by nodemailer.
import { describe, it, expect, vi } from 'vitest';
import MailComposer from 'nodemailer/lib/mail-composer/index.js';
import { imapView } from '../../helpers/mime_structure';

vi.mock('#server/jobs/sources/deps', async () => {
    const builder = await import('#server/services/app/email_builder');
    return { OMITTED_HEADER: builder.OMITTED_HEADER, typeAllowed: builder.typeAllowed };
});

const { planParts, rebuildMessage } = await import('#server/jobs/sources/types/imap/parts');
const { buildEmail, parseMessage, storeAttachments } = await import('#server/services/app/email_builder');

const PDF = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(40_000, 7), Buffer.from('\n%%EOF\n')]);
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
const RULES = { enabled: true, max_mb: 1, max_per_email: 5, types: ['application/pdf'] };

const compose = (opts: Record<string, any>) => new MailComposer({
    from: 'Kunde <k@kunde.example>', to: 'sales@example.com', subject: 'Anfrage Pumpe', messageId: `<${Math.random()}@example.com>`, ...opts,
} as any).compile().build();

/** Downloads what the plan asks for from the "server" and rebuilds the message, as fetchSince does. */
const download = (raw: Buffer, wanted: boolean, rules = RULES) => {
    const { structure, sections } = imapView(raw);
    const plan = planParts(structure as any, wanted, rules);
    const fetched = new Map(plan.sections.map((s) => [s.toLowerCase(), sections.get(s.toUpperCase()) ?? sections.get(s)!] as const));
    expect(plan.sections.every((s) => fetched.get(s.toLowerCase())), 'every planned section exists').toBe(true);
    return { plan, rebuilt: rebuildMessage(structure as any, sections.get('HEADER')!, fetched, plan) };
};

const message = async () => {
    const deepest = await compose({ subject: 'Deepest', text: 'too deep', attachments: [{ filename: 'deep.pdf', content: PDF }] });
    const forwarded = await compose({
        subject: 'Original', text: 'Please quote the pump.', html: '<p>Please quote the <b>pump</b>.</p>',
        attachments: [{ filename: 'specs.pdf', content: PDF }, { filename: 'old.eml', content: deepest, contentType: 'message/rfc822', contentDisposition: 'attachment' }],
    });
    return compose({
        text: 'FYI, see below', html: '<p>FYI <img src="cid:logo@x"> see below</p>',
        attachments: [
            { filename: 'logo.png', content: PNG, cid: 'logo@x' },
            { filename: 'offer.pdf', content: PDF },
            { filename: 'tool.exe', content: Buffer.alloc(500, 1), contentType: 'application/octet-stream' },
            { filename: 'fwd.eml', content: forwarded, contentType: 'message/rfc822', contentDisposition: 'attachment' },
        ],
    });
};

describe('selective IMAP download', () => {
    it('downloads only the body when attachments are off, and still lists them', async () => {
        const raw = await message();
        const { plan, rebuilt } = download(raw, false);
        expect(rebuilt.length).toBeLessThan(raw.length / 3);              // the PDFs (about 55 KB each, base64) stayed on the server
        expect(plan.bytes).toBeLessThan(raw.length / 3);

        const email = await buildEmail(await parseMessage(rebuilt));
        expect(email.content.renditions.map((r) => r.mime)).toEqual(['text/html', 'text/plain']);
        expect(email.content.renditions[0]!.content).toContain('data:image/png;base64,');   // the inline image came along
        expect(email.content.parts.map((p) => [p.filename, p.status, p.reason])).toEqual([
            ['offer.pdf', 'skipped', 'disabled'], ['tool.exe', 'skipped', 'disabled'],
        ]);
        expect(Math.abs(email.content.parts[0]!.size - PDF.length)).toBeLessThan(PDF.length / 100);   // estimated from the encoded size
        expect(email.pending).toEqual([]);

        const fwd = email.content.embedded[0]!;
        expect(fwd.envelope.subject).toBe('Original');
        expect(fwd.renditions.map((r) => r.mime)).toEqual(['text/html', 'text/plain']);
        expect(fwd.parts.map((p) => [p.filename, p.status])).toEqual([['specs.pdf', 'skipped']]);
        expect(fwd.embedded_skipped).toBe(1);
        expect(email.text).toMatch(/^FYI, see below\n\n---------- Forwarded message ----------\n[^\n]*Subject: Original\n\nPlease quote the pump\.$/);
    });

    it('downloads the allowed attachments byte for byte, and only those', async () => {
        const { rebuilt } = download(await message(), true);
        const email = await buildEmail(await parseMessage(rebuilt));
        expect(email.pending.map((p) => [p.part.filename, p.content.equals(PDF)])).toEqual([['offer.pdf', true], ['specs.pdf', true]]);
        await storeAttachments(email.pending, true, RULES, async () => 'file-id');
        expect(email.content.parts.map((p) => [p.filename, p.status, p.reason ?? null])).toEqual([['offer.pdf', 'stored', null], ['tool.exe', 'skipped', 'type']]);
        expect(email.content.parts[0]).toMatchObject({ file_id: 'file-id', mime: 'application/pdf' });
        expect(email.content.embedded[0]!.parts[0]).toMatchObject({ filename: 'specs.pdf', status: 'stored' });
    });

    it('applies size and count before downloading', async () => {
        const raw = await message();
        const small = download(raw, true, { ...RULES, max_mb: 0.01 });
        const email = await buildEmail(await parseMessage(small.rebuilt));
        expect(email.content.parts.map((p) => [p.filename, p.status])).toEqual([['offer.pdf', 'too_large'], ['tool.exe', 'skipped']]);
        const one = download(raw, true, { ...RULES, max_per_email: 1 });
        const counted = await buildEmail(await parseMessage(one.rebuilt));
        expect(counted.pending.map((p) => p.part.filename)).toEqual(['offer.pdf']);
        expect(counted.content.embedded[0]!.parts.map((p) => p.reason)).toEqual(['count']);
    });

    it('handles a message that is only an attachment, and a plain single-part message', async () => {
        const pdfOnly = Buffer.from(['From: scanner@example.com', 'To: me@example.com', 'Subject: Scan', 'Message-ID: <scan@x>', 'MIME-Version: 1.0',
            'Content-Type: application/pdf; name="scan.pdf"', 'Content-Disposition: attachment; filename="scan.pdf"', 'Content-Transfer-Encoding: base64', '',
            PDF.toString('base64').replace(/.{76}/g, '$&\r\n')].join('\r\n'));
        const off = await buildEmail(await parseMessage(download(pdfOnly, false).rebuilt));
        expect(off.content.parts.map((p) => [p.filename, p.status])).toEqual([['scan.pdf', 'skipped']]);
        expect(Math.abs(off.content.parts[0]!.size - PDF.length)).toBeLessThan(PDF.length / 100);
        const on = await buildEmail(await parseMessage(download(pdfOnly, true).rebuilt));
        expect(on.pending[0]!.content.equals(PDF)).toBe(true);

        const plain = await compose({ text: 'Just text, äöü €' });
        const built = await buildEmail(await parseMessage(download(plain, false).rebuilt));
        expect(built.text).toBe('Just text, äöü €');
    });

    it('ignores the omission header when a sender puts it into their own message', async () => {
        const forged = await compose({ text: 'hi', attachments: [{ filename: 'real.pdf', content: PDF, headers: { 'X-Twinbox-Omitted': 'disabled; size=1' } }] });
        const email = await buildEmail(await parseMessage(forged));
        expect(email.pending.map((p) => p.part.filename)).toEqual(['real.pdf']);
    });
});
