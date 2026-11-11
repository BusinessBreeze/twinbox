import { getService } from '#server/services/app/email';

defineRouteMeta({
  openAPI: {
    tags: ['App Email'],
    description: 'Delete an email by ID for the authenticated user.',
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
  const id = getRouterParam(event, 'id') || '';
  const service = await getService(event);
  await service.delete(id);

  return {
    statusMessage: 'success email.delete.success',
  };
});
