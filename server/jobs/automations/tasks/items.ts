// Helpers for working with TaskItems and mime types.
import { EMAIL_MIME } from '#shared/utils/automation_tasks';
import type { EmailContent, TaskItem } from './types';

export { EMAIL_MIME, mimeMatches } from '#shared/utils/automation_tasks';

export const isTextMime = (mime: string): boolean => {
    const m = mime.toLowerCase();
    return m.startsWith('text/') || m.includes('json') || m.includes('xml');
};

/** Text view of an item: emails become subject + body, text passes through, binary is rejected. */
export const itemToText = (item: TaskItem): string => {
    if (item.mime === EMAIL_MIME) {
        const email = item.content as EmailContent;
        return `Subject: ${email.subject}\n\nBody:\n${email.text}`;
    }
    if (isTextMime(item.mime)) {
        return typeof item.content === 'string' ? item.content : JSON.stringify(item.content);
    }
    throw new Error(`Cannot convert ${item.mime} to text`);
};

/** Joins several items into one text block; a single item is returned as is. */
export const itemsToText = (items: TaskItem[]): string => {
    if (items.length === 1) return itemToText(items[0]!);
    return items.map((item, idx) => `--- Item ${idx + 1} ---\n${itemToText(item)}`).join('\n\n');
};

export const unionRefs = (items: TaskItem[]): string[] => [...new Set(items.flatMap((i) => i.sourceRefs))];

/**
 * Items are objects and passed by reference: every task reading the same output gets the same object.
 * Freezing them when they enter a run makes an accidental change throw instead of leaking into other tasks.
 */
export const freezeItem = (item: TaskItem): TaskItem => Object.freeze({
    ...item,
    sourceRefs: Object.freeze([...item.sourceRefs]) as string[],
    content: item.content && typeof item.content === 'object' && !Buffer.isBuffer(item.content)
        ? Object.freeze({ ...item.content })
        : item.content,
    error: item.error ? Object.freeze({ ...item.error }) : undefined,
});
