import { getService } from '#server/services/app/automation';

defineRouteMeta({
  openAPI: {
    tags: ['App Automation'],
    description: 'Delete an automation by ID (admin).',
    responses: {
      200: {
        description: 'Success response'
      },
      403: {
        description: 'Forbidden'
      }
    }
  }
});

export default defineEventHandler(async (event) => {
  await checkRoutePermissions(event, ['automation.crud.delete']);
  const service = await getService(event);
  const id = getRouterParam(event, 'id') || '';

  return {
    data: await service.delete(id),
    statusMessage: 'success automation.delete.success',
  };
});
