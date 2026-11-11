// End to end with the real services (by hand: npm run test:local). The test mailbox (tests/fixtures/sources.json,
// password TEST_IMAP_PASSWORD) has two emails in its folder "Test". An automation on that folder summarizes each
// with the real LLM, reads the summary aloud with the real TTS, and delivers both to the local channel (artifacts)
// and to ntfy through Apprise (topic TEST_NTFY_TOPIC). Checked: the stored emails, the artifacts, the ntfy messages.
// Runs on the throwaway test server (tests/helpers/global_setup.ts), never on the developer's database.
import { describe, it, expect, beforeAll } from 'vitest';
import { adminClient, createLocalChannel, fixture, userEvents, waitForEvent, type TestClient } from '../helpers/client';
import { requireEnv } from '../helpers/env';

const FOLDER = 'Test';
const EMAILS = 2;
const RUN_TIMEOUT_MS = 540_000;   // two emails through a local LLM and TTS

describe('IMAP folder → summary + speech → artifacts and ntfy (live services)', () => {
    let client: TestClient;
    let automation: any;
    let source: any;
    let ntfy: { url: string; topic: string };
    const started = Math.floor(Date.now() / 1000);

    beforeAll(async () => {
        client = await adminClient();

        const [mailbox] = fixture<any[]>('sources.json');
        source = await client.ok('POST', '/api/v0.1/app/sources', {
            ...mailbox,
            name: `Live test mailbox ${started}`,
            config: { ...mailbox.config, credential: requireEnv('TEST_IMAP_PASSWORD') },
            settings: {},
        });

        const ntfyFixture = fixture<any[]>('channels.json').find((c) => c.type === 'ntfy');
        const topic = requireEnv('TEST_NTFY_TOPIC');
        ntfy = { url: `http://${ntfyFixture.config.host}:${ntfyFixture.config.port}`, topic };
        const ntfyChannel = await client.ok('POST', '/api/user/notification', {
            ...ntfyFixture, name: `Live test ntfy ${started}`, config: { ...ntfyFixture.config, targets: topic },
        });
        const localChannel = await createLocalChannel(client, `Live test local ${started}`);

        const notify = (id: string, label: string, destination: string) => ({
            id, type: 'notification', version: 1, label, inputs: ['t_summary', 't_speech'], aggregate: false,
            args: { destination, keep_threadid: false },
        });
        automation = await client.ok('POST', '/api/v0.1/app/automation', {
            name: `Live e2e ${started}`,
            active: 1,
            source_key: `${source.id}:${FOLDER}:`,
            options: {},
            tasks: [
                { id: 't_summary', type: 'create_artifact', version: 1, label: 'Summary', inputs: ['source'], aggregate: false, args: { prompt: 'Summarize the email in two short sentences.' } },
                { id: 't_speech', type: 'chatterbox', version: 1, label: 'Speech', inputs: ['t_summary'], aggregate: false, args: {} },
                notify('t_ntfy', 'To ntfy', ntfyChannel.id),
                notify('t_local', 'To artifacts', localChannel.id),
            ],
        });

        await client.ok('POST', `/api/v0.1/app/sources/${source.id}/run`);
        await waitForEvent(client, (e) => e.message === 'events.user.info_automation_end' && e.metadata?.id === automation.id, RUN_TIMEOUT_MS);
    }, RUN_TIMEOUT_MS + 60_000);

    it('runs without failures or failed deliveries', async () => {
        const problems = (await userEvents(client)).filter((e) => ['warn', 'warning', 'error'].includes(e.level));
        expect(problems.map((e) => `${e.message} ${JSON.stringify(e.metadata).slice(0, 200)}`)).toEqual([]);
    });

    it('stores the two emails of the folder', async () => {
        const emails = (await client.ok<any[]>('GET', '/api/v0.1/app/email')).filter((e) => e.source_id === source.id);
        expect(emails).toHaveLength(EMAILS);
        for (const email of emails) {
            const one = await client.ok<any>('GET', `/api/v0.1/app/email/${email.id}`);
            expect(one.text.length, `automation text of "${email.subject}"`).toBeGreaterThan(20);
        }
    });

    it('saves a summary and its speech per email as artifacts', async () => {
        const mine = (await client.ok<any[]>('GET', '/api/v0.1/app/artifacts')).filter((a) => a.automation_id === automation.id);
        const summaries = mine.filter((a) => a.mime === 'text/markdown');
        const speech = mine.filter((a) => a.mime === 'audio/mpeg');
        expect(summaries).toHaveLength(EMAILS);
        expect(speech).toHaveLength(EMAILS);
        for (const s of summaries) {
            const text = await (await fetch(`${client.baseUrl}/api/v0.1/app/files/${s.file_id}`, { headers: { authorization: `Bearer ${client.token}` } })).text();
            expect(text.trim().length, s.filename).toBeGreaterThan(30);
            expect(text).not.toMatch(/!\[|<img|<script/i);
            expect(text, 'written by the real LLM, not the slow tests\' stub').not.toContain('STUB');
        }
        for (const a of speech) expect(a.size, a.filename).toBeGreaterThan(5_000);
    });

    it('sends each summary with its speech to ntfy', async () => {
        // ntfy keeps messages; poll everything on the topic since this test started
        const res = await fetch(`${ntfy.url}/${encodeURIComponent(ntfy.topic)}/json?poll=1&since=${started}`);
        expect(res.status).toBe(200);
        const messages = (await res.text()).trim().split('\n').filter(Boolean).map((line) => JSON.parse(line)).filter((m) => m.event === 'message');
        const ours = messages.filter((m) => `${m.title ?? ''} ${m.message ?? ''}`.includes(automation.name) || m.attachment);
        expect(ours.length, `ntfy messages since the start: ${messages.length}`).toBeGreaterThanOrEqual(EMAILS);
        expect(ours.filter((m) => m.attachment).length, 'messages with the speech attached').toBeGreaterThanOrEqual(EMAILS);
    });
});
