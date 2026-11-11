import { artifactService } from '#server/services/app/artifacts';
import { requireOwner } from '#server/utils/http_files';

defineRouteMeta({
  openAPI: {
    tags: ['App Artifacts'],
    description: 'One artifact of the authenticated user (its file name, type, size, automation). The bytes are at /api/v0.1/app/files/<file_id>.',
    responses: {
      200: { description: 'Success response' },
      404: { description: 'Not found' },
    },
  },
});

export default defineEventHandler(async (event) => {
  const ownerId = await requireOwner(event);
  const artifact = await artifactService.get(ownerId, getRouterParam(event, 'id') || '');
  if (!artifact) throw createError({ statusCode: 404, statusMessage: 'error artifacts.not_found' });
  return {
    data: artifact,
    statusMessage: 'success artifacts.read.success',
  };
});
