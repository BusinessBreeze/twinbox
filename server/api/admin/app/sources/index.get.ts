import { getService } from '#server/services/app/sources';

defineRouteMeta({
  openAPI: {
    tags: ['App Sources'],
    description: 'Retrieve all sources (admin, secrets omitted).',
    responses: {
      200: { description: 'Success response' },
      403: { description: 'Forbidden - Missing required permissions' }
    }
  }
});

export default defineEventHandler(async (event) => {
  await checkRoutePermissions(event, ['sources.crud.read']);
  const service = await getService();
  return {
    data: await service.read(),
    statusMessage: 'success sources.read.success',
  };
});
