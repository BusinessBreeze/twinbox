import { getService } from '#server/services/app/connections_imap';

defineRouteMeta({
  openAPI: {
    tags: ['App Connection IMAP'],
    description: 'Delete multiple IMAP connections by IDs.',
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
      statusMessage: 'error connections_imap.missing_ids',
    });
  }

  const service = await getService(event);
  const deleted = await service.deleteMany(ids);

  return {
    deleted: Array.isArray(deleted) ? deleted.length : ids.length,
    statusMessage: 'success connections_imap.delete_many.success',
  };
});
