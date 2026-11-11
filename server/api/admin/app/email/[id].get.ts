import { getService } from '#server/services/app/email';
import { auditAdminAccess } from '#server/utils/admin_audit';

defineRouteMeta({
  openAPI: {
    tags: ['App Email'],
    description: 'Retrieve an email by ID (admin). Logged in the owner\'s event log.',
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
  await checkRoutePermissions(event, ['email.crud.read']);
  const service = await getService();
  const id = getRouterParam(event, 'id') || '';
  const email: any = await service.read(id);
  const row = Array.isArray(email) ? email[0] : email;
  if (row) await auditAdminAccess(event, 'read', 'email', [row]);

  return {
    data: email,
    statusMessage: 'success email.read.success',
  };
});
