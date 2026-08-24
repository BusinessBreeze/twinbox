import { getService } from '#server/services/app/connections_imap';

defineRouteMeta({
  openAPI: {
    tags: ['App Connection IMAP'],
    description: 'Retrieve all IMAP connections (admin).',
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
  await checkRoutePermissions(event, ['connections_imap.crud.read']);
  const service = await getService(event);

  return {
    data: await service.read(),
    statusMessage: 'success connections_imap.read.success',
  };
});
