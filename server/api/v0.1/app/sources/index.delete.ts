import { getService } from '#server/services/app/sources';

defineRouteMeta({
  openAPI: {
    tags: ['App Sources'],
    description: 'Delete several sources.',
    responses: {
      200: { description: 'Success response' }
    }
  }
});

export default defineEventHandler(async (event) => {
  const body = await readBody(event).catch(() => ({}));
  const ids: string[] = Array.isArray(body?.ids) ? body.ids : [];
  if (ids.length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'error sources.missing_ids' });
  }
  const service = await getService(event);
  const deleted = await service.deleteMany(ids);
  return {
    deleted: deleted.length,
    statusMessage: 'success sources.delete_many.success',
  };
});
