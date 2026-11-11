import { artifactService } from '#server/services/app/artifacts';
import { requireOwner } from '#server/utils/http_files';

defineRouteMeta({
  openAPI: {
    tags: ['App Artifacts'],
    description: 'Delete several artifacts of the authenticated user by id (body: { ids: [...] }). Ids of other users are ignored.',
    responses: {
      200: { description: 'Success response' },
      400: { description: 'Missing ids' },
    },
  },
});

export default defineEventHandler(async (event) => {
  const ownerId = await requireOwner(event);
  const body = await readBody(event).catch(() => ({}));
  const ids = (Array.isArray(body?.ids) ? body.ids : [])
    .map((v: any) => (v && typeof v === 'object' ? v.id : v))
    .filter((v: any): v is string => typeof v === 'string' && v.length > 0);
  if (ids.length === 0) throw createError({ statusCode: 400, statusMessage: 'error artifacts.missing_ids' });

  return {
    deleted: await artifactService.delete(ownerId, ids),
    statusMessage: 'success artifacts.delete.success',
  };
});
