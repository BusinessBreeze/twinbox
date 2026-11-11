import { getService } from '#server/services/app/automation';

defineRouteMeta({
  openAPI: {
    tags: ['App Automation'],
    description: 'Create a new automation.',
    responses: {
      201: {
        description: 'Created successfully'
      },
      400: {
        description: 'Bad request'
      }
    }
  }
});

export default defineEventHandler(async (event) => {
  const service = await getService(event);
  const body = await readBody(event);

  return {
    data: await service.create(body),
    statusMessage: 'success automation.create.success',
  };
});
