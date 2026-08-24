import { getService } from '#server/services/app/email';

defineRouteMeta({
  openAPI: {
    tags: ['App Email'],
    description: 'Export stored email data.',
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
    statusMessage: 'success email.export.success',
  };
});
