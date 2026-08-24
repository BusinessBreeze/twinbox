import { getService } from '#server/services/app/llm_filter';

defineRouteMeta({
  openAPI: {
    tags: ['App LLM Filter'],
    description: 'Import LLM filter data.',
    responses: {
      200: {
        description: 'Success response'
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

  const result = await service.import(body);

  return {
    data: result,
    statusMessage: 'success llm_filter.import.success',
  };
});
