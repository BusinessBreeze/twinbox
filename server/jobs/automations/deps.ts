// Every app module the automation code uses, in one place.
// Code under jobs/automations imports app code only from here (libraries such as drizzle-orm, zod,
// imapflow and node:* are imported directly). This file is the full list of what automations depend on,
// and the one place to replace in tests.

// --- Database ---
export { db } from 'hub:db';
export { emails, automations, sources } from '#server/db/schema';
export { accounts } from 'hub:db:schema';

// --- External services ---
export { llm } from '#server/clients/llm';
export { generateTTS } from '#server/clients/tts';
export { getService as getNotificationService } from '#bs/services/core/notification';
export { Local as LocalNotifications } from '#server/services/app/notification_local';

// --- Telemetry ---
export { emitTelemetryEvent, EventScope, EventLevel } from '#bs/utils/telemetry/event';
export { userMetrics } from '#server/utils/telemetry/user';

// --- Configuration and helpers ---
export { limits } from '#shared/limits';
export { getExtensionFromMime } from '#bs/utils/get_extensions_from_mime_type';
