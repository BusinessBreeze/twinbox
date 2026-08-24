import { getService } from '#server/services/app/imap_search';

defineRouteMeta({
  openAPI: {
    tags: ['App IMAP Search'],
    description: 'Retrieve all IMAP searches (admin).',
    responses: {
      200: {
        description: 'Success response'
      },
      403: {
        description: 'Forbidden - Missing required permissions'
      }
    }
  }
});

export default defineEventHandler(async (event) => {
  await checkRoutePermissions(event, ['imap_search.crud.read']);
  const service = await getService(event);

  return {
    data: await service.read(),
    statusMessage: 'success imap_search.read.success',
  };
});
