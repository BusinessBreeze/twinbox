import { getService } from '#server/services/app/llm_filter';

defineRouteMeta({
  openAPI: {
    tags: ['App LLM Filter'],
    description: 'Create a new LLM filter.',
    responses: {
      201: {
        description: 'Created successfully'
      },
      400: {
        description: 'Bad request'
      }
    }
  }
});

export default defineEventHandler(async (event) => {
  const service = await getService(event);
  const body = await readBody(event);

  return {
    data: await service.create(body),
    statusMessage: 'success llm_filter.create.success',
  };
});
