import { getService } from '#server/services/app/llm_filter';

defineRouteMeta({
  openAPI: {
    tags: ['App LLM Filter'],
    description: 'Update an LLM filter by ID (admin).',
    responses: {
      200: {
        description: 'Success response'
      },
      403: {
        description: 'Forbidden'
      }
    }
  }
});

export default defineEventHandler(async (event) => {
  await checkRoutePermissions(event, ['llm_filter.crud.update']);
  const service = await getService(event);
  const id = getRouterParam(event, 'id') || '';
  const body = await readBody(event);

  return {
    data: await service.update(id, body),
    statusMessage: 'success llm_filter.update.success',
  };
});
