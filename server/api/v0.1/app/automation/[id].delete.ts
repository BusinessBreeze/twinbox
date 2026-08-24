import { getService } from '#server/services/app/automation';

export default defineEventHandler(async (event) => {
  const service = await getService(event);
  const id = getRouterParam(event, 'id');
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'error automation.id.required' });
  }

  return {
    data: await service.delete(id),
    statusMessage: 'success automation.delete.success',
  };
});
