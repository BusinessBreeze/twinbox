import { getService } from '#server/services/app/email';

defineRouteMeta({
  openAPI: {
    tags: ['App Email'],
    description: 'Create a new email (admin).',
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
  await checkRoutePermissions(event, ['email.crud.create']);
  const service = await getService(event);

  const body = await readBody(event);

  return {
    data: await service.create(body),
    statusMessage: 'success email.create.success',
  };
});
