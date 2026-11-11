import { getService } from '#server/services/app/email';

defineRouteMeta({
  openAPI: {
    tags: ['App Email'],
    description: 'Retrieve all emails (admin): metadata only, without text and content.',
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
  await checkRoutePermissions(event, ['email.crud.read']);
  const service = await getService();

  // Metadata only (sender, subject, date, owner): reading content is a logged access (/api/admin/app/email/:id)
  return {
    data: await service.list(),
    statusMessage: 'success email.read.success',
  };
});
