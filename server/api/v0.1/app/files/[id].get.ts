// The only route that returns stored file bytes (artifacts, email attachments). The lookup is scoped to the owner:
// another user's file is 404, never 403. Contents may come from strangers, so every response is hardened: no type
// sniffing, a sandbox CSP (no scripts even if opened directly) and a download unless the type is safe to show.
import { sendStream } from 'h3';
import { fileService } from '#server/services/app/files';
import { contentDisposition, requireOwner } from '#server/utils/http_files';

defineRouteMeta({
  openAPI: {
    tags: ['App Files'],
    description: 'Download a stored file of the authenticated user. Sent as an attachment; ?inline=1 shows images, audio and text in the browser.',
    parameters: [
      { in: 'query', name: 'inline', required: false, schema: { type: 'string' }, description: '1: show in the browser when the type allows it' },
    ],
    responses: {
      200: { description: 'The file' },
      404: { description: 'Not found' },
    },
  },
});

// Types the browser may show (inline). Never HTML, SVG, XML or anything unknown. Text types are sent as text/plain.
// Not PDF: Chrome's PDF viewer refuses to run under the sandbox CSP, and dropping the sandbox isn't worth it.
const INLINE = /^(image\/(png|jpeg|gif|webp)|audio\/[\w.+-]+)$/;
const TEXT = /^(text\/(plain|markdown|x-markdown|csv)|application\/json)$/;

export default defineEventHandler(async (event) => {
  const ownerId = await requireOwner(event);
  const opened = await fileService.open(ownerId, getRouterParam(event, 'id') || '');
  if (!opened) throw createError({ statusCode: 404, statusMessage: 'error files.not_found' });

  const { file, stream } = opened;
  const wantsInline = getQuery(event).inline === '1';
  const text = TEXT.test(file.mime);
  const inline = wantsInline && (INLINE.test(file.mime) || text);

  setResponseHeaders(event, {
    'Content-Type': inline && text ? 'text/plain; charset=utf-8' : file.mime,
    'Content-Length': String(file.size),
    'Content-Disposition': contentDisposition(inline ? 'inline' : 'attachment', file.filename),
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "sandbox; default-src 'none'; img-src 'self'; media-src 'self'; style-src 'unsafe-inline'",
    'Cache-Control': 'private, no-store',
  });
  return sendStream(event, stream);
});
