import { getService } from '#server/services/app/connections_imap';

defineRouteMeta({
  openAPI: {
    tags: ['App Connection IMAP'],
    description: 'Delete an IMAP connection by ID (admin).',
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
  await checkRoutePermissions(event, ['connections_imap.crud.delete']);
  const service = await getService(event);
  const id = getRouterParam(event, 'id') || '';

  await service.delete(id);

  return {
    statusMessage: 'success connections_imap.delete.success',
  };
});
