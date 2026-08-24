import { getService } from '#server/services/app/automation';

defineRouteMeta({
  openAPI: {
    tags: ['App Automation'],
    description: 'Update an automation by ID (admin).',
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
  await checkRoutePermissions(event, ['automation.crud.update']);
  const service = await getService(event);
  const id = getRouterParam(event, 'id') || '';
  const body = await readBody(event);

  return {
    data: await service.update(id, body),
    statusMessage: 'success automation.update.success',
  };
});
