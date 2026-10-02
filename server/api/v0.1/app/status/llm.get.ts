import { systemMetrics, updateSystemMetrics, parseMetricsType } from '#server/utils/telemetry/system';
import { db } from "hub:db";
import { accounts } from "hub:db:schema";
import { eq } from "drizzle-orm";

defineRouteMeta({
  openAPI: {
    tags: ['System Status'],
    description: 'Get current LLM system metrics and service URLs.',
    responses: {
      200: {
        description: 'Success response with metrics and service URLs'
      }
    }
  }
});

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event);
  let userId = session?.user?.id || (session?.user as any)?.uid;
  const userIdent = session?.user?.user || session?.user?.email;

  if (!userId) {
    try {
      userId = await resolveServiceContext(event);
    } catch (e) {}
  }

  let cronActive = 1;
  try {
    let userAcc = null;
    if (userId) {
      userAcc = await db
        .select({ cron_active: accounts.cron_active })
        .from(accounts)
        .where(eq(accounts.id, userId))
        .get();
    }
    if (!userAcc && userIdent) {
      userAcc = await db
        .select({ cron_active: accounts.cron_active })
        .from(accounts)
        .where(eq(accounts.user, userIdent))
        .get();
    }
    if (userAcc && userAcc.cron_active !== undefined && userAcc.cron_active !== null) {
      cronActive = userAcc.cron_active;
    } else if (session?.user?.cron_active !== undefined) {
      cronActive = session.user.cron_active;
    }
  } catch (e) {}

  // If metrics haven't been loaded yet or are 0, trigger an immediate poll
  if (systemMetrics.activeHardwareVram === 0) {
    await updateSystemMetrics().catch(() => {});
  }

  return {
    ...systemMetrics.getMetrics(),
    cron_active: cronActive,
    llm_url: process.env.LLM_BASE_URL || '',
    tts_url: process.env.TTS_BASE_URL || '',
    apprise_url: process.env.APPRISE_URL || '',
    llm_model: process.env.LLM_MODEL || '',
    metrics_type: parseMetricsType(process.env.LLM_METRICS_TYPE)
  };
});
