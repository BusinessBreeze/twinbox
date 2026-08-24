import { defineCronHandler } from '#nuxt/cron'
import { db } from 'hub:db'
import { accounts } from 'hub:db:schema'
import { emails } from '#server/db/schema'
import { eq, lt, and, desc, inArray } from 'drizzle-orm'
import appDefaults from '#server/metadata/app_defaults.json'
import { emitTelemetryEvent, EventScope, EventLevel } from '#bs/utils/telemetry/event'

export default defineCronHandler(() => '0 0 0 * * *', async () => {
  await emitTelemetryEvent({
    scope: EventScope.SYSTEM,
    level: EventLevel.DEBUG,
    category: 'cron',
    message: 'Email truncate start'
  });

  try {
    const allAccounts = await db.select().from(accounts)

    for (const account of allAccounts) {
      const limitLevel = account.limits || 'free'
      const limitConfig = (appDefaults.limits as any)[limitLevel]?.pruning?.email

      if (!limitConfig) {
        continue
      }

      const { retention_days, max_emails, max_size_mb } = limitConfig
      await emitTelemetryEvent({
        scope: EventScope.SYSTEM,
        level: EventLevel.DEBUG,
        category: 'cron',
        message: `Processing limits: ${account.user}`,
        metadata: { retention_days, max_emails, max_size_mb }
      });

      // 1. Enforce retention_days (Age)
      if (typeof retention_days === 'number') {
        const cutoffDate = new Date(Date.now() - retention_days * 24 * 60 * 60 * 1000)
        const deletedByAge = await db.delete(emails)
          .where(
            and(
              eq(emails.owner_id, account.id),
              lt(emails.createdAt, cutoffDate)
            )
          )
          .returning()
        if (deletedByAge.length > 0) {
          await emitTelemetryEvent({
            scope: EventScope.SYSTEM,
            level: EventLevel.DEBUG,
            category: 'cron',
            message: `Deleted ${deletedByAge.length} emails (age): ${account.user}`
          });
        }
      }

      // Fetch all remaining emails for the account ordered by createdAt descending (newest first)
      const userEmails = await db.select()
        .from(emails)
        .where(eq(emails.owner_id, account.id))
        .orderBy(desc(emails.createdAt))

      let remainingEmails = [...userEmails]

      // 2. Enforce max_emails
      if (typeof max_emails === 'number' && remainingEmails.length > max_emails) {
        const emailsToDelete = remainingEmails.slice(max_emails)
        const idsToDelete = emailsToDelete.map(e => e.id)

        if (idsToDelete.length > 0) {
          await db.delete(emails).where(inArray(emails.id, idsToDelete))
          await emitTelemetryEvent({
            scope: EventScope.SYSTEM,
            level: EventLevel.DEBUG,
            category: 'cron',
            message: `Deleted ${idsToDelete.length} emails (count): ${account.user}`
          });
          remainingEmails = remainingEmails.slice(0, max_emails)
        }
      }

      // 3. Enforce max_size_mb
      if (typeof max_size_mb === 'number') {
        const maxSizeBytes = max_size_mb * 1024 * 1024
        let totalSizeBytes = 0
        const idsToDelete: string[] = []

        for (const email of remainingEmails) {
          const sizeBytes = (email.text?.length || 0) + (email.html?.length || 0) + (email.subject?.length || 0)
          if (totalSizeBytes + sizeBytes > maxSizeBytes) {
            idsToDelete.push(email.id)
          } else {
            totalSizeBytes += sizeBytes
          }
        }

        if (idsToDelete.length > 0) {
          await db.delete(emails).where(inArray(emails.id, idsToDelete))
          await emitTelemetryEvent({
            scope: EventScope.SYSTEM,
            level: EventLevel.DEBUG,
            category: 'cron',
            message: `Deleted ${idsToDelete.length} emails (size): ${account.user}`
          });
        }
      }
    }
  } catch (error: any) {
    await emitTelemetryEvent({
      scope: EventScope.SYSTEM,
      level: EventLevel.ERROR,
      category: 'cron',
      message: `Email truncate failed: ${error?.message || String(error)}`
    });
  }

  await emitTelemetryEvent({
    scope: EventScope.SYSTEM,
    level: EventLevel.DEBUG,
    category: 'cron',
    message: 'Email truncate complete'
  });
})
