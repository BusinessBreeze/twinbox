// IMAP source: keys are '<sourceId>:<folder>:<searchId>' (searchId empty = whole folder). Polls each subscribed key
// since its checkpoint, flags after the filter, stores at the end. A missing folder (deleted or renamed on the server)
// is reported on every poll; the other keys still run.
import { and, eq, inArray } from 'drizzle-orm';
import { buildEmail, db, emails, getEmailService, limits, parseMessage, type BuiltEmail } from '../../deps';
import { BaseSource } from '../../base_source';
import { emailUrl, toEmailItem } from '../email/item';
import { ownEmails, pruneEmails } from '../email/prune';
import type { FetchResult, FilterResults, SourceKeyOption, TaskItem } from '../../types';
import { randomUUID } from 'node:crypto';
import { imapDefinition } from './definition';
import { addFlags, fetchSince, listFolders, transferMessages, type ImapConnectionConfig, type Transfer } from './client';
import { withCreationSince } from './search_dates';

// Events list at most this many of the emails they are about
const EVENT_LINKS = 50;

// The search every new IMAP source starts with; a supplied search of the same name replaces it
const DEFAULT_SEARCH_NAME = 'Default';


interface Pending {
    key: string;
    folder: string;
    uid: number;
    size: number;
    built: BuiltEmail;                              // parsed and built once: its text feeds the automations, then stored
}

export default class ImapSource extends BaseSource {
    static definition = imapDefinition;

    // Run-scoped state (one object per source record; a run is never concurrent with another of the same source).
    #pending = new Map<string, Pending>();                        // ref → where it lives, for afterFilter() and complete()
    #checkpoints = new Map<string, Record<string, any>>();         // key → new checkpoint

    private get searches(): Array<{ id: string; name: string; search?: unknown }> {
        return Array.isArray(this.record.settings?.searches) ? this.record.settings.searches : [];
    }

    /** '<sourceId>:<folder>:<searchId>'; the folder may itself contain ':' (it is everything in between). */
    override parseKey(key: string): { folder: string; searchId: string } | null {
        if (!key.startsWith(`${this.id}:`)) return null;
        const rest = key.slice(this.id.length + 1);
        const last = rest.lastIndexOf(':');
        if (last <= 0) return null;
        return { folder: rest.slice(0, last), searchId: rest.slice(last + 1) };
    }

    override keyProblem(key: string): string | null {
        const parts = this.parseKey(key);
        if (!parts) return 'invalid';
        if (parts.searchId && !this.searches.some((s) => s.id === parts.searchId)) return 'search_deleted';
        return null;
    }

    override keyLabel(key: string): string {
        const parts = this.parseKey(key);
        if (!parts) return this.name;
        const search = this.searches.find((s) => s.id === parts.searchId);
        return [this.name, parts.folder, search?.name].filter(Boolean).join(' › ');
    }

    /** Every folder on the server, alone and with each saved search. */
    override async keys(): Promise<SourceKeyOption[]> {
        const folders = await listFolders(this.record.config as ImapConnectionConfig);
        return folders.flatMap((folder) => [
            { key: `${this.id}:${folder}:`, label: `${this.name} › ${folder}`, source_id: this.id },
            ...this.searches.map((s) => ({ key: `${this.id}:${folder}:${s.id}`, label: `${this.name} › ${folder} › ${s.name}`, source_id: this.id })),
        ]);
    }

    static override async test(config: Record<string, any>) {
        try {
            const folders = await listFolders(config as ImapConnectionConfig);
            return { ok: true, reason: `${folders.length} folders` };
        } catch (err: any) {
            return { ok: false, reason: err?.message || 'Connection failed' };
        }
    }

    /** A new source starts with the search "Default" (dated by normalizeSettings), unless one of that name is supplied. */
    static override newSettings(settings: Record<string, any>) {
        const searches = Array.isArray(settings?.searches) ? settings.searches : [];
        if (searches.some((s: any) => String(s?.name ?? '').trim().toLowerCase() === DEFAULT_SEARCH_NAME.toLowerCase())) return settings;
        return { ...settings, searches: [{ name: DEFAULT_SEARCH_NAME, search: {} }, ...searches] };
    }

    /**
     * Saved searches keep their id (keys reference it); new ones get s_xxxxxxxx and a fixed "since" date
     * (limits.sources.new_search_since_days back) that the user may remove before the first run.
     * Names must be unique (case-insensitive): a duplicate is refused, the browser picks a free name.
     */
    static override normalizeSettings(settings: Record<string, any>, existing: Record<string, any>) {
        const data = super.normalizeSettings(settings, existing);
        const known = new Set((existing?.searches || []).map((s: any) => s.id));
        const names = new Set<string>();
        data.searches = data.searches.map((search: any, index: number) => {
            const isNew = !(search.id && known.has(search.id));
            const id = isNew ? `s_${randomUUID().replace(/-/g, '').slice(0, 8)}` : search.id;
            const name = String(search.name).trim();
            if (names.has(name.toLowerCase())) {
                throw createError({ status: 422, statusMessage: 'error sources.searches.name_duplicate', data: { field: `settings.searches.${index}.name` } });
            }
            names.add(name.toLowerCase());
            return isNew
                ? { ...search, id, name, search: withCreationSince(search.search, limits.sources.new_search_since_days) }
                : { ...search, id, name };
        });
        return data;
    }

    static override async listResources(config: Record<string, any>) {
        return (await listFolders(config as ImapConnectionConfig)).map((folder) => ({ value: folder, title: folder }));
    }

    async fetch(keys: string[]): Promise<FetchResult> {
        this.#pending.clear();
        this.#checkpoints.clear();
        const result: FetchResult = new Map();
        const config = this.record.config as ImapConnectionConfig;
        const folders = new Set(await listFolders(config));

        for (const key of keys) {
            const parts = this.parseKey(key);
            if (!parts) continue;
            const { folder, searchId } = parts;
            if (!folders.has(folder)) {
                await this.warn('events.user.warn_source_folder_missing', { folder });
                continue;
            }
            const search = searchId ? this.searches.find((s) => s.id === searchId) : undefined;
            if (searchId && !search) continue;                  // deleted search: the automation was warned then
            const checkpoint = (await this.checkpoints())[key] || {};
            const fetched = await fetchSince(config, {
                folder,
                search: search?.search,
                lastUid: Number(checkpoint.last_uid || 0),
                uidValidity: checkpoint.uidvalidity,
                maxItems: this.maxItems,
                maxBytes: limits.imap.max_email_mb * 1024 * 1024,   // what is downloaded: the body and the wanted attachments
                attachments: { wanted: !!this.record.settings?.download_attachments, rules: limits.attachments },
            });

            if (fetched.renumbered) {
                await this.warn('events.user.warn_source_renumbered', { folder });
            }

            // Everything fetched moves the checkpoint, also emails skipped as already stored.
            const maxUid = fetched.emails.reduce((m, e) => Math.max(m, e.uid), fetched.renumbered ? 0 : Number(checkpoint.last_uid || 0));
            this.#checkpoints.set(key, { last_uid: maxUid, uidvalidity: fetched.uidValidity });

            const messageIds = fetched.emails.map((e) => e.messageId).filter(Boolean);
            const stored = messageIds.length === 0 ? [] : await db.select({ messageId: emails.messageId }).from(emails)
                .where(and(eq(emails.owner_id, this.ownerId), inArray(emails.messageId, messageIds)));
            const alreadyStored = new Set(stored.map((r) => r.messageId));

            const items: TaskItem[] = [];
            for (const email of fetched.emails) {
                if (email.messageId && alreadyStored.has(email.messageId)) continue;
                if (email.tooLarge) {
                    await this.warn('events.user.warn_source_email_too_large', {
                        folder, subject: email.subject, from: email.from,
                        size_mb: Math.round(email.tooLarge / 1024 / 1024 * 10) / 10, limit_mb: limits.imap.max_email_mb,
                    });
                    continue;
                }
                const ref = email.messageId || `uid:${folder}:${email.uid}`;
                let built: BuiltEmail;
                try {
                    built = await buildEmail(await parseMessage(email.source));
                } catch (err: any) {
                    await this.warn('events.user.warn_source_store_failed', { ref, reason: err?.message || String(err) });
                    continue;
                }
                this.#pending.set(ref, { key, folder, uid: email.uid, size: email.size, built });
                items.push(toEmailItem(ref, { ...built, inReplyTo: built.content.envelope.in_reply_to, references: built.content.envelope.references?.join(' ') }));
            }
            result.set(key, items);
        }
        return result;
    }

    /** mark_read / mark_important: flag the passed emails on the server, per folder, one pass for all automations. */
    override async afterFilter(results: FilterResults): Promise<void> {
        const config = this.record.config as ImapConnectionConfig;
        const byFolder = new Map<string, { read: Set<number>; important: Set<number> }>();
        for (const { options, refs } of results) {
            for (const ref of refs) {
                const p = this.#pending.get(ref);
                if (!p) continue;
                const entry = byFolder.get(p.folder) || { read: new Set(), important: new Set() };
                if (options.mark_read) entry.read.add(p.uid);
                if (options.mark_important) entry.important.add(p.uid);
                byFolder.set(p.folder, entry);
            }
        }
        for (const [folder, { read, important }] of byFolder) {
            if (read.size) await addFlags(config, folder, [...read], ['\\Seen']);
            if (important.size) await addFlags(config, folder, [...important], ['\\Flagged']);
        }
    }

    /**
     * copy_to / move_to: the emails that passed an automation's filter, copied or moved to a folder of this account,
     * after its tasks. Copies run before moves. An email two automations move to different folders is not moved (it
     * can only be in one place; which one would be chance): reported. Moves need the server's MOVE extension (see
     * transferMessages); without it nothing is moved and that is reported. Every done copy and move is an event with
     * the emails, so a wrong one can be undone by hand.
     */
    override async afterTasks(results: FilterResults): Promise<void> {
        // Who asked for what, per source folder: op → destination → uid → automation names
        type Wanted = Map<string, Map<number, Set<string>>>;
        const plan = new Map<string, { copy: Wanted; move: Wanted }>();
        const add = (wanted: Wanted, destination: string, uid: number, name: string) => {
            const uids = wanted.get(destination) ?? new Map<number, Set<string>>();
            uids.set(uid, (uids.get(uid) ?? new Set()).add(name));
            wanted.set(destination, uids);
        };
        for (const { options, refs, automation } of results) {
            const copyTo = typeof options.copy_to === 'string' ? options.copy_to.trim() : '';
            const moveTo = typeof options.move_to === 'string' ? options.move_to.trim() : '';
            if (!copyTo && !moveTo) continue;
            for (const ref of refs) {
                const p = this.#pending.get(ref);
                if (!p) continue;
                const entry = plan.get(p.folder) ?? { copy: new Map(), move: new Map() };
                // Into its own folder: nothing to move, and a copy would only duplicate it
                if (copyTo && copyTo !== p.folder) add(entry.copy, copyTo, p.uid, automation?.name ?? '');
                if (moveTo && moveTo !== p.folder) add(entry.move, moveTo, p.uid, automation?.name ?? '');
                plan.set(p.folder, entry);
            }
        }

        const transfers: Array<Transfer & { names: Map<number, Set<string>> }> = [];
        for (const [folder, { copy, move }] of plan) {
            // An email moved to two folders: neither (its copies still happen)
            const targets = new Map<number, string[]>();
            for (const [destination, uids] of move) for (const uid of uids.keys()) targets.set(uid, [...(targets.get(uid) ?? []), destination]);
            const conflicts = [...targets].filter(([, dests]) => dests.length > 1);
            for (const [uid, destinations] of conflicts) {
                await this.warn('events.user.warn_source_move_conflict', { folder, destinations: destinations.join(', '), links: this.links(folder, [uid]) });
                for (const destination of destinations) move.get(destination)!.delete(uid);
            }
            for (const [destination, uids] of copy) {
                // Moved there anyway: a copy as well would put it there twice
                const moved = move.get(destination);
                for (const uid of [...uids.keys()]) if (moved?.has(uid)) uids.delete(uid);
                transfers.push({ op: 'copy', folder, destination, uids: [...uids.keys()], names: uids });
            }
            for (const [destination, uids] of move) transfers.push({ op: 'move', folder, destination, uids: [...uids.keys()], names: uids });
        }
        const todo = transfers.filter((t) => t.uids.length > 0);
        if (todo.length === 0) return;

        const done = await transferMessages(this.record.config as ImapConnectionConfig, todo);
        for (const [i, res] of done.entries()) {
            const names = [...new Set([...todo[i]!.names.values()].flatMap((n) => [...n]))].filter(Boolean).join(', ');
            const metadata = { name: names, folder: res.folder, destination: res.destination, count: res.uids.length, links: this.links(res.folder, res.uids) };
            if (res.status === 'done') await this.info(`events.user.info_source_${res.op === 'copy' ? 'copied' : 'moved'}`, metadata);
            else if (res.status === 'unsupported') await this.warn('events.user.warn_source_move_unsupported', metadata);
            else if (res.status === 'folder_missing') await this.warn('events.user.warn_source_target_folder_missing', metadata);
            else await this.warn('events.user.warn_source_transfer_failed', { ...metadata, reason: (res.reason ?? '').slice(0, 300) });
        }
    }

    /** Event links to the stored emails (they are stored at the end of this run), by folder and UID. */
    private links(folder: string, uids: number[]) {
        const wanted = new Set(uids);
        const links: Array<{ label: string; url?: string }> = [];
        for (const p of this.#pending.values()) {
            if (p.folder !== folder || !wanted.has(p.uid) || links.length >= EVENT_LINKS) continue;
            links.push({ label: p.built.subject || '(No Subject)', url: p.built.messageId ? emailUrl(p.built.messageId) : undefined });
        }
        return links;
    }

    /** Per key: { last_uid, uidvalidity }, in this source's state (sources.state.checkpoints). */
    private async checkpoints(): Promise<Record<string, Record<string, any>>> {
        return (await this.getState('checkpoints')) || {};
    }

    override async forgetKeys(keys: string[]): Promise<void> {
        const checkpoints = await this.checkpoints();
        if (!keys.some((key) => key in checkpoints)) return;
        for (const key of keys) delete checkpoints[key];
        await this.setState('checkpoints', checkpoints);
    }

    /** The emails this source downloaded (staged ones are kept). */
    override async prune(): Promise<number> {
        return await pruneEmails(ownEmails(this.ownerId, this.id), this.pruneLimits);
    }

    async complete(): Promise<void> {
        const emailService = await getEmailService(this.ownerId);
        const attachments = !!this.record.settings?.download_attachments;
        let quotaReached = false;
        // One unstorable email (no message id, no sender) must not stop the others or the checkpoints.
        for (const [ref, pending] of this.#pending) {
            try {
                const res = await emailService.createFromBuilt(pending.built, { source_id: this.id, size: pending.size, attachments });
                quotaReached ||= res.quotaReached;
            } catch (err: any) {
                await this.warn('events.user.warn_source_store_failed', { ref, reason: err?.statusMessage || err?.message || String(err) });
            }
        }
        // Once per run, not per attachment: the emails are stored, their attachments over the quota are not
        if (quotaReached) await this.warn('events.user.warn_files_quota_reached', { limit_mb: limits.files.max_user_mb });
        if (this.#checkpoints.size > 0) {
            await this.setState('checkpoints', { ...(await this.checkpoints()), ...Object.fromEntries(this.#checkpoints) });
        }
        this.#pending.clear();
        this.#checkpoints.clear();
    }
}
