import { notificationProviderRegistry } from '#bs/utils/notifications_provider_registry';
import { ImapNotificationProvider, warnChannelsOfDeletedSource } from '#server/services/app/notification_imap';
import { Local } from '#server/services/app/notification_local';
import { onSourceDeleted } from '#server/services/app/sources';

export default defineNitroPlugin((_nitroApp) => {
  notificationProviderRegistry.registerProvider('imap', ImapNotificationProvider);
  notificationProviderRegistry.registerProvider('local', Local);   // artifacts: twinbox's file store, not the base's
  onSourceDeleted(warnChannelsOfDeletedSource);
});
