import { getService } from '#server/services/app/automation';

defineRouteMeta({
  openAPI: {
    tags: ['App Automation'],
    description: 'Export automation data.',
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
  const service = await getService(event);
  const query = getQuery(event);
  const id = query.id as string | undefined;

  const result = await service.export(id);

  return {
    data: result,
    statusMessage: 'success automation.export.success',
  };
});
