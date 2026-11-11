import { getService } from '#server/services/app/email';

defineRouteMeta({
  openAPI: {
    tags: ['App Email'],
    description: 'Retrieve emails for the authenticated user: list columns and the number of attachments, without the automation text and the structure (one email with them: /api/v0.1/app/email/{id}).',
    parameters: [
      {
        in: 'query',
        name: 'id',
        required: false,
        schema: { type: 'string' },
        description: 'Filter email by database ID'
      },
      {
        in: 'query',
        name: 'message_id',
        required: false,
        schema: { type: 'string' },
        description: 'Filter email by IMAP Message ID'
      }
    ],
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

  // Filtered in SQL; a list row has no automation text or structure (the viewer reads one email at /email/:id)
  const data = await service.list({
    ...(query.id ? { id: String(query.id) } : {}),
    ...(query.message_id ? { messageId: String(query.message_id) } : {}),
  });

  return {
    data,
    statusMessage: 'success email.read.success',
  };
});
