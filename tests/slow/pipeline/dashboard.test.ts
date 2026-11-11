// Dashboard readouts (/status/activity, /status/system) move when jobs run: queued staging runs on the stub LLM,
// whose markers make a request fail, time out or come back cut off (tests/helpers/stub_services.ts).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
    adminClient, createLocalChannel, deleteAllAutomations, fixture, importFixtureEmails, stagingSource, waitForEvent, type TestClient,
} from '../../helpers/client';
import { CUT_LLM, FAIL_LLM, SLOW_LLM } from '../../helpers/stub_services';

const readouts = async (client: TestClient) => ({
    ...(await client.ok('GET', '/api/v0.1/app/status/system')),
    ...(await client.ok('GET', '/api/v0.1/app/status/activity')),
});

describe('dashboard readouts', () => {
    let client: TestClient;
    let staging: any;
    let channel: any;
    const staged = fixture<any[]>('emails.json').filter((e) => e.staging_item).length;

    beforeAll(async () => {
        client = await adminClient();
        await deleteAllAutomations(client);
        await importFixtureEmails(client);
        staging = await stagingSource(client);
        channel = await createLocalChannel(client, 'Dashboard local');
    });
    afterAll(async () => { await deleteAllAutomations(client); });

    /**
     * Queues a staging run of one automation (a summary of each staged email, then a notification), reads the
     * readouts while the job is queued or running, and returns them before, during and after. No filter prompt:
     * the summaries are the only LLM requests, so a rate can only move towards the marker's kind.
     */
    let runs = 0;
    const run = async (prompt: string) => {
        const name = `Dashboard ${++runs}: ${prompt}`;   // names are unique per user
        const automation = await client.ok('POST', '/api/v0.1/app/automation', {
            name, source_key: staging.id, active: 1,
            tasks: [
                { id: 't_sum', type: 'create_artifact', version: 1, label: 'Summary', inputs: ['source'], aggregate: false, args: { prompt } },
                { id: 't_note', type: 'notification', version: 1, label: 'Note', inputs: ['t_sum'], aggregate: false, args: { destination: channel.id, keep_threadid: false } },
            ],
        });
        const before = await readouts(client);
        await client.ok('POST', `/api/v0.1/app/sources/${staging.id}/run`);
        const during = await readouts(client);
        await waitForEvent(client, (e) => e.metadata?.id === automation.id
            && ['events.user.info_automation_end', 'events.user.warn_automation_failed'].includes(e.message));
        let after = await readouts(client);
        for (let i = 0; i < 40 && after.user_tasks_in_queue > 0; i++) {   // the job still stores what it fetched
            await new Promise((r) => setTimeout(r, 250));
            after = await readouts(client);
        }
        await client.ok('PATCH', `/api/v0.1/app/automation/${automation.id}`, { active: 0 });   // later runs are the next test's
        return { before, during, after, automation };
    };

    it('counts ingested and stored emails', async () => {
        const before = await readouts(client);
        await client.ok('POST', '/api/v0.1/app/email/import', [{
            messageId: '<dashboard-ingest@test>', subject: 'Dashboard ingest', from: 'a@example.com', to: 'b@example.com',
            date: '2026-10-08T10:00:00.000Z', text: 'Counted once.', html: '', staging_item: 0,
        }]);
        const after = await readouts(client);
        expect(after.ingested_mails).toBe(before.ingested_mails + 1);
        expect(after.source_items).toBe(before.source_items + 1);   // counted in the database
    });

    it('shows the queued job, the tasks, the artifacts and the generation speed', async () => {
        // A slow answer keeps the job in the queue long enough to see it
        const { before, during, after } = await run(`Sum up. ${SLOW_LLM}`);
        expect(during.user_tasks_in_queue).toBe(before.user_tasks_in_queue + 1);
        expect(during.tasks_qty).toBe(before.tasks_qty + 1);
        expect(after.user_tasks_in_queue).toBe(before.user_tasks_in_queue);
        expect(after.tasks_qty).toBe(before.tasks_qty);
        expect(after.timeout_rate).toBeGreaterThan(before.timeout_rate);
        expect(after.failed_rate).toBeGreaterThan(before.failed_rate);
        expect(after.problem_rate).toBeGreaterThan(before.problem_rate);

        const ok = await run('Sum up.');
        expect(ok.after.tasks_run).toBe(ok.before.tasks_run + 2 * staged);           // summaries + notifications
        expect(ok.after.artifacts_created).toBe(ok.before.artifacts_created + staged);   // the summaries
        expect(ok.after.artifacts_stored).toBe(ok.before.artifacts_stored + staged);     // the local channel's files
        expect(ok.after.total_requests).toBeGreaterThan(ok.before.total_requests);
        expect(ok.after.recent_tok_per_sec).not.toEqual(ok.before.recent_tok_per_sec);
        expect(ok.after.generation_speed).toBeGreaterThan(0);
        // Stub usage per answer: 10 prompt tokens (4 cached), 5 completion tokens
        // (one summary request per staged email, no filter prompt)
        expect(ok.after.tokens_in).toBe(ok.before.tokens_in + 10 * staged);
        expect(ok.after.tokens_out).toBe(ok.before.tokens_out + 5 * staged);
        expect(ok.after.avg_prompt_tokens).toBe(10);
        expect(ok.after.cache_hit_rate).toBe(0.4);
        expect(ok.after.avg_response_sec).toBeGreaterThan(0);
        expect(ok.after.llm_waiting).toBe(0);   // nothing left waiting once the run is over
    });

    it('keeps the last run and the last problem on the automation', async () => {
        const ok = await run('Sum up.');
        const okRow = await client.ok('GET', `/api/v0.1/app/automation/${ok.automation.id}`);
        expect(okRow.last_run_at).toBeTruthy();
        expect(okRow.last_issue_at).toBeNull();
        // The source records when it was last read without error
        const source = await client.ok('GET', `/api/v0.1/app/sources/${staging.id}`);
        expect(source.last_successful_poll).toBeTruthy();

        const failed = await run(`Sum up. ${FAIL_LLM}`);
        const failedRow = await client.ok('GET', `/api/v0.1/app/automation/${failed.automation.id}`);
        expect(failedRow.last_run_at).toBeTruthy();
        expect(failedRow.last_issue_level).toBe('warn');
        expect(failedRow.last_issue_at).toBeTruthy();
    });

    // The bell leaves automation events out (app config); the dashboard reads them by category
    it('files events by category', async () => {
        const search = async (query: string) => (await client.ok<any[]>('GET', `/api/user/event/search?limit=200&${query}`));
        const automationEvents = await search('category=automation');
        expect(automationEvents.length).toBeGreaterThan(0);
        expect(automationEvents.every((e: any) => e.category === 'automation')).toBe(true);
        expect(automationEvents.some((e: any) => e.message === 'events.user.warn_automation_failed' && e.metadata?.id)).toBe(true);
        const others = await search('excludeCategory=automation');
        expect(others.some((e: any) => e.category === 'automation')).toBe(false);
    });

    it('shows LLM errors and cut-off answers', async () => {
        const failed = await run(`Sum up. ${FAIL_LLM}`);
        expect(failed.after.error_rate).toBeGreaterThan(failed.before.error_rate);
        expect(failed.after.failed_rate).toBeGreaterThan(failed.before.failed_rate);
        expect(failed.after.problem_rate).toBeGreaterThan(failed.before.problem_rate);

        const cut = await run(`Sum up. ${CUT_LLM}`);
        expect(cut.after.truncation_rate).toBeGreaterThan(cut.before.truncation_rate);
        expect(cut.after.problem_rate).toBeGreaterThan(cut.before.problem_rate);
        // The answer is kept, and the log says it was cut off
        const event = await waitForEvent(client, (e) => e.message === 'events.user.warn_llm_answer_cut' && e.metadata?.task === 'Summary');
        expect(event.metadata.name).toBe(cut.automation.name);
        expect(event.metadata.id).toBe(cut.automation.id);
    });

    it('shows the cron switch and whether the services can be reached', async () => {
        const me = await client.ok('GET', '/api/user/account');
        const id = (Array.isArray(me) ? me[0] : me).id;
        await client.ok('PATCH', `/api/user/account/${id}`, { cron_active: 0 });
        expect((await readouts(client)).cron_active).toBe(0);
        await client.ok('PATCH', `/api/user/account/${id}`, { cron_active: 1 });
        const now = await readouts(client);
        expect(now.cron_active).toBe(1);
        expect(now.healthy).toBe(true);   // the stub lists LLM_MODEL under /v1/models
        expect(now.tts_reachable).toBe(true);        // the stub answers
        expect(now.apprise_reachable).toBeNull();    // APPRISE_URL is empty on the test server
    });
});
