import { getService } from '#server/services/app/llm_create_artifact';

defineRouteMeta({
  openAPI: {
    tags: ['App LLM Create Artifact'],
    description: 'Create a new LLM create artifact.',
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
    statusMessage: 'success llm_create_artifact.create.success',
  };
});
