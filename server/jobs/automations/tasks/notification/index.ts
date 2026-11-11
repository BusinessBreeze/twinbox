// Sends directly, with a few short retries to ride out brief outages (service restart, network hiccup).
// If every attempt fails, the failure is logged and reported to the user and the run continues:
// a notification is not worth re-running the automation for.
//
// Formatting: providers put the first text item in the message body and everything else in attachments,
// so all text (emails, artifacts, error notices) is merged into one markdown body here.
// Binary items (audio) stay attachments with their own file names.
// The body is sent in full; per-service size limits (e.g. ntfy) are handled by Apprise.
//
// File names (body and attachments): <short date>-<24h time>-<label>[-<index>].<ext>, e.g. 30.10.26-14-05-09-Notification-2.mp3
// Date and time are fixed at the task's first send in a run. The index is added when more than one file of a type
// goes out: per-item runs number every file across all their messages; a single message numbers only repeated types.
import { getNotificationService, LocalNotifications, getExtensionFromMime, emitTelemetryEvent, EventScope, EventLevel, limits } from '../../deps';
import { BaseTask } from '../base_task';
import { recordIssue } from '../../record';
import type { EmailContent, TaskItem, TaskOutput } from '../types';
import { EMAIL_MIME, isTextMime, itemToText } from '../items';
import { notificationDefinition } from './definition';

// Waits between attempts (limits.notifications.retry_delays_ms; default 2 s, 8 s, 20 s: 4 attempts over ~30 s)
const retryDelays = () => limits.notifications.retry_delays_ms;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

interface NotificationItem {
    content: string;
    mime_type: string;
    filename?: string;
    metadata?: Record<string, any>;
}

export default class NotificationTask extends BaseTask {
    static definition = notificationDefinition;

    // Run-scoped naming state (one task object per run): shared timestamp and per-type counters across messages.
    #stamp: string | null = null;
    #counters = new Map<string, number>();

    protected async execute(inputs: TaskItem[]): Promise<TaskOutput | null> {
        const destination = this.args.destination;
        if (!destination) throw new Error(`Task "${this.label}" has no destination`);
        if (inputs.length === 0) return null;

        const items = this.#nameFiles(this.#buildNotification(inputs));
        // Test run: the same files, written to the owner's local artifacts instead of the channel
        if (this.ctx.deliverLocally) {
            await LocalNotifications.sendItems(this.ctx.automationName, items, { user_id: this.ctx.ownerId, automation_id: this.ctx.automationId });
            return null;
        }
        const notificationService = await getNotificationService(this.ctx.ownerId);

        const delays = retryDelays();
        for (let attempt = 0; attempt <= delays.length; attempt++) {
            if (attempt > 0) await sleep(delays[attempt - 1]!);
            const res = await notificationService.sendItems(destination, this.ctx.automationName, items, {
                keep_threadid: !!this.args.keep_threadid,
                automation_id: this.ctx.automationId,   // the local channel links its artifacts to the automation
            });
            if (res?.ok !== false) return null;
        }

        await recordIssue(this.ctx.automationId, 'warn');
        await emitTelemetryEvent({
            scope: EventScope.USER,
            owner_id: this.ctx.ownerId,
            level: EventLevel.WARN,
            category: 'automation',
            message: 'events.user.warn_automation_delivery_failed',
            metadata: { id: this.ctx.automationId, name: this.ctx.automationName, taskId: this.id, destination }
        });
        return null;
    }

    /**
     * One markdown body for all text, each section followed by links to its source items (when the source
     * set them); attachments get a short line with their source links; error notices last.
     */
    #buildNotification(inputs: TaskItem[]): NotificationItem[] {
        const isText = (i: TaskItem) => i.mime === EMAIL_MIME || isTextMime(i.mime);
        const texts = inputs.filter((i) => !i.error && isText(i));
        const notices = inputs.filter((i) => i.error);
        const binaries = inputs.filter((i) => !i.error && !isText(i));

        const sections = texts.map((i) => {
            const body = texts.length > 1 ? `## ${i.label || 'Item'}\n\n${itemToText(i)}` : itemToText(i);
            return body + this.#sourcesLine(i);
        });
        for (const item of binaries) {
            const sources = this.#sourcesLine(item);
            if (sources) sections.push(`**${item.label || 'Attachment'}** (attached)${sources}`);
        }
        // Errored emails are not stored, so notices name them instead of linking.
        if (notices.length > 0) sections.push(notices.map((n) => itemToText(n)).join('\n\n'));
        const fullText = sections.join('\n\n---\n\n');

        const metadata = this.#threadingMetadata(inputs);
        const items: NotificationItem[] = [];

        if (fullText) {
            items.push({ content: fullText, mime_type: 'text/markdown', metadata });
        }

        for (const item of binaries) {
            items.push({
                content: item.content,
                mime_type: item.mime,
                filename: item.filename,
                metadata: fullText ? undefined : metadata,
            });
        }

        return items;
    }

    /** "Sources: [subject](url) · …" for the source items behind an item; empty when none has a link. */
    #sourcesLine(item: TaskItem): string {
        const links = item.sourceRefs
            .map((ref) => this.getSource(ref))
            .filter((src): src is TaskItem => !!src?.itemUrl)
            .map((src) => `[${(src.label || 'source').replace(/[[\]]/g, '\\$&')}](${src.itemUrl})`);
        return links.length > 0 ? `\n\nSources: ${links.join(' · ')}` : '';
    }

    /** Gives every item its file name; see the header comment for the form. */
    #nameFiles(items: NotificationItem[]): NotificationItem[] {
        const stamp = (this.#stamp ??= this.#timestamp());
        const label = this.label.replace(/[/\\?%*:|"<>]/g, '_').replace(/\s+/g, ' ').trim() || 'Notification';
        const ext = (item: NotificationItem) => getExtensionFromMime(item.mime_type);

        const perRun = this.batchCount > 1;
        const inMessage = new Map<string, number>();
        for (const item of items) inMessage.set(ext(item), (inMessage.get(ext(item)) ?? 0) + 1);

        const seen = new Map<string, number>();
        return items.map((item) => {
            const e = ext(item);
            let index: number | null = null;
            if (perRun) {
                index = (this.#counters.get(e) ?? 0) + 1;
                this.#counters.set(e, index);
            } else if ((inMessage.get(e) ?? 0) > 1) {
                index = (seen.get(e) ?? 0) + 1;
                seen.set(e, index);
            }
            return { ...item, filename: `${stamp}-${label}${index ? `-${index}` : ''}.${e}` };
        });
    }

    /** Short date in the account's language and 24h time with seconds, safe for file names. */
    #timestamp(): string {
        const now = new Date();
        let date: string;
        try {
            date = new Intl.DateTimeFormat(this.ctx.lang, { dateStyle: 'short' }).format(now);
        } catch {
            date = new Intl.DateTimeFormat('en', { dateStyle: 'short' }).format(now);
        }
        const pad = (n: number) => String(n).padStart(2, '0');
        const time = `${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
        return `${date.replace(/[/\\:\s]/g, '-')}-${time}`;
    }

    /** Threading headers of all source emails behind the inputs, in the shape notification services read. */
    #threadingMetadata(inputs: TaskItem[]) {
        const refs = [...new Set(inputs.flatMap((i) => i.sourceRefs))];
        const headers = refs
            .map((ref) => this.getSource(ref))
            .filter((src): src is TaskItem => src?.mime === EMAIL_MIME)
            .map((src) => {
                const email = src.content as EmailContent;
                return {
                    messageId: email.messageId,
                    inReplyTo: email.inReplyTo || '',
                    references: email.references || '',
                    subject: email.subject,
                    from: email.from,
                };
            });
        return headers.length > 0 ? { imap: { headers } } : undefined;
    }
}
