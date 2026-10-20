import { getFolderList } from '#server/utils/imap/getFolderList';
import { emitTelemetryEvent, EventScope, EventLevel } from '#bs/utils/telemetry/event';

defineRouteMeta({
  openAPI: {
    tags: ['App Connection IMAP'],
    description: 'Test an IMAP connection without saving, emitting user telemetry events.',
    responses: {
      200: {
        description: 'Test result: ok with folder count or error message'
      },
      403: {
        description: 'Forbidden'
      }
    }
  }
});

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event);
  if (!session?.user) {
    throw createError({
      statusCode: 403,
      statusMessage: 'error auth.not_authorized'
    });
  }

  const userId = session.user.id || (session.user as any).uid || (session.user as any)._id;
  const body = await readBody(event);
  const connName = body?.name || body?.host || 'IMAP';

  try {
    const folders = await getFolderList(body);
    const count = folders?.length || 0;
    const message = `Connected, ${count} folders`;

    if (userId) {
      await emitTelemetryEvent({
        scope: EventScope.USER,
        level: EventLevel.INFO,
        category: 'connections_imap',
        message: 'events.user.info_imap_test_success',
        owner_id: userId,
        metadata: { name: connName, message }
      });
    }

    return {
      ok: true,
      message
    };
  } catch (err: any) {
    const message = err?.message || 'Connection failed';

    if (userId) {
      await emitTelemetryEvent({
        scope: EventScope.USER,
        level: EventLevel.ERROR,
        category: 'connections_imap',
        message: 'events.user.error_imap_test_fail',
        owner_id: userId,
        metadata: { name: connName, message }
      });
    }

    return {
      ok: false,
      message
    };
  }
});
