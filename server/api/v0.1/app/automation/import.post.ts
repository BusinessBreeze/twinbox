import { getService } from '#server/services/app/automation';

defineRouteMeta({
  openAPI: {
    tags: ['App Automation'],
    description: 'Import automation data.',
    responses: {
      200: {
        description: 'Success response'
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

  const result = await service.import(body);

  return {
    data: result,
    statusMessage: 'success automation.import.success',
  };
});
