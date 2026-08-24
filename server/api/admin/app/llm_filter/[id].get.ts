import { getService } from '#server/services/app/llm_filter';

defineRouteMeta({
  openAPI: {
    tags: ['App LLM Filter'],
    description: 'Get an LLM filter by ID (admin).',
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
  await checkRoutePermissions(event, ['llm_filter.crud.read']);
  const service = await getService(event);
  const id = getRouterParam(event, 'id') || '';

  return {
    data: await service.read(id),
    statusMessage: 'success llm_filter.read.success',
  };
});
