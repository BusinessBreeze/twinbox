import { getService } from '#server/services/app/llm_filter';

defineRouteMeta({
  openAPI: {
    tags: ['App LLM Filter'],
    description: 'Create a new LLM filter (admin).',
    responses: {
      201: {
        description: 'Created successfully'
      },
      403: {
        description: 'Forbidden'
      }
    }
  }
});

export default defineEventHandler(async (event) => {
  await checkRoutePermissions(event, ['llm_filter.crud.create']);
  const service = await getService(event);
  const body = await readBody(event);

  return {
    data: await service.create(body),
    statusMessage: 'success llm_filter.create.success',
  };
});
