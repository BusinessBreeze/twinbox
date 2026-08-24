import { getService } from '#server/services/app/llm_create_artifact';

defineRouteMeta({
  openAPI: {
    tags: ['App LLM Create Artifact'],
    description: 'Delete an LLM create artifact by ID (admin).',
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
  await checkRoutePermissions(event, ['llm_create_artifact.crud.delete']);
  const service = await getService(event);
  const id = getRouterParam(event, 'id') || '';

  return {
    data: await service.delete(id),
    statusMessage: 'success llm_create_artifact.delete.success',
  };
});
