// The local suite's real test mailbox (an account of its own: TEST_IMAP_USER / TEST_IMAP_PASSWORD, server in
// tests/fixtures/sources.json). The tests fill their folders themselves; only folders named "Test…" are ever touched.
import { ImapFlow } from 'imapflow';
import MailComposer from 'nodemailer/lib/mail-composer/index.js';
import { fixture } from './client';
import { requireEnv } from './env';

/** The source record to create for the test mailbox (config with the credentials from tests/.env). */
export const testMailboxSource = () => {
    const [mailbox] = fixture<any[]>('sources.json');
    return {
        ...mailbox,
        config: { ...mailbox.config, username: requireEnv('TEST_IMAP_USER'), credential: requireEnv('TEST_IMAP_PASSWORD') },
    };
};

const ownFolder = (path: string) => {
    if (!/^Test/.test(path)) throw new Error(`the tests only touch folders named "Test…", not "${path}"`);
    return path;
};

/** One session on the test mailbox. */
export const withMailbox = async <T>(work: (client: ImapFlow) => Promise<T>): Promise<T> => {
    const { config } = testMailboxSource();
    const client = new ImapFlow({
        host: config.host, port: Number(config.port), secure: !!config.use_ssl,
        auth: { user: config.username, pass: config.credential }, logger: false,
    });
    await client.connect();
    try {
        return await work(client);
    } finally {
        await client.logout().catch(() => client.close());
    }
};

/** A plain text email; the message id carries `tag` so the same fixture can sit in several folders as different emails. */
const rawEmail = async (email: any, tag: string) => new MailComposer({
    from: email.from, to: email.to, subject: email.subject, text: email.text, date: new Date(email.date),
    messageId: email.messageId.replace('@', `.${tag}@`),
}).compile().build();

/** Creates the folder if missing, empties it and puts `count` fixture emails into it (made-up emails, emails.json). */
export const fillFolder = (path: string, count: number) => withMailbox(async (client) => {
    ownFolder(path);
    if (!(await client.list()).some((m) => m.path === path)) await client.mailboxCreate(path);
    const lock = await client.getMailboxLock(path);
    try {
        if ((client.mailbox && client.mailbox.exists) || 0) await client.messageDelete('1:*');
    } finally {
        lock.release();
    }
    for (const email of fixture<any[]>('emails.json').slice(0, count)) {
        await client.append(path, await rawEmail(email, path.toLowerCase()), []);
    }
});

/** Creates the folder if missing and empties it. */
export const emptyFolder = (path: string) => fillFolder(path, 0);

/** Removes the folder (and what is in it), if it exists. */
export const removeFolder = (path: string) => withMailbox(async (client) => {
    ownFolder(path);
    if ((await client.list()).some((m) => m.path === path)) await client.mailboxDelete(path);
});

/** The subjects of the emails in a folder (none when the folder doesn't exist). */
export const folderSubjects = (path: string) => withMailbox(async (client) => {
    if (!(await client.list()).some((m) => m.path === path)) return [];
    const lock = await client.getMailboxLock(path);
    try {
        if (!client.mailbox || !client.mailbox.exists) return [];
        const subjects: string[] = [];
        for await (const m of client.fetch('1:*', { envelope: true })) subjects.push(m.envelope?.subject ?? '');
        return subjects.sort();
    } finally {
        lock.release();
    }
});
