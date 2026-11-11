import { getService } from '#server/services/app/sources';

defineRouteMeta({
  openAPI: {
    tags: ['App Sources'],
    description: 'Create a source.',
    responses: {
      200: { description: 'Success response' }
    }
  }
});

export default defineEventHandler(async (event) => {
  const service = await getService(event);
  const body = await readBody(event);
  return {
    data: await service.create(body),
    statusMessage: 'success sources.create.success',
  };
});
