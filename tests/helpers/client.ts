// API access to the test server for slow tests: the admin's API token (or a login session), JSON calls, and helpers for the
// recurring steps (fixture emails, local channel, staging source, waiting for events).
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { createClient } from '@libsql/client';
import { inject } from 'vitest';

export interface ApiResponse<T = any> {
    status: number;
    body: T;
}

export class TestClient {
    cookie = '';
    constructor(readonly baseUrl: string, readonly token = '') {}

    async request<T = any>(method: string, path: string, body?: unknown): Promise<ApiResponse<T>> {
        const res = await fetch(this.baseUrl + path, {
            method,
            headers: {
                'content-type': 'application/json',
                ...(this.cookie ? { cookie: this.cookie } : {}),
                ...(this.token ? { authorization: `Bearer ${this.token}` } : {}),
            },
            body: body === undefined ? undefined : JSON.stringify(body),
        });
        const setCookie = res.headers.getSetCookie();
        if (setCookie.length) this.cookie = setCookie.map((c) => c.split(';')[0]).join('; ');
        const text = await res.text();
        let parsed: any = text;
        try { parsed = JSON.parse(text); } catch { /* not JSON */ }
        return { status: res.status, body: parsed };
    }

    get<T = any>(path: string) { return this.request<T>('GET', path); }
    post<T = any>(path: string, body: unknown = {}) { return this.request<T>('POST', path, body); }
    patch<T = any>(path: string, body: unknown) { return this.request<T>('PATCH', path, body); }
    delete<T = any>(path: string) { return this.request<T>('DELETE', path); }

    /** GET/POST/... that must succeed; returns `data` of the response. */
    async ok<T = any>(method: string, path: string, body?: unknown): Promise<T> {
        const res = await this.request(method, path, body);
        if (res.status >= 300) throw new Error(`${method} ${path} -> ${res.status}: ${JSON.stringify(res.body).slice(0, 300)}`);
        return res.body?.data !== undefined ? res.body.data : res.body;
    }

    login(user: string, password: string) {
        return this.post('/api/auth/login', { user, password });
    }
}

/** The test admin, authenticated with the API token from tests/.env (TEST_API_TOKEN). */
export const adminClient = async () => new TestClient(inject('baseUrl'), inject('apiToken'));

/** The test admin with a login session: only for what a token may not do (managing tokens, the password ...). */
export const adminSessionClient = async () => {
    const client = new TestClient(inject('baseUrl'));
    const res = await client.login(inject('adminUser'), inject('adminPassword'));
    if (res.status !== 200) throw new Error(`admin login failed: ${res.status} ${JSON.stringify(res.body)}`);
    return client;
};

const fixturesDir = new URL('../fixtures/', import.meta.url);
export const fixture = <T = any>(name: string): T => JSON.parse(readFileSync(new URL(name, fixturesDir), 'utf8'));

/** Imports tests/fixtures/emails.json (idempotent: known message ids are skipped). */
export const importFixtureEmails = (client: TestClient) => client.ok('POST', '/api/v0.1/app/email/import', fixture('emails.json'));

/** The admin's staging source (created by the server on the first listing). */
export const stagingSource = async (client: TestClient) => {
    const sources = await client.ok<any[]>('GET', '/api/v0.1/app/sources');
    const staging = sources.find((s) => s.type === 'staging');
    if (!staging) throw new Error('no staging source');
    return staging;
};

/** A local ("Persist Local") notification channel, from tests/fixtures/channels.json. */
export const createLocalChannel = async (client: TestClient, name = 'Persist Local') => {
    const local = fixture<any[]>('channels.json').find((c) => c.provider === 'local');
    return client.ok('POST', '/api/user/notification', { ...local, name });
};

export interface UserEvent {
    message: string;
    level: string;
    metadata: any;
    createdAt?: string;
}

export const userEvents = async (client: TestClient): Promise<UserEvent[]> => {
    const res = await client.ok<any[]>('GET', '/api/user/event/search?limit=200&sortBy=createdAt&sortDir=desc');
    return res.map((e) => ({ ...e, metadata: typeof e.metadata === 'string' ? JSON.parse(e.metadata) : e.metadata }));
};

/** Polls the user's events until one matches (newest first). */
export const waitForEvent = async (client: TestClient, match: (e: UserEvent) => boolean, timeoutMs = 60_000) => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        const found = (await userEvents(client)).find(match);
        if (found) return found;
        await new Promise((r) => setTimeout(r, 500));
    }
    throw new Error('event not found in time');
};

/** Artifacts the local channel stored for the admin (newest last), with their contents. */
export const artifacts = async (): Promise<{ name: string; content: string }[]> => {
    const client = await adminClient();
    const list = (await client.ok<any[]>('GET', '/api/v0.1/app/artifacts')).reverse();
    return Promise.all(list.map(async (a) => {
        const res = await fetch(`${client.baseUrl}/api/v0.1/app/files/${a.file_id}`, { headers: { authorization: `Bearer ${client.token}` } });
        return { name: a.filename, content: await res.text() };
    }));
};

/** Stores bytes in the test server's file store for the owner (blob + files row); returns the file id. */
const seedFile = async (db: ReturnType<typeof createClient>, ownerId: string, filename: string, mime: string, bytes: Buffer) => {
    const hex = randomBytes(16).toString('hex');
    mkdirSync(join(inject('filesDir'), hex.slice(0, 2)), { recursive: true });
    writeFileSync(join(inject('filesDir'), hex.slice(0, 2), hex), bytes);
    const id = randomUUID();
    await db.execute({
        sql: 'INSERT INTO files (id, owner_id, storage_key, mime, size, sha256, filename, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        args: [id, ownerId, `${hex.slice(0, 2)}/${hex}`, mime, bytes.length, createHash('sha256').update(bytes).digest('hex'), filename, Math.floor(Date.now() / 1000)],
    });
    return id;
};

export interface SeedEmail {
    messageId: string;
    subject: string;
    text: string;                                   // the automation text
    html?: string;
    plain?: string;                                 // a text/plain rendition
    attachments?: Array<{ filename: string; mime: string; content: string | Buffer }>;
    skipped?: Array<{ filename: string; mime: string; reason: string }>;
    forwarded?: { subject: string; from: string; text: string; attachments?: Array<{ filename: string; mime: string; content: string | Buffer }> };
}

/**
 * Stores an email with stored attachments for the owner, as a source with attachments switched on would (the slow
 * tests have no IMAP server to download them from). Returns { id, file_ids }.
 */
export const seedEmail = async (ownerId: string, email: SeedEmail) => {
    const db = createClient({ url: inject('dbUrl') });
    const file_ids: string[] = [];
    try {
        const parts = async (list: SeedEmail['attachments'] = [], start = 1) => Promise.all(list.map(async (a, i) => {
            const bytes = Buffer.from(a.content);
            const file_id = await seedFile(db, ownerId, a.filename, a.mime, bytes);
            file_ids.push(file_id);
            return { id: String(start + i), mime: a.mime, filename: a.filename, size: bytes.length, disposition: 'attachment', content_id: null, status: 'stored', file_id };
        }));
        const rendition = (mime: string, content?: string) => (content ? [{ mime, size: Buffer.byteLength(content), content }] : []);
        const fwd = email.forwarded;
        const content = {
            envelope: { from: [{ name: 'Sender', address: 'sender@example.com' }], to: [{ name: null, address: 'me@example.com' }], cc: [], reply_to: [], subject: email.subject, date: new Date().toISOString(), message_id: email.messageId },
            renditions: [...rendition('text/html', email.html), ...rendition('text/plain', email.plain)],
            parts: [
                ...await parts(email.attachments),
                ...(email.skipped ?? []).map((a, i) => ({ id: `s${i}`, mime: a.mime, filename: a.filename, size: 1234, disposition: 'attachment', content_id: null, status: 'skipped', reason: a.reason })),
            ],
            embedded: fwd ? [{
                kind: 'forwarded', part_id: '9', envelope: { from: [{ name: null, address: fwd.from }], to: [], cc: [], reply_to: [], subject: fwd.subject },
                renditions: rendition('text/plain', fwd.text), parts: await parts(fwd.attachments, 10), embedded_skipped: 0,
            }] : [],
        };
        const id = randomUUID();
        const now = Math.floor(Date.now() / 1000);
        await db.execute({
            sql: 'INSERT INTO emails (id, message_id, owner_id, subject, "from", "to", text, date, thread_id, size, content, staging_item, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)',
            args: [id, email.messageId, ownerId, email.subject, 'sender@example.com', 'me@example.com', email.text, new Date().toISOString(), email.messageId, 4096, JSON.stringify(content), now, now],
        });
        return { id, file_ids };
    } finally {
        db.close();
    }
};

/**
 * Stores an artifact for the owner the way the file store does (blob under a generated key, files + artifacts rows),
 * for tests that need artifacts of a given type without running an automation. Returns { id, file_id }.
 */
export const seedArtifact = async (ownerId: string, filename: string, mime: string, content: string | Buffer) => {
    const bytes = Buffer.from(content);
    const hex = randomBytes(16).toString('hex');
    mkdirSync(join(inject('filesDir'), hex.slice(0, 2)), { recursive: true });
    writeFileSync(join(inject('filesDir'), hex.slice(0, 2), hex), bytes);
    const now = Math.floor(Date.now() / 1000);
    const ids = { id: randomUUID(), file_id: randomUUID() };
    const db = createClient({ url: inject('dbUrl') });
    try {
        await db.execute({
            sql: 'INSERT INTO files (id, owner_id, storage_key, mime, size, sha256, filename, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            args: [ids.file_id, ownerId, `${hex.slice(0, 2)}/${hex}`, mime, bytes.length, createHash('sha256').update(bytes).digest('hex'), filename, now],
        });
        await db.execute({
            sql: "INSERT INTO artifacts (id, owner_id, file_id, filename, source_refs, created_at) VALUES (?, ?, ?, ?, '[]', ?)",
            args: [ids.id, ownerId, ids.file_id, filename, now],
        });
    } finally {
        db.close();
    }
    return ids;
};

/** Deletes every automation of the client's user (each test file starts clean). */
export const deleteAllAutomations = async (client: TestClient) => {
    const all = await client.ok<any[]>('GET', '/api/v0.1/app/automation');
    for (const a of all) await client.ok('DELETE', `/api/v0.1/app/automation/${a.id}`);
};
