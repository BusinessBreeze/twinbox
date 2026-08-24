import { getService } from '#server/services/app/imap_search';

defineRouteMeta({
  openAPI: {
    tags: ['App IMAP Search'],
    description: 'Get IMAP searches for the authenticated user.',
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
    statusMessage: 'success imap_search.read.success',
  };
});
