import { artifactService } from '#server/services/app/artifacts';
import { requireOwner } from '#server/utils/http_files';

defineRouteMeta({
  openAPI: {
    tags: ['App Artifacts'],
    description: 'Delete an artifact of the authenticated user (and its file, unless something else uses it).',
    responses: {
      200: { description: 'Success response' },
      404: { description: 'Not found' },
    },
  },
});

export default defineEventHandler(async (event) => {
  const ownerId = await requireOwner(event);
  const deleted = await artifactService.delete(ownerId, [getRouterParam(event, 'id') || '']);
  if (!deleted) throw createError({ statusCode: 404, statusMessage: 'error artifacts.not_found' });
  return {
    statusMessage: 'success artifacts.delete.success',
  };
});
