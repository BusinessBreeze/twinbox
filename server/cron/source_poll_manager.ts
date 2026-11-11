// The real cron's only job for sources: one tick per minute to the source poll manager.
import { defineCronHandler } from '#nuxt/cron';
import { sourcePollManager } from '#server/jobs/cron/source_poll_manager';

export default defineCronHandler(() => '0 * * * * *', () => sourcePollManager.tick());
