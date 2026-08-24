import { getService } from '#server/services/app/imap_search';

defineRouteMeta({
  openAPI: {
    tags: ['App IMAP Search'],
    description: 'Delete an IMAP search by ID (admin).',
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
  await checkRoutePermissions(event, ['imap_search.crud.delete']);
  const service = await getService(event);
  const id = getRouterParam(event, 'id') || '';
  await service.delete(id);

  return {
    statusMessage: 'success imap_search.delete.success',
  };
});
