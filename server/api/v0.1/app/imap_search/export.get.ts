import { getService } from '#server/services/app/imap_search';

defineRouteMeta({
  openAPI: {
    tags: ['App IMAP Search'],
    description: 'Export IMAP search criteria.',
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
    statusMessage: 'success imap_search.export.success',
  };
});
