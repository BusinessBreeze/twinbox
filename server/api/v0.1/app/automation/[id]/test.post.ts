import { getService } from '#server/services/app/automation_draft';

defineRouteMeta({
  openAPI: {
    tags: ['App Automation'],
    description: 'Runs the automation once over the staged emails (also when inactive). Deliveries are written to the '
      + 'local artifacts instead of the channels. Returns { total, passed, aborted, files }.',
    responses: {
      200: { description: 'Success response' },
      400: { description: 'No staged emails' },
      404: { description: 'Automation not found' }
    }
  }
});

export default defineEventHandler(async (event) => {
  const service = await getService(event);
  return { data: await service.test(getRouterParam(event, 'id') || '') };
});
