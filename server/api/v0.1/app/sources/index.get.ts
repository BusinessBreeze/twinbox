import { getService } from '#server/services/app/sources';

defineRouteMeta({
  openAPI: {
    tags: ['App Sources'],
    description: 'List the user\'s sources (secrets omitted); creates the staging source on first use.',
    responses: {
      200: { description: 'Success response' }
    }
  }
});

export default defineEventHandler(async (event) => {
  const service = await getService(event);
  return {
    data: await service.read(),
    statusMessage: 'success sources.read.success',
  };
});
