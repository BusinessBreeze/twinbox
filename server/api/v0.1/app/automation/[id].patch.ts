import { getService } from '#server/services/app/automation';

export default defineEventHandler(async (event) => {
  const service = await getService(event);
  const id = getRouterParam(event, 'id');
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'error automation.id.required' });
  }
  const body = await readBody(event);

  return {
    data: await service.update(id, body),
    statusMessage: 'success automation.update.success',
  };
});
