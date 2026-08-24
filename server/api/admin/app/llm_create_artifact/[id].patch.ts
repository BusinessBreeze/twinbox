import { getService } from '#server/services/app/llm_create_artifact';

defineRouteMeta({
  openAPI: {
    tags: ['App LLM Create Artifact'],
    description: 'Update an LLM create artifact by ID (admin).',
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
  await checkRoutePermissions(event, ['llm_create_artifact.crud.update']);
  const service = await getService(event);
  const id = getRouterParam(event, 'id') || '';
  const body = await readBody(event);

  return {
    data: await service.update(id, body),
    statusMessage: 'success llm_create_artifact.update.success',
  };
});
