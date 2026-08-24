import { getService } from '#server/services/app/connections_imap';

defineRouteMeta({
  openAPI: {
    tags: ['App Connections IMAP'],
    description: 'Import IMAP connection data.',
    responses: {
      200: {
        description: 'Success response'
      },
      400: {
        description: 'Bad request'
      }
    }
  }
});

export default defineEventHandler(async (event) => {
  const service = await getService(event);
  const body = await readBody(event);

  const result = await service.import(body);

  return {
    data: result,
    statusMessage: 'success connections_imap.import.success',
  };
});
