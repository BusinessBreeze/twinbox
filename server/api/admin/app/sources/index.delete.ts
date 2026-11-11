import { getService } from '#server/services/app/sources';

defineRouteMeta({
  openAPI: {
    tags: ['App Sources'],
    description: 'Delete several sources (admin).',
    responses: {
      200: { description: 'Success response' },
      403: { description: 'Forbidden - Missing required permissions' }
    }
  }
});

export default defineEventHandler(async (event) => {
  await checkRoutePermissions(event, ['sources.crud.delete']);
  const body = await readBody(event).catch(() => ({}));
  const ids: string[] = Array.isArray(body?.ids) ? body.ids : [];
  if (ids.length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'error sources.missing_ids' });
  }
  const service = await getService();
  const deleted = await service.deleteMany(ids);
  return {
    deleted: deleted.length,
    statusMessage: 'success sources.delete_many.success',
  };
});
