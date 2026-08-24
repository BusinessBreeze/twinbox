import { getService } from '#server/services/app/email';

defineRouteMeta({
  openAPI: {
    tags: ['App Email'],
    description: 'Import email data.',
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
    statusMessage: 'success email.import.success',
  };
});
