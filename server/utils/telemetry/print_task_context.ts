import { emitTelemetryEvent, EventScope, EventLevel } from '#bs/utils/telemetry/event';

/**
 * Recursively formats a context object by preserving all keys while truncating
 * any string value under the key 'content' to a maximum of 20 characters followed by '...'.
 */
const formatContextContent = (data: any): any => {
  if (data === null || data === undefined) {
    return data;
  }

  if (Array.isArray(data)) {
    return data.map(formatContextContent);
  }

  if (typeof data === 'object') {
    const formatted: Record<string, any> = {};
    for (const [key, value] of Object.entries(data)) {
      if (key === 'content' && typeof value === 'string') {
        formatted[key] = value.length > 20 ? `${value.slice(0, 20)}...` : value;
      } else if (typeof value === 'object' && value !== null) {
        formatted[key] = formatContextContent(value);
      } else {
        formatted[key] = value;
      }
    }
    return formatted;
  }

  return data;
};

/**
 * Formats task context data (truncating 'content' fields to 20 chars) and emits a SYSTEM DEBUG telemetry event.
 *
 * @param taskName Name of the task or step
 * @param context Task execution context object
 */
export const printTaskContext = async (taskName: string, context: Record<string, any>): Promise<void> => {
  const formattedContext = formatContextContent(context);
  const prettyContext = JSON.stringify(formattedContext, null, 2);

  await emitTelemetryEvent({
    scope: EventScope.SYSTEM,
    level: EventLevel.DEBUG,
    category: 'automation',
    message: `Task context snapshot for "${taskName}":\n${prettyContext}`,
    metadata: {
      task_name: taskName,
      context: formattedContext
    }
  });
};
