import { getService } from '#server/services/app/sources';

defineRouteMeta({
  openAPI: {
    tags: ['App Sources'],
    description: 'Import sources (secrets have to be entered again).',
    responses: {
      200: { description: 'Success response' }
    }
  }
});

export default defineEventHandler(async (event) => {
  const service = await getService(event);
  const body = await readBody(event);
  return {
    data: await service.import(body),
    statusMessage: 'success sources.import.success',
  };
});
