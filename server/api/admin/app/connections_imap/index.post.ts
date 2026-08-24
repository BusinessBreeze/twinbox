import { getService } from '#server/services/app/connections_imap';

defineRouteMeta({
  openAPI: {
    tags: ['App Connection IMAP'],
    description: 'Create a new IMAP connection (admin).',
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
  await checkRoutePermissions(event, ['connections_imap.crud.create']);
  const service = await getService(event);

  const body = await readBody(event);

  return {
    data: await service.create(body),
    statusMessage: 'success connections_imap.create.success',
  };
});
