import { storageService } from '#server/services/app/storage';
import { requireOwner } from '#server/utils/http_files';

defineRouteMeta({
  openAPI: {
    tags: ['App Storage'],
    description: 'Storage usage of the authenticated user in bytes: emails (text and structure), attachments and artifacts (files), and the quota over all files.',
    responses: {
      200: { description: 'Success response' },
    },
  },
});

export default defineEventHandler(async (event) => ({
  data: await storageService.usage(await requireOwner(event)),
  statusMessage: 'success storage.read.success',
}));
