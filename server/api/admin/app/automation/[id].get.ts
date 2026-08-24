import { getService } from '#server/services/app/automation';

defineRouteMeta({
  openAPI: {
    tags: ['App Automation'],
    description: 'Get an automation by ID (admin).',
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
  await checkRoutePermissions(event, ['automation.crud.read']);
  const service = await getService(event);
  const id = getRouterParam(event, 'id') || '';

  return {
    data: await service.read(id),
    statusMessage: 'success automation.read.success',
  };
});
