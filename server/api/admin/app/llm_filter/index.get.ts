import { getService } from '#server/services/app/llm_filter';

defineRouteMeta({
  openAPI: {
    tags: ['App LLM Filter'],
    description: 'Get all LLM filters (admin).',
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

  return {
    data: await service.read(),
    statusMessage: 'success llm_filter.read.success',
  };
});
