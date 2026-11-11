import { getService } from '#server/services/app/sources';

defineRouteMeta({
  openAPI: {
    tags: ['App Sources'],
    description: 'Export the user\'s sources (without secrets).',
    responses: {
      200: { description: 'Success response' }
    }
  }
});

export default defineEventHandler(async (event) => {
  const service = await getService(event);
  return {
    data: await service.export(),
    statusMessage: 'success sources.export.success',
  };
});
