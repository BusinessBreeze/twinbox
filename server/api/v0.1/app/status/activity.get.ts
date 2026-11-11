import { db } from 'hub:db';
import { count, eq } from 'drizzle-orm';
import { emails } from '#server/db/schema';
import { userMetrics } from '#server/utils/telemetry/user';
import { artifactService } from '#server/services/app/artifacts';

defineRouteMeta({
  openAPI: {
    tags: ['System Status'],
    description: 'Activity of the authenticated user: jobs in the queue, stored source items (emails) and artifacts (counted on each request), and counters since the last restart (mails, tasks, artifacts created).',
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
  const session = await getAuthSession(event);
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

  const [items] = await db.select({ n: count() }).from(emails).where(eq(emails.owner_id, userId));
  return {
    ...userMetrics.getMetrics(userId),
    source_items: items?.n ?? 0,
    artifacts_stored: await artifactService.count(userId),
  };
});
