// One source run: fetch → filter per subscribed automation → afterFilter → tasks → complete (docs/specs/SPEC_sources.md, section 6).
// Failure model: visible failure, no retries. The run always completes (emails stored, checkpoints advanced); every
// failure becomes one grouped user event per automation with links to the affected emails.
import { and, eq, inArray, ne, or, isNull } from 'drizzle-orm';
import { db, automations, accounts, emitTelemetryEvent, EventScope, EventLevel } from './deps';
import { filterItems } from './filter';
import { recordIssue, recordPoll, recordRun } from './record';
import { runTasks, type TaskInstance, type TaskItem } from './tasks';
import type { AutomationOptions } from '#shared/types/automation_tasks';
import type { BaseSource } from '../sources';

interface Subscription {
    automation: any;
    options: AutomationOptions;
    items: TaskItem[];          // the items of this automation's key (itemUrl dropped unless "Add source links")
    passed: TaskItem[];         // after the filter
}

/** Active automations subscribed to these keys of a source, from accounts that aren't paused. */
const subscribedAutomations = async (sourceId: string, keys?: string[]) => {
    const rows = await db.select({ automation: automations })
        .from(automations)
        .leftJoin(accounts, eq(automations.owner_id, accounts.id))
        .where(and(
            eq(automations.source_id, sourceId),
            or(isNull(automations.active), ne(automations.active, 0)),
            or(isNull(accounts.cron_active), ne(accounts.cron_active, 0)),
            ...(keys ? [inArray(automations.source_key, keys)] : []),
        ));
    return rows.map((r) => r.automation);
};

export const subscribedKeys = async (sourceId: string): Promise<string[]> =>
    [...new Set((await subscribedAutomations(sourceId)).map((a) => a.source_key).filter(Boolean) as string[])];

const failureEvent = async (automation: any, reason: string, refs: string[], urlByRef: Map<string, { label: string; url?: string }>) => {
    await recordIssue(automation.id, 'warn');
    await emitTelemetryEvent({
        scope: EventScope.USER,
        level: EventLevel.WARN,
        category: 'automation',
        message: 'events.user.warn_automation_failed',
        owner_id: automation.owner_id,
        metadata: {
            id: automation.id,
            name: automation.name,
            count: refs.length,
            reason: reason.slice(0, 300),
            links: refs.map((ref) => urlByRef.get(ref)).filter(Boolean),
        },
    });
};

export const runSource = async (source: BaseSource, keys: string[]) => {
    const subscribers = await subscribedAutomations(source.id, keys);
    if (subscribers.length === 0) return;
    // Keys nobody subscribes to (any more) are not fetched (their checkpoints stay where they are)
    const subscribed = keys.filter((key) => subscribers.some((a) => a.source_key === key));

    // 1. Fetch (no connection stays open afterwards). A source that can't be read is retried by the next poll.
    let fetched;
    try {
        fetched = await source.fetch(subscribed);
    } catch (err: any) {
        await emitTelemetryEvent({
            scope: EventScope.USER,
            level: EventLevel.WARN,
            category: 'source',
            message: 'events.user.warn_source_fetch_failed',
            owner_id: source.ownerId,
            metadata: { source: source.name, source_id: source.id, reason: String(err?.message || err).slice(0, 300) },
        });
        return;
    }
    await recordPoll(source.id);

    const urlByRef = new Map<string, { label: string; url?: string }>();
    for (const items of fetched.values()) {
        for (const item of items) urlByRef.set(item.sourceRefs[0]!, { label: item.label || item.sourceRefs[0]!, url: item.itemUrl });
    }

    // 2. Filter per automation (LLM, no IMAP session open).
    const subs: Subscription[] = [];
    for (const automation of subscribers) {
        const options: AutomationOptions = automation.options || {};
        const raw = fetched.get(automation.source_key || '') || [];
        if (raw.length === 0) continue;
        const items = options.add_source_links ? raw : raw.map((i) => ({ ...i, itemUrl: undefined }));
        try {
            subs.push({ automation, options, items, passed: await filterItems(options.filter_prompt ?? undefined, items) });
        } catch (err: any) {
            await failureEvent(automation, `Filter: ${err?.message || err}`, items.map((i) => i.sourceRefs[0]!), urlByRef);
        }
    }

    // 3. Right after the filter, one call for all automations: the source acts on its own options
    //    (IMAP: mark read / important in one short session). The engine doesn't interpret them.
    const results = subs.filter((sub) => sub.passed.length > 0)
        .map((sub) => ({ options: sub.options, refs: sub.passed.map((i) => i.sourceRefs[0]!) }));
    if (results.length > 0) {
        try {
            await source.afterFilter(results);
        } catch (err: any) {
            await emitTelemetryEvent({
                scope: EventScope.USER,
                level: EventLevel.WARN,
                category: 'source',
                message: 'events.user.warn_source_after_filter_failed',
                owner_id: source.ownerId,
                metadata: { source: source.name, source_id: source.id, reason: String(err?.message || err).slice(0, 300) },
            });
        }
    }

    // 4. Tasks per automation; failures are reported, never retried.
    for (const sub of subs) {
        if (sub.passed.length === 0) continue;
        const { automation } = sub;
        const startTime = Date.now();
        await recordRun(automation.id);
        await emitTelemetryEvent({
            scope: EventScope.USER, level: EventLevel.INFO, category: 'automation',
            message: 'events.user.info_automation_start', owner_id: automation.owner_id,
            metadata: { id: automation.id, name: automation.name },
        });

        const run = await runTasks({
            tasks: (automation.tasks || []) as TaskInstance[],
            source: sub.passed,
            ctx: { ownerId: automation.owner_id, automationId: automation.id, automationName: automation.name, lang: await accountLang(automation.owner_id) },
        });

        if (run.aborted) {
            const failed = run.tasks.find((t) => t.status === 'failed');
            await failureEvent(automation, `${failed?.label || 'Task'}: ${run.aborted.message}`, sub.passed.map((i) => i.sourceRefs[0]!), urlByRef);
            continue;
        }
        const errored = [...run.outcomes()].filter(([, outcome]) => outcome === 'error').map(([ref]) => ref);
        if (errored.length > 0) {
            const reasons = [...new Set(run.tasks.flatMap((t) => t.itemErrors.map((e) => e.error?.reason)).filter(Boolean))];
            await failureEvent(automation, reasons.join('; '), errored, urlByRef);
        }
        await emitTelemetryEvent({
            scope: EventScope.USER, level: EventLevel.INFO, category: 'automation',
            message: 'events.user.info_automation_end', owner_id: automation.owner_id,
            metadata: { id: automation.id, name: automation.name, durationMs: Date.now() - startTime },
        });
    }

    // 5. Complete: store everything fetched, advance checkpoints (always).
    try {
        await source.complete();
    } catch (err: any) {
        await emitTelemetryEvent({
            scope: EventScope.SYSTEM, level: EventLevel.ERROR, category: 'source',
            message: `Completing source "${source.name}" failed: ${err?.message || err}`,
            metadata: { sourceId: source.id },
        });
    }
};

const accountLang = async (ownerId: string) =>
    (await db.select({ lang: accounts.lang }).from(accounts).where(eq(accounts.id, ownerId)).get())?.lang || 'en';
