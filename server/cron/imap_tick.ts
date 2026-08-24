import { defineCronHandler } from '#nuxt/cron';
import { enqueueDueAutomations } from '#server/jobs/automations/producer';
import { emitTelemetryEvent, EventScope, EventLevel } from '#bs/utils/telemetry/event';

export default defineCronHandler(() => '0 * * * * *', async () => {
  try {
    const count = await enqueueDueAutomations();
    if (count > 0) {
      await emitTelemetryEvent({
        scope: EventScope.SYSTEM,
        level: EventLevel.DEBUG,
        category: 'cron',
        message: `Cron tick enqueued ${count} due automation(s).`
      });
    }
  } catch (err: any) {
    await emitTelemetryEvent({
      scope: EventScope.SYSTEM,
      level: EventLevel.ERROR,
      category: 'cron',
      message: `Cron automation tick failed: ${err?.message || String(err)}`
    });
  }
});
