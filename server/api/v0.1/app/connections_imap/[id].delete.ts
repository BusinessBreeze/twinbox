import { getService } from '#server/services/app/connections_imap';

defineRouteMeta({
  openAPI: {
    tags: ['App Connection IMAP'],
    description: 'Delete an IMAP connection.',
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
    statusMessage: 'success connections_imap.delete.success',
  };
});
