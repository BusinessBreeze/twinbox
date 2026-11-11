// Shared by the email-producing source types (IMAP, staging); not a source type itself (the registry only
// registers classes). Builds the message/rfc822 TaskItem for one email.
// itemUrl is always set; automations without "Add source links" drop it before their tasks run.
import { baseUrl } from '../../deps';
import { EMAIL_MIME, type EmailContent, type TaskItem } from '../../../automations/tasks';

/** Link that opens the stored email (the repositories page reads message_id; '/' would redirect and drop it). */
export const emailUrl = (messageId: string) => `${baseUrl()}/repositories?message_id=${encodeURIComponent(messageId)}`;

export const toEmailItem = (ref: string, email: any): TaskItem => {
    const content: EmailContent = {
        messageId: email.messageId,
        subject: email.subject || '(No Subject)',
        from: email.from || '',
        to: email.to || '',
        date: new Date(email.date).toISOString(),
        text: email.text || '',
        // A stored row has them in its envelope; a fetched one passes them directly
        inReplyTo: email.inReplyTo || email.content?.envelope?.in_reply_to || '',
        references: email.references || email.content?.envelope?.references?.join(' ') || '',
    };
    const itemUrl = email.messageId ? emailUrl(email.messageId) : undefined;
    return { mime: EMAIL_MIME, content, label: content.subject, sourceRefs: [ref], itemUrl };
};
