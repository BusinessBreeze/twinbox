import { getService } from '#server/services/app/llm_create_artifact';

defineRouteMeta({
  openAPI: {
    tags: ['App LLM Create Artifact'],
    description: 'Export LLM artifact creation prompt data.',
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
  const service = await getService(event);
  const query = getQuery(event);
  const id = query.id as string | undefined;

  const result = await service.export(id);

  return {
    data: result,
    statusMessage: 'success llm_create_artifact.export.success',
  };
});
