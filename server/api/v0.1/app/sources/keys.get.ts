import { getService } from '#server/services/app/sources';

defineRouteMeta({
  openAPI: {
    tags: ['App Sources'],
    description: 'Everything automations can subscribe to right now: one key per staging source, IMAP folders × saved searches (live). Sources that cannot be listed are returned under `unavailable`.',
    responses: {
      200: { description: 'Success response' }
    }
  }
});

export default defineEventHandler(async (event) => {
  const service = await getService(event);
  return {
    data: await service.keys(),
  };
});
