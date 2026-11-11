// What an IMAP server makes of a raw message, for tests without one: its BODYSTRUCTURE (in imapflow's shape, part
// numbers as RFC 3501 gives them) and the BODY[] sections a client may fetch (HEADER, n, n.MIME, n.HEADER, n.TEXT).
// A small MIME splitter: enough for messages composed by nodemailer, not a general parser.

export interface Structure {
    part?: string;
    type: string;
    parameters?: Record<string, string>;
    disposition?: string;
    dispositionParameters?: Record<string, string>;
    encoding?: string;
    size: number;
    childNodes?: Structure[];
}

const split = (raw: Buffer) => {
    const text = raw.toString('latin1');
    const at = text.search(/\r?\n\r?\n/);
    const end = at < 0 ? text.length : at + (text.slice(at).startsWith('\r\n\r\n') ? 4 : 2);
    return { header: Buffer.from(text.slice(0, end), 'latin1'), body: Buffer.from(text.slice(end), 'latin1') };
};

const field = (header: string, name: string) => {
    const unfolded = header.replace(/\r?\n[ \t]+/g, ' ');
    return unfolded.match(new RegExp(`^${name}:\\s*(.*)$`, 'im'))?.[1]?.trim();
};

const params = (value = '') => Object.fromEntries([...value.matchAll(/;\s*([\w*-]+)=("([^"]*)"|[^;]+)/g)]
    .map((m) => [m[1]!.toLowerCase(), (m[3] ?? m[2]!).trim()]));

/** The structure and the fetchable sections of a raw message. */
export const imapView = (raw: Buffer) => {
    const sections = new Map<string, Buffer>();

    const node = (header: Buffer, body: Buffer, part: string | undefined, prefix: string): Structure => {
        const h = header.toString('latin1');
        const ctype = field(h, 'content-type') ?? 'text/plain';
        const type = ctype.split(';')[0]!.trim().toLowerCase();
        const disposition = field(h, 'content-disposition');
        const n: Structure = {
            part, type, parameters: params(ctype), encoding: field(h, 'content-transfer-encoding')?.toLowerCase(), size: body.length,
            ...(disposition ? { disposition: disposition.split(';')[0]!.trim().toLowerCase(), dispositionParameters: params(disposition) } : {}),
        };
        if (type.startsWith('multipart/')) {
            const boundary = n.parameters!.boundary!;
            const chunks = body.toString('latin1').split(new RegExp(`\\r?\\n?--${boundary.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:--)?[ \\t]*\\r?\\n?`)).slice(1, -1);
            n.childNodes = chunks.map((chunk, i) => {
                const childPart = prefix ? `${prefix}.${i + 1}` : String(i + 1);
                const { header: ch, body: cb } = split(Buffer.from(chunk, 'latin1'));
                sections.set(`${childPart}.MIME`, ch);
                return node(ch, cb, childPart, childPart);
            });
        } else if (type === 'message/rfc822' && part) {
            const inner = split(body);
            sections.set(`${part}.HEADER`, inner.header);
            sections.set(`${part}.TEXT`, inner.body);
            n.childNodes = [node(inner.header, inner.body, undefined, part)];
        } else if (part) {
            sections.set(part, body);
        }
        return n;
    };

    const { header, body } = split(raw);
    sections.set('HEADER', header);
    const root = node(header, body, undefined, '');
    if (!root.childNodes || root.type === 'message/rfc822') sections.set('1', body);
    return { structure: root, sections };
};
