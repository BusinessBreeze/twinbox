import { getService } from '#server/services/app/sources';

defineRouteMeta({
  openAPI: {
    tags: ['App Sources'],
    description: 'Delete a source (warns about automations and IMAP notification channels using it; staging: no-op).',
    responses: {
      200: { description: 'Success response' }
    }
  }
});

export default defineEventHandler(async (event) => {
  const service = await getService(event);
  const id = getRouterParam(event, 'id') || '';
  return {
    data: await service.delete(id),
    statusMessage: 'success sources.delete.success',
  };
});
