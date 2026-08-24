import { notificationProviderRegistry } from '#bs/utils/notifications_provider_registry';
import { ImapNotificationProvider } from '#server/services/app/notification_imap';

export default defineNitroPlugin((_nitroApp) => {
  notificationProviderRegistry.registerProvider('imap', ImapNotificationProvider);
});
