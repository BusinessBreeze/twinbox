import { getService } from '#server/services/app/llm_filter';

export default defineEventHandler(async (event) => {
  const service = await getService(event);
  const id = getRouterParam(event, 'id');
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'error llm_filter.id.required' });
  }
  const body = await readBody(event);

  return {
    data: await service.update(id, body),
    statusMessage: 'success llm_filter.update.success',
  };
});
