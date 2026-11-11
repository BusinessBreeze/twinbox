import { getService } from '#server/services/app/email';
import { requireOwner } from '#server/utils/http_files';

defineRouteMeta({
  openAPI: {
    tags: ['App Email'],
    description: 'Remove the stored attachments of an email of the authenticated user and keep the email (its attachments stay listed as removed).',
    responses: {
      200: { description: 'The updated email' },
      404: { description: 'Not found' },
    },
  },
});

export default defineEventHandler(async (event) => {
  const ownerId = await requireOwner(event);
  const email = await (await getService(ownerId)).removeAttachments(getRouterParam(event, 'id') || '');
  if (!email) throw createError({ statusCode: 404, statusMessage: 'error email.not_found' });
  return {
    data: email,
    statusMessage: 'success email.remove_attachments.success',
  };
});
