// Every app module the source layer uses, in one place (like jobs/automations/deps.ts).
// Code under jobs/sources imports app code only from here; libraries (drizzle-orm, zod, imapflow, node:*) directly.

// --- Database ---
export { db } from 'hub:db';
export { sources, emails } from '#server/db/schema';
export { emailStoredSize } from '#server/db/email_content';
export { getService as getEmailService, releaseFiles as releaseEmailFiles } from '#server/services/app/email';
export { parseMessage, buildEmail, typeAllowed, OMITTED_HEADER, type BuiltEmail, type AttachmentRules } from '#server/services/app/email_builder';

// --- Queue ---
export { automationQueue as jobQueue } from '#server/queue/index';

// --- Crypto ---
export { encryptValue, decryptValue } from '#server/utils/crypto/simple';

// --- Telemetry ---
export { emitTelemetryEvent, EventScope, EventLevel } from '#bs/utils/telemetry/event';
export { notifyUser } from '#bs/utils/user_stream';

// --- Configuration ---
import { limits } from '#shared/limits';
export { limits };

// Required, checked at startup (server/plugins/app_env_check.ts).
export const baseUrl = () => process.env.BASE_URL!;
/** System limit for one fetch; a source's max_items_per_fetch can only be lower. */
export const systemMaxItemsPerFetch = (): number => limits.automation.max_emails_per_fetch;
