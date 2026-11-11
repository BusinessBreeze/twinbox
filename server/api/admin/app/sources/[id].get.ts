import { getService } from '#server/services/app/sources';

defineRouteMeta({
  openAPI: {
    tags: ['App Sources'],
    description: 'Retrieve one source (admin, secrets omitted).',
    responses: {
      200: { description: 'Success response' },
      403: { description: 'Forbidden - Missing required permissions' }
    }
  }
});

export default defineEventHandler(async (event) => {
  await checkRoutePermissions(event, ['sources.crud.read']);
  const service = await getService();
  const id = getRouterParam(event, 'id') || '';
  return {
    data: await service.read(id),
    statusMessage: 'success sources.read.success',
  };
});
