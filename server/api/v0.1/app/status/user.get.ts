import { userMetrics } from '#server/utils/telemetry/user';

defineRouteMeta({
  openAPI: {
    tags: ['System Status'],
    description: 'Get current activity and queue metrics for the authenticated user.',
    responses: {
      200: {
        description: 'Success response with user metrics'
      },
      401: {
        description: 'Unauthorized'
      }
    }
  }
});

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event);
  let userId = session?.user?.id || (session?.user as any)?.uid;

  if (!userId && typeof resolveServiceContext === 'function') {
    userId = await resolveServiceContext(event).catch(() => '');
  }

  if (!userId) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Unauthorized'
    });
  }

  return userMetrics.getMetrics(userId);
});
