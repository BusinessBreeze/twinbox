import { getService } from '#server/services/app/imap_search';

defineRouteMeta({
  openAPI: {
    tags: ['App IMAP Search'],
    description: 'Get an IMAP search by ID.',
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
  const id = getRouterParam(event, 'id') || '';

  return {
    data: await service.read(id),
    statusMessage: 'success imap_search.read.success',
  };
});
