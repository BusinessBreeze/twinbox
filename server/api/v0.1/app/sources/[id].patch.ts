import { getService } from '#server/services/app/sources';

defineRouteMeta({
  openAPI: {
    tags: ['App Sources'],
    description: 'Update a source; empty secret fields keep the stored secret.',
    responses: {
      200: { description: 'Success response' }
    }
  }
});

export default defineEventHandler(async (event) => {
  const service = await getService(event);
  const id = getRouterParam(event, 'id') || '';
  const body = await readBody(event);
  return {
    data: await service.update(id, body),
    statusMessage: 'success sources.update.success',
  };
});
