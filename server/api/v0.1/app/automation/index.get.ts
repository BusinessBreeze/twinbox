import { getService } from '#server/services/app/automation';

defineRouteMeta({
  openAPI: {
    tags: ['App Automation'],
    description: 'Get automations for the authenticated user.',
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
  const service = await getService(event);

  return {
    data: await service.read(),
    statusMessage: 'success automation.read.success',
  };
});
