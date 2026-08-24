import { getService } from '#server/services/app/connections_imap';

defineRouteMeta({
  openAPI: {
    tags: ['App Connections IMAP'],
    description: 'Export IMAP connection data.',
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
  const query = getQuery(event);
  const id = query.id as string | undefined;

  const result = await service.export(id);

  return {
    data: result,
    statusMessage: 'success connections_imap.export.success',
  };
});
