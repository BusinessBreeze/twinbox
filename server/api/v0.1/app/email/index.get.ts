import { getService } from '#server/services/app/email';

defineRouteMeta({
  openAPI: {
    tags: ['App Email'],
    description: 'Retrieve emails for the authenticated user.',
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

  let data = await service.read();
  if (!Array.isArray(data)) {
    data = data ? [data] : [];
  }

  if (query.id) {
    const targetId = String(query.id);
    data = data.filter((item: any) => item.id === targetId);
  }

  if (query.message_id) {
    const targetMessageId = String(query.message_id);
    data = data.filter((item: any) => item.messageId === targetMessageId);
  }

  return {
    data,
    statusMessage: 'success email.read.success',
  };
});
