import { setSourceHooks } from '#server/jobs/sources';
import { runSource, subscribedKeys } from '#server/jobs/automations';
import { sourcePollManager } from '#server/jobs/cron/source_poll_manager';

// Boot: connect the source layer to the automation engine, then give the source poll manager every source.
export default defineNitroPlugin(async () => {
  setSourceHooks({ run: runSource, subscribedKeys });
  try {
    await sourcePollManager.start();
  } catch (err) {
    // A fresh database without the sources table must not stop the server; the next restart retries.
    console.error('[sources] Source poll manager start failed:', err);
  }
});
