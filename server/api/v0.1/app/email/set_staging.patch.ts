import { getService } from '#server/services/app/email';
import { z } from 'zod';

defineRouteMeta({
  openAPI: {
    tags: ['App Email'],
    description: 'Set staging_item flag for one or more emails.',
    requestBody: {
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              ids: { type: 'array', items: { type: 'string' } },
              staging_item: { type: 'integer', enum: [0, 1] }
            }
          }
        }
      }
    },
    responses: {
      200: {
        description: 'Success response'
      },
      400: {
        description: 'Bad Request'
      },
      403: {
        description: 'Forbidden'
      }
    }
  }
});

const schema = z.object({
  id: z.string().optional(),
  ids: z.array(z.string()).optional(),
  staging_item: z.union([z.number(), z.boolean()]).optional(),
  value: z.union([z.number(), z.boolean()]).optional()
}).refine(data => data.id || (data.ids && data.ids.length > 0), {
  message: 'Either id or ids must be provided'
});

export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage: parsed.error.issues[0]?.message || 'Invalid request body'
    });
  }

  const { id, ids, staging_item, value } = parsed.data;
  const targetIds = ids && ids.length > 0 ? ids : (id ? [id] : []);

  let stagingValue = 1;
  const rawVal = staging_item !== undefined ? staging_item : value;
  if (rawVal !== undefined) {
    stagingValue = typeof rawVal === 'boolean' ? (rawVal ? 1 : 0) : (rawVal === 0 ? 0 : 1);
  }

  const service = await getService(event);
  const updated = await service.setStaging(targetIds, stagingValue);

  return {
    data: updated,
    statusMessage: 'success email.set_staging.success'
  };
});
