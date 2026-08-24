import { getService } from '#server/services/app/automation';

defineRouteMeta({
  openAPI: {
    tags: ['App Automation'],
    description: 'Create a new automation (admin).',
    responses: {
      201: {
        description: 'Created successfully'
      },
      403: {
        description: 'Forbidden'
      }
    }
  }
});

export default defineEventHandler(async (event) => {
  await checkRoutePermissions(event, ['automation.crud.create']);
  const service = await getService(event);
  const body = await readBody(event);

  return {
    data: await service.create(body),
    statusMessage: 'success automation.create.success',
  };
});
