// Failure model: no retries, one grouped warning per automation with links to the affected emails.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { adminClient, deleteAllAutomations, importFixtureEmails, stagingSource, waitForEvent, type TestClient } from '../../helpers/client';
import { FAIL_TTS } from '../../helpers/stub_services';

const failing = {
    messageId: '<tts-fail@example.com>', from: 'robot@example.com', to: 'inbox@example.com', subject: 'Breaks the TTS',
    date: '2026-10-07T10:00:00.000Z', text: `This text contains ${FAIL_TTS} so the stub TTS answers 500.`, html: '', staging_item: 1,
};

describe('failures', () => {
    let client: TestClient;
    let staging: any;

    beforeAll(async () => {
        client = await adminClient();
        await deleteAllAutomations(client);
        await importFixtureEmails(client);
        await client.ok('POST', '/api/v0.1/app/email/import', [failing]);
        staging = await stagingSource(client);
    });
    afterAll(async () => {
        await deleteAllAutomations(client);
        const [email] = await client.ok<any[]>('GET', `/api/v0.1/app/email?message_id=${encodeURIComponent(failing.messageId)}`);
        await client.ok('PATCH', '/api/v0.1/app/email/set_staging', { ids: [email.id], staging_item: 0 });   // other files don't see it
    });

    it('reports a failed task once, with links to the emails', async () => {
        const automation = await client.ok('POST', '/api/v0.1/app/automation', {
            name: 'Speech', source_key: staging.id, options: { add_source_links: false },
            tasks: [{ id: 't_tts', type: 'chatterbox', version: 1, label: 'Speech', inputs: ['source'], aggregate: false, args: {} }],
        });
        await client.ok('POST', `/api/v0.1/app/sources/${staging.id}/run`);

        const event = await waitForEvent(client, (e) => e.message === 'events.user.warn_automation_failed' && e.metadata.id === automation.id);
        expect(event.metadata.count).toBeGreaterThan(0);
        expect(event.metadata.links).toHaveLength(event.metadata.count);
        // Links are given even without "Add source links": the event is for the user, not the notification
        const link = event.metadata.links.find((l: any) => l.label === 'Breaks the TTS');
        expect(link.url).toContain(`/repositories?message_id=${encodeURIComponent(failing.messageId)}`);
    });
});
