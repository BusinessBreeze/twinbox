// New automation from the staged emails: drafted by the LLM (stub: an "AI Act" filter), saved inactive on the staging
// source, tested over the staged emails with deliveries written to the local artifacts.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
    adminClient, artifacts, createLocalChannel, deleteAllAutomations, fixture, importFixtureEmails, stagingSource, userEvents, type TestClient,
} from '../../helpers/client';

describe('automation drafts', () => {
    let client: TestClient;
    let staging: any;
    const staged = fixture<any[]>('emails.json').filter((e) => e.staging_item).length;

    beforeAll(async () => {
        client = await adminClient();
        await deleteAllAutomations(client);
        await importFixtureEmails(client);
        staging = await stagingSource(client);
    });
    afterAll(async () => { await deleteAllAutomations(client); });

    it('suggests a filter prompt and a task prompt without saving anything', async () => {
        const filter = await client.ok('POST', '/api/v0.1/app/automation/draft', { target: 'filter_prompt', current: '' });
        expect(filter.text).toBe('Only emails that mention "AI Act"');
        const task = await client.ok('POST', '/api/v0.1/app/automation/draft', { target: 'task_prompt', current: 'summary' });
        expect(task.text).toBe('Summarize in 3 bullet points.');
        expect(await client.ok<any[]>('GET', '/api/v0.1/app/automation')).toEqual([]);
    });

    it('needs one of the user\'s channels', async () => {
        const res = await client.post('/api/v0.1/app/automation/draft', { intent: 'x', channel_id: 'nope' });
        expect(res.status).toBe(400);
        expect(res.body.statusMessage).toBe('error automations.draft.channel');
    });

    it('filters by theme or not at all, nothing else', async () => {
        const res = await client.post('/api/v0.1/app/automation/draft', { intent: 'x', match: 'specific', channel_id: 'nope' });
        expect(res.status).toBe(422);
        expect(res.body.statusMessage).toBe('error automation_draft.rules.match.invalid');
        expect(res.body.data.field).toBe('match');

        // No AI filter: the draft gets no filter prompt (every staged email passes)
        const channel = await createLocalChannel(client, 'No filter target');
        const open = await client.ok('POST', '/api/v0.1/app/automation/draft', { intent: 'Summarize', match: 'none', channel_id: channel.id });
        expect(open.filter_prompt).toBe('');
        const result = await client.ok('POST', `/api/v0.1/app/automation/${open.id}/test`, {});
        expect(result.passed).toBe(result.total);
        await client.ok('DELETE', `/api/v0.1/app/automation/${open.id}`);
        await client.ok('DELETE', `/api/user/notification/${channel.id}`);
    });

    it('saves an inactive draft and test-runs it into the local artifacts, not the channel', async () => {
        const channel = await createLocalChannel(client, 'Draft target');
        const automation = await client.ok('POST', '/api/v0.1/app/automation/draft', {
            intent: 'Summarize the AI Act news', match: 'theme', channel_id: channel.id,
        });
        expect(automation.name).toBe('Draft: AI Act digest');
        expect(automation.active).toBe(0);
        expect(automation.source_key).toBe(staging.id);
        expect(automation.filter_prompt).toBe('Only emails that mention "AI Act"');
        expect(automation.tasks.map((task: any) => task.type)).toEqual(['create_artifact', 'notification']);
        expect(automation.tasks[0].args.prompt).toBe('Summarize in 3 bullet points.');

        // Without its channel a real delivery would fail; the test run writes to the artifacts instead
        await client.ok('DELETE', `/api/user/notification/${channel.id}`);
        const result = await client.ok('POST', `/api/v0.1/app/automation/${automation.id}/test`, {});
        expect(result.total).toBe(staged);
        expect(result.passed).toBe(2);              // the English and the German AI Act newsletter
        expect(result.aborted).toBeNull();
        expect(result.files).toHaveLength(2);
        const written = (await artifacts()).map((a) => a.name);
        for (const file of result.files) expect(written).toContain(file.filename);
        expect((await userEvents(client)).some((e) => e.message === 'events.user.warn_automation_delivery_failed')).toBe(false);
    });
});
