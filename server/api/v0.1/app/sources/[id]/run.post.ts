import { getService } from '#server/services/app/sources';

defineRouteMeta({
  openAPI: {
    tags: ['App Sources'],
    description: 'Run now: start every key of the source that an active automation subscribes to.',
    responses: {
      200: { description: 'Success response' }
    }
  }
});

export default defineEventHandler(async (event) => {
  const service = await getService(event);
  const id = getRouterParam(event, 'id') || '';
  return {
    data: await service.runNow(id),
    statusMessage: 'success sources.run.started',
  };
});
