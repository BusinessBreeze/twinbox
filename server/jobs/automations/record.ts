// What the dashboard cards show, kept on the automation itself: events are deleted (read ones nightly, all after
// the retention). Never throws: a run must not fail over its own bookkeeping.
import { eq } from 'drizzle-orm';
import { db, automations, sources } from './deps';

/** The source was read without error (dashboard "last:" / "next:", and the poll schedule after a restart). */
export const recordPoll = async (sourceId: string) => {
    await db.update(sources).set({ last_successful_poll: new Date() }).where(eq(sources.id, sourceId)).catch(() => {});
};

/** The automation started a run. */
export const recordRun = async (automationId?: string) => {
    if (!automationId) return;
    await db.update(automations).set({ last_run_at: new Date() }).where(eq(automations.id, automationId)).catch(() => {});
};

/** The automation had a problem (it is also reported as a user event). */
export const recordIssue = async (automationId: string | undefined, level: 'warn' | 'error') => {
    if (!automationId) return;
    await db.update(automations).set({ last_issue_at: new Date(), last_issue_level: level })
        .where(eq(automations.id, automationId)).catch(() => {});
};
