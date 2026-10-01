import { systemMetrics, updateSystemMetrics, parseMetricsType } from '#server/utils/telemetry/system';

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
  const cronActive = session?.user?.cron_active ?? 1;

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
