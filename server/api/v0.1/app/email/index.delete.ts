import { getService } from '#server/services/app/email';

defineRouteMeta({
  openAPI: {
    tags: ['App Email'],
    description: 'Delete multiple emails by IDs for the authenticated user.',
    responses: {
      200: {
        description: 'Success response'
      },
      400: {
        description: 'Missing IDs'
      },
      403: {
        description: 'Forbidden'
      }
    }
  }
});

export default defineEventHandler(async (event) => {
  const body = await readBody(event).catch(() => ({}));
  const ids: string[] = Array.isArray(body?.ids) ? body.ids : (Array.isArray(body?.files) ? body.files : []);

  if (!ids || ids.length === 0) {
    throw createError({
      statusCode: 400,
      statusMessage: 'error email.missing_ids',
    });
  }

  const service = await getService(event);
  const deleted = await service.deleteMany(ids);

  return {
    deleted: Array.isArray(deleted) ? deleted.length : ids.length,
    statusMessage: 'success email.delete_many.success',
  };
});
