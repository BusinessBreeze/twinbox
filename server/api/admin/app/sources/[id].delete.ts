import { getService } from '#server/services/app/sources';

defineRouteMeta({
  openAPI: {
    tags: ['App Sources'],
    description: 'Delete a source (admin).',
    responses: {
      200: { description: 'Success response' },
      403: { description: 'Forbidden - Missing required permissions' }
    }
  }
});

export default defineEventHandler(async (event) => {
  await checkRoutePermissions(event, ['sources.crud.delete']);
  const service = await getService();
  const id = getRouterParam(event, 'id') || '';
  return {
    data: await service.delete(id),
    statusMessage: 'success sources.delete.success',
  };
});
