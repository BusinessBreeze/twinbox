import { getService } from '#server/services/app/email';
import { auditAdminAccess } from '#server/utils/admin_audit';

defineRouteMeta({
  openAPI: {
    tags: ['App Email'],
    description: 'Update an email by ID (admin).',
    responses: {
      200: {
        description: 'Success response'
      },
      403: {
        description: 'Forbidden - Missing required permissions'
      }
    }
  }
});

export default defineEventHandler(async (event) => {
  await checkRoutePermissions(event, ['email.crud.update']);
  const service = await getService();
  const id = getRouterParam(event, 'id') || '';

  const body = await readBody(event);
  const before: any = await service.read(id);
  const row = Array.isArray(before) ? before[0] : before;
  if (row) await auditAdminAccess(event, 'changed', 'email', [row]);

  return {
    data: await service.update(id, body),
    statusMessage: 'success email.update.success',
  };
});
