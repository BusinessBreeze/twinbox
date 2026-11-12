import { defineCronHandler } from '#nuxt/cron';
import { updateSystemMetrics } from '#server/utils/telemetry/system';
import { notifyAll } from '#bs/utils/user_stream';

export default defineCronHandler(() => '*/30 * * * * *', async () => {
  try {
    await updateSystemMetrics();
    notifyAll('system');                            // live updates: the dashboard's system figures (same for all users)
  } catch (err: any) {
    console.error('[System Metrics Cron] Failed to collect metrics:', err);
  }
});
