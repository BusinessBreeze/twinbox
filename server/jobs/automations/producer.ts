import { getDueAutomations } from '#server/db/operations/automations/automations';
import { automationQueue } from '#server/queue/index';
import { processAutomationItem } from './worker';
import { emitTelemetryEvent, EventScope, EventLevel } from '#bs/utils/telemetry/event';

/**
 * Enqueues a single automation job.
 * @param idOrAutomation Automation ID string OR non-persisted automation object (for "try" / trial run)
 * @param ephemeralConfig Optional config if passing non-persisted object directly
 */
export const enqueueAutomation = async (
  idOrAutomation: string | Record<string, any>,
  ephemeralConfig?: Record<string, any>
): Promise<{ enqueued: boolean; reason?: string }> => {
  let item: any;
  let isEphemeral = false;

  if (typeof idOrAutomation === 'string') {
    // ID passed: fetch item if needed or construct job ID
    // For single item lookup, if an item object was passed in ephemeralConfig use that,
    // otherwise if only ID string was passed, we wrap it.
    item = ephemeralConfig || { automation: { id: idOrAutomation, name: `Automation ${idOrAutomation}` } };
  } else if (typeof idOrAutomation === 'object' && idOrAutomation !== null) {
    // Non-persisted object passed directly to "try"
    isEphemeral = true;
    const rawObj = idOrAutomation;
    item = {
      automation: rawObj.automation || rawObj,
      connection: rawObj.connection,
      search: rawObj.search,
      llmFilter: rawObj.llmFilter
    };
  }

  const automationId = item.automation?.id || `ephemeral_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
  const automationName = item.automation?.name || (isEphemeral ? 'Trial Run Automation' : automationId);
  const ownerId = item.automation?.owner_id;

  const result = await automationQueue.enqueue({
    id: automationId,
    name: automationName,
    ownerId,
    isEphemeral,
    task: async () => {
      await processAutomationItem(item);
    }
  });

  if (!result.enqueued) {
    await emitTelemetryEvent({
      scope: EventScope.SYSTEM,
      level: EventLevel.WARN,
      category: 'automation',
      message: `Enqueue skipped for automation ${automationName}: ${result.reason}`,
      metadata: { id: automationId, name: automationName, reason: result.reason }
    });
  } else {
    await emitTelemetryEvent({
      scope: EventScope.SYSTEM,
      level: EventLevel.DEBUG,
      category: 'automation',
      message: `Successfully enqueued automation ${automationName}`,
      metadata: { id: automationId, isEphemeral }
    });
  }

  return result;
};

/**
 * Scans DB for due automations and enqueues them into the queue.
 */
export const enqueueDueAutomations = async (): Promise<number> => {
  const automations = await getDueAutomations();
  let enqueuedCount = 0;

  for (const item of automations) {
    const res = await enqueueAutomation(item.automation.id, item);
    if (res.enqueued) {
      enqueuedCount++;
    }
  }

  return enqueuedCount;
};
