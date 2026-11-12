// IMAP protocol layer: the single place where IMAP connections are set up and used.
// Used by the IMAP source class and the IMAP notification channel; knows nothing about sources or automations.
import { ImapFlow } from 'imapflow';
import { resolveRelativeSearchDates } from './search_dates';
import { planParts, rebuildMessage, type PartPlan, type StructureNode } from './parts';
import type { AttachmentRules } from '../../deps';
import { limits } from '#shared/limits';

/** Connection settings (the IMAP source config, or a notification channel's own credentials). */
export interface ImapConnectionConfig {
    host: string;
    port: number;
    use_ssl: boolean;
    username: string;
    auth_type?: 'login' | 'oauth';
    credential?: string;
}

/** A fetched message: the raw source (parsed by the source type) and what the envelope says, for reports. */
export interface FetchedEmail {
    uid: number;
    messageId: string;
    from: string;
    subject: string;
    date: Date;
    size: number;                                   // bytes on the server
    source: Buffer;                                 // the message as downloaded (without the parts not wanted); empty when tooLarge
    tooLarge?: number;                              // bytes it would take when over maxBytes: not downloaded
}

export interface FetchSinceResult {
    emails: FetchedEmail[];
    uidValidity: number;
    renumbered: boolean;                            // UIDVALIDITY differed from the stored one
}

const RENUMBERED_FETCH_COUNT = 10;

export const createImapClient = (config: ImapConnectionConfig) => new ImapFlow({
    host: config.host,
    port: Number(config.port),
    secure: !!config.use_ssl,
    auth: {
        user: config.username,
        pass: config.auth_type === 'oauth' ? undefined : config.credential,
        accessToken: config.auth_type === 'oauth' ? config.credential : undefined,
    },
    connectionTimeout: limits.imap.connection_timeout_ms,
    greetingTimeout: limits.imap.greeting_timeout_ms,
    logger: false,
});

/** Opens a connection, runs `work`, always closes it again. */
const withClient = async <T>(config: ImapConnectionConfig, work: (client: ImapFlow) => Promise<T>): Promise<T> => {
    const client = createImapClient(config);
    await client.connect();
    try {
        return await work(client);
    } finally {
        await client.logout().catch(() => client.close());
    }
};

export const listFolders = (config: ImapConnectionConfig): Promise<string[]> =>
    withClient(config, async (client) => (await client.list()).map((m) => m.path).sort((a, b) => a.localeCompare(b)));

const parseSearch = (search: unknown): Record<string, any> => {
    let parsed: any = search;
    if (typeof search === 'string') {
        try { parsed = JSON.parse(search); } catch { parsed = {}; }
    }
    const criteria = resolveRelativeSearchDates(parsed && typeof parsed === 'object' ? parsed : {});
    return Object.keys(criteria).length > 0 ? criteria : { all: true };   // no search: the whole folder
};

/**
 * New messages of a folder matching `search` with UID > lastUid, oldest first, at most maxItems.
 * Only the wanted parts are downloaded (./parts.ts): the body, and attachments as `attachments` allows; maxBytes caps
 * what is downloaded, not the message on the server.
 * If the folder's UIDVALIDITY differs from `uidValidity` (the folder was renumbered), lastUid is meaningless:
 * the search runs without the UID condition and only the last RENUMBERED_FETCH_COUNT messages are returned.
 */
export const fetchSince = (
    config: ImapConnectionConfig,
    opts: {
        folder: string; search?: unknown; lastUid: number; uidValidity?: number; maxItems: number; maxBytes: number;
        attachments?: { wanted: boolean; rules: AttachmentRules };
    },
): Promise<FetchSinceResult> => withClient(config, async (client) => {
    const lock = await client.getMailboxLock(opts.folder);
    try {
        const mailbox = client.mailbox || undefined;
        const currentValidity = Number(mailbox?.uidValidity ?? 0);
        const renumbered = !!opts.uidValidity && currentValidity !== Number(opts.uidValidity);
        const criteria = parseSearch(opts.search);

        let uids: number[];
        if (renumbered) {
            const all = (await client.search(criteria, { uid: true })) || [];
            uids = [...all].sort((a, b) => a - b).slice(-RENUMBERED_FETCH_COUNT);
        } else {
            const withUid = opts.lastUid > 0 ? { ...criteria, uid: `${opts.lastUid + 1}:*` } : criteria;
            const found = (await client.search(withUid, { uid: true })) || [];
            // 'n:*' always includes the highest UID, even if it is <= lastUid; filter it out
            const newer = [...found].filter((uid) => uid > opts.lastUid).sort((a, b) => a - b);
            // First run (no checkpoint): the newest matches; later runs: the oldest unseen first, the rest next time
            uids = opts.lastUid > 0 ? newer.slice(0, opts.maxItems) : newer.slice(-opts.maxItems);
        }

        const emails: FetchedEmail[] = [];
        if (uids.length > 0) {
            // Structure first: which parts to download and how much that is. An email over the limit is not downloaded,
            // only reported with what its envelope says. No other IMAP command may run while a fetch is iterated, hence
            // a first pass for all, then one fetch per message for its own parts.
            const rules = opts.attachments?.rules ?? { enabled: false, max_mb: 0, max_per_email: 0, types: [] };
            const planned: Array<{ uid: number; base: Omit<FetchedEmail, 'source'>; structure?: StructureNode; plan?: PartPlan }> = [];
            for await (const message of client.fetch(uids, { size: true, envelope: true, uid: true, bodyStructure: true }, { uid: true })) {
                const base = {
                    uid: message.uid, messageId: message.envelope?.messageId || '', from: message.envelope?.from?.[0]?.address || '',
                    subject: message.envelope?.subject || '(No Subject)', date: message.envelope?.date || new Date(), size: message.size ?? 0,
                };
                const structure = message.bodyStructure as StructureNode | undefined;
                const plan = structure ? planParts(structure, !!opts.attachments?.wanted, rules) : undefined;
                const bytes = plan ? plan.bytes : base.size;
                if (bytes > opts.maxBytes) emails.push({ ...base, source: Buffer.alloc(0), tooLarge: bytes });
                else planned.push({ uid: message.uid, base, structure, plan });
            }
            for (const { uid, base, structure, plan } of planned) {
                // Without a structure (unusual server answer): the whole message, as before
                const query = structure && plan
                    ? { uid: true, headers: true, bodyParts: [...new Set(plan.sections)] }
                    : { uid: true, source: true };
                for await (const message of client.fetch(String(uid), query, { uid: true })) {
                    let source = message.source;
                    if (structure && plan && message.headers) {
                        const parts = new Map([...(message.bodyParts ?? new Map())].map(([k, v]) => [k.toLowerCase(), v] as const));
                        source = rebuildMessage(structure, message.headers, parts, plan);
                    }
                    if (source) emails.push({ ...base, source });
                }
            }
            emails.sort((x, y) => x.uid - y.uid);
        }
        return { emails, uidValidity: currentValidity, renumbered };
    } finally {
        lock.release();
    }
});

/** Adds flags (e.g. \\Seen, \\Flagged) to messages of one folder, in one short session. */
export const addFlags = (config: ImapConnectionConfig, folder: string, uids: number[], flags: string[]): Promise<void> =>
    withClient(config, async (client) => {
        const lock = await client.getMailboxLock(folder);
        try {
            await client.messageFlagsAdd(uids, flags, { uid: true });
        } finally {
            lock.release();
        }
    });

/** Stores a raw message in a folder (used by the IMAP notification channel). */
export const appendMessage = (config: ImapConnectionConfig, folder: string, raw: Buffer, flags: string[] = []): Promise<void> =>
    withClient(config, async (client) => {
        const lock = await client.getMailboxLock(folder);
        try {
            await client.append(folder, raw, flags);
        } finally {
            lock.release();
        }
    });

/** One copy or move of messages from `folder` to `destination`. */
export interface Transfer {
    op: 'copy' | 'move';
    folder: string;
    destination: string;
    uids: number[];
}

export type TransferStatus = 'done' | 'unsupported' | 'folder_missing' | 'failed';

/**
 * Copies and moves messages between folders in one session: per folder all copies first (the message must still be
 * there), then the moves. A missing destination fails only its own transfers.
 * Moves need the MOVE extension (RFC 6851). Without it imapflow would emulate a move with COPY + \Deleted + EXPUNGE, and
 * unless the server also has UIDPLUS that EXPUNGE removes every message flagged \Deleted in the folder, not only these.
 * So without MOVE nothing is moved ('unsupported'); copying is part of the base protocol.
 */
export const transferMessages = (
    config: ImapConnectionConfig,
    transfers: Transfer[],
): Promise<Array<Transfer & { status: TransferStatus; reason?: string }>> => withClient(config, async (client) => {
    const moveSupported = client.capabilities.has('MOVE');
    const folders = new Set((await client.list()).map((m) => m.path));
    const results: Array<Transfer & { status: TransferStatus; reason?: string }> = [];
    const byFolder = new Map<string, Transfer[]>();
    for (const t of transfers) byFolder.set(t.folder, [...(byFolder.get(t.folder) ?? []), t]);

    for (const [folder, list] of byFolder) {
        const ordered = [...list.filter((t) => t.op === 'copy'), ...list.filter((t) => t.op === 'move')];
        const lock = await client.getMailboxLock(folder);
        try {
            for (const t of ordered) {
                if (t.uids.length === 0) continue;
                if (t.op === 'move' && !moveSupported) { results.push({ ...t, status: 'unsupported' }); continue; }
                if (!folders.has(t.destination)) { results.push({ ...t, status: 'folder_missing' }); continue; }
                // imapflow reports a refused command as `false` (it doesn't throw)
                try {
                    const res = t.op === 'copy'
                        ? await client.messageCopy(t.uids, t.destination, { uid: true })
                        : await client.messageMove(t.uids, t.destination, { uid: true });
                    results.push(res ? { ...t, status: 'done' } : { ...t, status: 'failed', reason: `${t.op} refused by the server` });
                } catch (err: any) {
                    results.push({ ...t, status: 'failed', reason: err?.message || String(err) });
                }
            }
        } finally {
            lock.release();
        }
    }
    return results;
});
