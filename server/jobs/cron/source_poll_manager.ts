// Source poll manager: the scheduler for sources, and only for them. It gets one tick per minute from the real cron
// (server/cron/source_poll_manager.ts) and keeps all scheduling state in memory: when each source last polled and
// last pruned. After a restart every pollable source polls on the next tick and every source prunes; missed runs
// are not made up. Generic over source types: it knows nothing about IMAP or automations.
import { db } from 'hub:db';
import { sources } from '#server/db/schema';
import { emitTelemetryEvent, EventScope, EventLevel } from '#bs/utils/telemetry/event';
import { createSourceInstance, type BaseSource } from '#server/jobs/sources';
import { limits } from '#shared/limits';

const pruneEveryMs = () => limits.sources.prune_every_hours * 60 * 60 * 1000;

interface Entry {
    instance: BaseSource;
    lastPoll: number;                       // ms; 0 = not yet
    lastPrune: number;
}

const entries = new Map<string, Entry>();

const report = (instance: BaseSource, step: string, err: any) => emitTelemetryEvent({
    scope: EventScope.SYSTEM,
    level: EventLevel.ERROR,
    category: 'source',
    message: `${step} of source "${instance.name}" failed: ${err?.message || err}`,
    metadata: { sourceId: instance.id },
});

export const sourcePollManager = {
    /** Boot: an instance for every source record. */
    async start() {
        entries.clear();
        for (const row of await db.select().from(sources)) {
            const instance = createSourceInstance(row);
            if (instance) sourcePollManager.register(instance);
        }
    },

    /** Called on boot and by the sources service on create / update (a new instance replaces the old one). */
    register(instance: BaseSource) {
        const known = entries.get(instance.id);
        // After a restart the schedule continues from the last successful poll (no wave of polls)
        const lastPoll = known?.lastPoll ?? instance.record.last_successful_poll?.getTime() ?? 0;
        entries.set(instance.id, { instance, lastPoll, lastPrune: known?.lastPrune ?? 0 });
    },

    unregister(id: string) {
        entries.delete(id);
    },

    /** Every minute: poll the pollable sources whose interval has passed, prune every source each limits.sources.prune_every_hours (default daily). */
    async tick(now = Date.now()) {
        for (const entry of entries.values()) {
            const { instance } = entry;
            if (instance.definition.pollable && now - entry.lastPoll >= instance.pollSeconds * 1000) {
                entry.lastPoll = now;
                try {
                    await instance.runSubscribed();
                } catch (err) {
                    await report(instance, 'Poll', err);
                }
            }
            if (now - entry.lastPrune >= pruneEveryMs()) {
                entry.lastPrune = now;
                try {
                    const deleted = await instance.prune();
                    if (deleted > 0) {
                        await emitTelemetryEvent({
                            scope: EventScope.SYSTEM, level: EventLevel.INFO, category: 'source',
                            message: `Source "${instance.name}" pruned ${deleted} item(s)`,
                            metadata: { sourceId: instance.id, limits: instance.pruneLimits },
                        });
                    }
                } catch (err) {
                    await report(instance, 'Pruning', err);
                }
            }
        }
    },
};
