import { getService } from '#server/services/app/sources';

defineRouteMeta({
  openAPI: {
    tags: ['App Sources'],
    description: 'Get one source (secrets omitted).',
    responses: {
      200: { description: 'Success response' }
    }
  }
});

export default defineEventHandler(async (event) => {
  const service = await getService(event);
  const id = getRouterParam(event, 'id') || '';
  return {
    data: await service.read(id),
    statusMessage: 'success sources.read.success',
  };
});
