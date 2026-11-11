// One email of the authenticated user, in two representations of the same record (one lookup, one owner check):
//   ?format=json (default)  the record with its structure (renditions, parts, embedded messages), for the viewer
//   ?format=eml             the email as a message/rfc822 file with its stored attachments, always as a download
// A query parameter, not the Accept header: download links can't set headers.
import { getService, toEml } from '#server/services/app/email';
import { contentDisposition, requireOwner } from '#server/utils/http_files';

defineRouteMeta({
  openAPI: {
    tags: ['App Email'],
    description: 'One email of the authenticated user: the record (format=json, default) or the email as an .eml file with its stored attachments (format=eml).',
    parameters: [
      { in: 'query', name: 'format', required: false, schema: { type: 'string', enum: ['json', 'eml'] }, description: 'json (default) or eml' },
    ],
    responses: {
      200: { description: 'The record, or the .eml file' },
      400: { description: 'Unknown format' },
      404: { description: 'Not found' },
    },
  },
});

export default defineEventHandler(async (event) => {
  const ownerId = await requireOwner(event);
  const format = String(getQuery(event).format ?? 'json');
  if (format !== 'json' && format !== 'eml') throw createError({ statusCode: 400, statusMessage: 'error email.format.invalid' });

  const found: any = await (await getService(ownerId)).read(getRouterParam(event, 'id') || '');
  const email = Array.isArray(found) ? found[0] : found;
  if (!email || email.owner_id !== ownerId) throw createError({ statusCode: 404, statusMessage: 'error email.not_found' });

  // The JSON holds the raw HTML renditions: never let a browser render this response as a page
  setResponseHeader(event, 'X-Content-Type-Options', 'nosniff');
  if (format === 'json') {
    return { data: email, statusMessage: 'success email.read.success' };
  }

  const eml = await toEml(ownerId, email);
  setResponseHeaders(event, {
    'Content-Type': 'message/rfc822',
    'Content-Disposition': contentDisposition('attachment', `${email.subject || 'email'}.eml`),
    'Content-Security-Policy': "sandbox; default-src 'none'",
    'Cache-Control': 'private, no-store',
  });
  return eml;
});
