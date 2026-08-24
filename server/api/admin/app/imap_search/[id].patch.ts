import { getService } from '#server/services/app/imap_search';

defineRouteMeta({
  openAPI: {
    tags: ['App IMAP Search'],
    description: 'Update an IMAP search by ID (admin).',
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
  await checkRoutePermissions(event, ['imap_search.crud.update']);
  const service = await getService(event);
  const id = getRouterParam(event, 'id') || '';
  const body = await readBody(event);

  return {
    data: await service.update(id, body),
    statusMessage: 'success imap_search.update.success',
  };
});
