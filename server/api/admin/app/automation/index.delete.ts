import { getService } from '#server/services/app/automation';

defineRouteMeta({
  openAPI: {
    tags: ['App Automation'],
    description: 'Delete multiple automations by IDs (admin).',
    responses: {
      200: {
        description: 'Success response'
      },
      400: {
        description: 'Missing IDs'
      },
      403: {
        description: 'Forbidden'
      }
    }
  }
});

export default defineEventHandler(async (event) => {
  await checkRoutePermissions(event, ['automation.crud.delete']);
  const service = await getService(event);
  const body = await readBody(event).catch(() => ({}));
  const ids: string[] = Array.isArray(body?.ids) ? body.ids : [];

  if (!ids || ids.length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'error automation.missing_ids' });
  }

  const deleted = await service.deleteMany(ids);

  return {
    deleted: Array.isArray(deleted) ? deleted.length : ids.length,
    statusMessage: 'success automation.delete_many.success',
  };
});
