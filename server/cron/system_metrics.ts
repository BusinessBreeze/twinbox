import { defineCronHandler } from '#nuxt/cron';
import { updateSystemMetrics } from '#server/utils/telemetry/system';

export default defineCronHandler(() => '*/30 * * * * *', async () => {
  try {
    await updateSystemMetrics();
  } catch (err: any) {
    console.error('[System Metrics Cron] Failed to collect metrics:', err);
  }
});
