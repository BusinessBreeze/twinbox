import { getService } from '#server/services/app/imap_search';

defineRouteMeta({
  openAPI: {
    tags: ['App IMAP Search'],
    description: 'Delete an IMAP search.',
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
    statusMessage: 'success imap_search.delete.success',
  };
});
