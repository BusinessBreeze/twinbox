import { getService } from '#server/services/app/llm_filter';

export default defineEventHandler(async (event) => {
  const service = await getService(event);
  const id = getRouterParam(event, 'id');
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'error llm_filter.id.required' });
  }

  return {
    data: await service.delete(id),
    statusMessage: 'success llm_filter.delete.success',
  };
});
