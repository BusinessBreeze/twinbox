// Selective download (docs/specs/SPEC_attachments.md 7d): from a message's BODYSTRUCTURE, which parts to download
// (planParts), and the message rebuilt from just those parts (rebuildMessage). The rebuilt message is what mailparser
// and the email builder read, so decoding (transfer encodings, charsets, inline images) stays theirs. A part that is
// not downloaded stays in the rebuilt message as an empty placeholder carrying OMITTED_HEADER (why, and its size), so
// the builder lists it where it was. Pure: no IMAP here.
import { OMITTED_HEADER, typeAllowed, type AttachmentRules } from '../../deps';

/** A BODYSTRUCTURE node as imapflow returns it (the fields used here). */
export interface StructureNode {
    part?: string;
    type: string;
    parameters?: Record<string, string>;
    disposition?: string;
    dispositionParameters?: Record<string, string>;
    encoding?: string;
    size?: number;
    childNodes?: StructureNode[];
}

export type OmitReason = 'disabled' | 'type' | 'count' | 'too_large' | 'nested';

export interface PartPlan {
    sections: string[];                             // BODY[] sections to fetch (besides the message header)
    omitted: Map<StructureNode, OmitReason>;
    bytes: number;                                  // size of what will be downloaded
}

const isText = (n: StructureNode) => n.type === 'text/plain' || n.type === 'text/html';
const isMessage = (n: StructureNode) => n.type === 'message/rfc822';

/** Decoded size of a node, estimated: base64 carries 57 bytes per 78-byte line (76 characters and CRLF). */
export const decodedSize = (n: StructureNode) => Math.round((n.size ?? 0) * (n.encoding?.toLowerCase() === 'base64' ? 57 / 78 : 1));

/** The section of a leaf's body: a single-part message's body is "1" (its root node may carry no part number). */
const bodySection = (n: StructureNode) => n.part || '1';

/**
 * What to download: the body (text/plain and text/html not sent as attachment, and images of multipart/related, which
 * the HTML shows), attachments as the rules allow (wanted, type, size, count; the content check comes after the
 * download), and embedded messages one level deep. Deeper embedded messages are not downloaded at all.
 */
export const planParts = (root: StructureNode, wanted: boolean, rules: AttachmentRules): PartPlan => {
    const plan: PartPlan = { sections: [], omitted: new Map(), bytes: 0 };
    let attachments = 0;

    const leaf = (n: StructureNode, related: boolean) => {
        const asAttachment = n.disposition?.toLowerCase() === 'attachment';
        const body = (isText(n) && !asAttachment) || (related && n.type.startsWith('image/') && !asAttachment);
        let reason: OmitReason | null = null;
        if (!body) {
            if (!rules.enabled || !wanted) reason = 'disabled';
            else if (!typeAllowed(n.type, rules.types)) reason = 'type';
            else if (decodedSize(n) > rules.max_mb * 1024 * 1024) reason = 'too_large';
            else if (attachments >= rules.max_per_email) reason = 'count';
            else attachments++;
        }
        if (reason) { plan.omitted.set(n, reason); return; }
        plan.sections.push(bodySection(n));
        plan.bytes += n.size ?? 0;
    };

    const walk = (n: StructureNode, depth: number, related: boolean, isRoot: boolean) => {
        if (n.type.startsWith('multipart/')) {
            for (const child of n.childNodes ?? []) {
                if (child.part) plan.sections.push(`${child.part}.MIME`);
                walk(child, depth, n.type === 'multipart/related', false);
            }
            return;
        }
        if (isMessage(n) && !isRoot) {
            // Sent as attachment: an embedded message (one level). Inline: mailparser reads it as part of the body.
            const embedded = n.disposition?.toLowerCase() !== 'inline';
            if (embedded && depth >= 1) { plan.omitted.set(n, 'nested'); return; }
            plan.sections.push(`${n.part}.HEADER`);
            const body = n.childNodes?.[0];
            // A single-part embedded body without a part number of its own is the embedded message's TEXT
            if (body && !body.part && !body.type.startsWith('multipart/')) body.part = `${n.part}.TEXT`;
            if (body) walk(body, embedded ? depth + 1 : depth, false, false);
            return;
        }
        leaf(n, related);
    };

    walk(root, 0, false, true);
    return plan;
};

const CRLF = '\r\n';

/**
 * The message rebuilt from the downloaded sections (keys lower case, as imapflow returns them): the message header,
 * each kept node with its MIME header, an empty placeholder for each omitted node. Bodies stay as the server sent
 * them (transfer-encoded), so the parser decodes them as in the original.
 */
export const rebuildMessage = (root: StructureNode, header: Buffer, sections: Map<string, Buffer>, plan: PartPlan): Buffer => {
    const get = (key: string) => sections.get(key.toLowerCase()) ?? Buffer.alloc(0);
    const out: Buffer[] = [];
    const text = (s: string) => out.push(Buffer.from(s, 'utf8'));

    /** The MIME header of a child node, without its final blank line (re-added below). */
    const mimeOf = (n: StructureNode) => get(`${n.part}.MIME`).toString('latin1').replace(/(\r?\n)+$/, '');

    const placeholder = (n: StructureNode, reason: OmitReason) => {
        const size = isMessage(n) ? n.size ?? 0 : decodedSize(n);
        return `${OMITTED_HEADER}: ${reason}; size=${size}`;
    };

    const body = (n: StructureNode) => {
        if (n.type.startsWith('multipart/')) {
            const boundary = n.parameters?.boundary ?? '';
            for (const child of n.childNodes ?? []) {
                const omitted = plan.omitted.get(child);
                text(`--${boundary}${CRLF}`);
                out.push(Buffer.from(mimeOf(child), 'latin1'));
                if (omitted) {
                    // Content-Transfer-Encoding of the original would apply to an empty body: harmless
                    text(`${CRLF}${placeholder(child, omitted)}${CRLF}${CRLF}${CRLF}`);
                    continue;
                }
                text(`${CRLF}${CRLF}`);
                body(child);
                text(CRLF);
            }
            text(`--${boundary}--${CRLF}`);
            return;
        }
        if (isMessage(n) && n.childNodes?.[0] && n.part) {
            out.push(get(`${n.part}.HEADER`));
            body(n.childNodes[0]);
            return;
        }
        out.push(get(bodySection(n)));
    };

    const head = header.toString('latin1').replace(/(\r?\n)+$/, '');
    const rootOmitted = plan.omitted.get(root);
    if (rootOmitted) {
        // A single-part message that is itself an attachment (a PDF-only email): only its header, marked
        return Buffer.from(`${head}${CRLF}${placeholder(root, rootOmitted)}${CRLF}${CRLF}`, 'latin1');
    }
    out.push(Buffer.from(`${head}${CRLF}${CRLF}`, 'latin1'));
    body(root);
    return Buffer.concat(out);
};
