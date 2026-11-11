import { artifactService } from '#server/services/app/artifacts';
import { requireOwner } from '#server/utils/http_files';

defineRouteMeta({
  openAPI: {
    tags: ['App Artifacts'],
    description: 'List the artifacts of the authenticated user, newest first. The bytes are at /api/v0.1/app/files/<file_id>.',
    responses: {
      200: { description: 'Success response' },
    },
  },
});

export default defineEventHandler(async (event) => {
  const ownerId = await requireOwner(event);
  return {
    data: await artifactService.list(ownerId),
    statusMessage: 'success artifacts.read.success',
  };
});
