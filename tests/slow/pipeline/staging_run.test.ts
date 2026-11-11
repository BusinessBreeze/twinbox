// Staging source → tasks → local channel, the whole run on the test server (stub LLM, no mail server).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
    adminClient, artifacts, createLocalChannel, deleteAllAutomations, fixture, importFixtureEmails, stagingSource, waitForEvent,
    type TestClient,
} from '../../helpers/client';

const notify = (label: string, channel: string, inputs = ['source']) =>
    ({ id: `t_${label}`, type: 'notification', version: 1, label, inputs, aggregate: false, args: { destination: channel, keep_threadid: false } });

describe('staging runs', () => {
    let client: TestClient;
    let staging: any;
    let channel: any;
    const staged = fixture<any[]>('emails.json').filter((e) => e.staging_item);

    beforeAll(async () => {
        client = await adminClient();
        await deleteAllAutomations(client);
        await importFixtureEmails(client);
        staging = await stagingSource(client);
        channel = await createLocalChannel(client, 'Pipeline local');
    });
    afterAll(async () => { await deleteAllAutomations(client); });

    /** Creates the automation, runs staging now and waits until the automation finished. */
    const runAutomation = async (body: any) => {
        const automation = await client.ok('POST', '/api/v0.1/app/automation', { source_key: staging.id, active: 1, ...body });
        await client.ok('POST', `/api/v0.1/app/sources/${staging.id}/run`);
        await waitForEvent(client, (e) => e.message === 'events.user.info_automation_end' && e.metadata.id === automation.id);
        await client.ok('PATCH', `/api/v0.1/app/automation/${automation.id}`, { active: 0 });   // keep later runs to themselves
        return automation;
    };
    const filesOf = async (label: string) => (await artifacts()).filter((a) => a.name.includes(label));

    it('delivers every staged email (and only those) to the local channel', async () => {
        await runAutomation({ name: 'Raw copy', options: { add_source_links: true }, tasks: [notify('Raw copy', channel.id)] });
        const files = await filesOf('Raw copy');
        expect(files).toHaveLength(staged.length);
        const all = files.map((f) => f.content).join('\n');
        for (const e of staged) if (e.subject) expect(all).toContain(e.subject);
        expect(all).not.toContain('Invoice 2026-0815');          // not staged
        expect(all).toContain('/repositories?message_id=');     // "Add source links"
    });

    it('leaves the source links out when the option is off', async () => {
        await runAutomation({ name: 'No links', options: { add_source_links: false }, tasks: [notify('No links', channel.id)] });
        const all = (await filesOf('No links')).map((f) => f.content).join('\n');
        expect(all).not.toContain('/repositories?message_id=');
    });

    it('names files <date>-<time>-<label>[-n].md', async () => {
        for (const f of await filesOf('Raw copy')) expect(f.name).toMatch(/^[\d.\-/]+-\d{2}-\d{2}-\d{2}-Raw copy(-\d+)?\.md$/);
    });

    it('keeps only the emails the filter prompt matches', async () => {
        await runAutomation({
            name: 'AI Act only', filter_prompt: 'Only emails that mention "AI Act"',
            tasks: [notify('AI Act only', channel.id)],
        });
        const files = await filesOf('AI Act only');
        expect(files).toHaveLength(2);   // the English and the German AI Act newsletter
        const all = files.map((f) => f.content).join('\n');
        expect(all).toContain('The AI Act Newsletter #110');
        expect(all).toContain('KI-Verordnung kompakt #12');
    });

    it('chains an LLM task into the notification', async () => {
        await runAutomation({
            name: 'Summaries', filter_prompt: 'Only emails that mention "AI Act"',
            tasks: [
                { id: 't_sum', type: 'create_artifact', version: 1, label: 'Summary', inputs: ['source'], aggregate: false, args: { prompt: 'Summarize in 3 bullet points.' } },
                notify('Summaries', channel.id, ['t_sum']),
            ],
        });
        const files = await filesOf('Summaries');
        expect(files).toHaveLength(2);
        for (const f of files) expect(f.content).toContain('STUB SUMMARY');
    });
});
