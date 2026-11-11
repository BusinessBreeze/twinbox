// The structure of a stored email (emails.content), shared by the server (builder, routes) and the viewer.
// Type-neutral on purpose: other input types (RSS, chat) can use it later (docs/specs/SPEC_attachments.md, D14).

/** MIME type of an email record as the viewer gets it (the record as JSON, not a raw message). */
export const MESSAGE_RECORD_MIME = 'application/vnd.twinbox.message+json';

export interface MessageAddress {
    name: string | null;
    address: string;
}

export interface MessageEnvelope {
    from: MessageAddress[];
    to: MessageAddress[];
    cc: MessageAddress[];
    reply_to: MessageAddress[];
    subject?: string;
    date?: string;                                  // ISO
    message_id?: string;
    in_reply_to?: string;
    references?: string[];
    headers?: Record<string, string>;               // selected extra headers only (list-id)
}

/** One format of the body; renditions are alternatives (the viewer shows one). */
export interface MessageRendition {
    mime: 'text/html' | 'text/plain';
    size: number;                                   // bytes (UTF-8)
    content: string;
}

export type PartDisposition = 'inline' | 'attachment';
export type PartStatus = 'stored' | 'skipped' | 'too_large' | 'removed' | 'failed';
/** Why a part was not stored. */
export type PartSkipReason = 'disabled' | 'type' | 'mismatch' | 'count' | 'quota';

/** Anything that isn't a rendition: attachments, calendar invites, ... Listed always, stored optionally. */
export interface MessagePart {
    id: string;                                     // position in the message
    mime: string;                                   // the verified type when stored, else what the sender declared
    filename: string | null;
    size: number;
    disposition: PartDisposition;
    content_id: string | null;
    status: PartStatus;
    reason?: PartSkipReason;                        // status 'skipped'
    file_id?: string | null;                        // status 'stored'
}

/** A message inside the message (forward as attachment, bounce), followed one level deep. */
export interface EmbeddedMessage {
    kind: 'forwarded' | 'bounced';
    part_id: string;
    envelope: MessageEnvelope;
    renditions: MessageRendition[];
    parts: MessagePart[];
    embedded_skipped: number;                       // nested deeper, not followed
}

export interface MessageContent {
    envelope: MessageEnvelope;
    renditions: MessageRendition[];
    parts: MessagePart[];
    embedded: EmbeddedMessage[];
}

/** An email record as the API returns it (the viewer's input). */
export interface EmailRecord {
    id: string;
    messageId: string;
    from: string;
    to: string;
    subject: string | null;
    date: string | null;
    text: string | null;                            // what automations read (built from the renditions and forwards)
    size: number | null;
    staging_item: number | null;
    content: MessageContent | null;
}

/** "Name <address>, address" for display. */
export const formatAddresses = (list: MessageAddress[] = []) => list
    .map((a) => (a.name ? `${a.name} <${a.address}>` : a.address))
    .join(', ');
