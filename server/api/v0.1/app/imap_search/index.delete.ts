import { getService } from '#server/services/app/imap_search';

defineRouteMeta({
  openAPI: {
    tags: ['App IMAP Search'],
    description: 'Delete multiple IMAP searches by IDs.',
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
  const ids: string[] = Array.isArray(body?.ids) ? body.ids : [];

  if (!ids || ids.length === 0) {
    throw createError({
      statusCode: 400,
      statusMessage: 'error imap_search.missing_ids',
    });
  }

  const service = await getService(event);
  const deleted = await service.deleteMany(ids);

  return {
    deleted: Array.isArray(deleted) ? deleted.length : ids.length,
    statusMessage: 'success imap_search.delete_many.success',
  };
});
