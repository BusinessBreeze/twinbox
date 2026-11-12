// What the dashboard cards show, kept on the automation itself: events are deleted (read ones nightly, all after
// the retention). Never throws: a run must not fail over its own bookkeeping.
import { eq } from 'drizzle-orm';
import { db, automations, sources, notifyUser } from './deps';

/** The source was read without error (dashboard "last:" / "next:", and the poll schedule after a restart). */
export const recordPoll = async (sourceId: string) => {
    const rows = await db.update(sources).set({ last_successful_poll: new Date() }).where(eq(sources.id, sourceId))
        .returning({ owner_id: sources.owner_id }).catch(() => []);
    notifyUser(rows[0]?.owner_id, 'sources');      // live updates: last / next poll
};

/** The automation started a run. */
export const recordRun = async (automationId?: string) => {
    if (!automationId) return;
    const rows = await db.update(automations).set({ last_run_at: new Date() }).where(eq(automations.id, automationId))
        .returning({ owner_id: automations.owner_id }).catch(() => []);
    notifyUser(rows[0]?.owner_id, 'automations');  // live updates: last run
};

/** The automation had a problem (it is also reported as a user event). */
export const recordIssue = async (automationId: string | undefined, level: 'warn' | 'error') => {
    if (!automationId) return;
    const rows = await db.update(automations).set({ last_issue_at: new Date(), last_issue_level: level })
        .where(eq(automations.id, automationId)).returning({ owner_id: automations.owner_id }).catch(() => []);
    notifyUser(rows[0]?.owner_id, 'automations');  // live updates: issue state
};
