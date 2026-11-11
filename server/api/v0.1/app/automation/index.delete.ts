import { getService } from '#server/services/app/automation';

export default defineEventHandler(async (event) => {
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
