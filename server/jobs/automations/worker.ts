import { poll } from '#server/utils/imap/poll';
import { llmFilter } from '#server/services/app/llm/tests/llm_filter';
import { getService as getEmailService } from '#server/services/app/email';
import { runTasks } from '#server/utils/tasks/runner';
import { emitTelemetryEvent, EventScope, EventLevel } from '#bs/utils/telemetry/event';
import { db } from "hub:db";
import { automations } from "#server/db/schema";
import { eq } from "drizzle-orm";

export const processAutomationItem = async (item: any) => {
  const startTime = Date.now();
  const name = item.automation?.name || 'Unnamed Automation';
  const ownerId = item.automation?.owner_id;
  const id = item.automation?.id;

  try {
    await emitTelemetryEvent({
      scope: EventScope.USER,
      level: EventLevel.INFO,
      category: 'automation',
      message: 'events.user.info_automation_start',
      owner_id: ownerId,
      metadata: { id, name }
    });

    let tasksObj = item.automation.tasks;
    if (typeof tasksObj === 'string') {
      try {
        tasksObj = JSON.parse(tasksObj);
      } catch (e) {
        await emitTelemetryEvent({
          scope: EventScope.SYSTEM,
          level: EventLevel.ERROR,
          category: 'automation',
          message: `Task parse failed: ${name}`,
          metadata: { error: String(e), name }
        });
      }
    }

    const imapMarkRead = !!(tasksObj?.imap_mark_read || (Array.isArray(tasksObj?.tasks) && tasksObj.tasks.some((t: any) => t.name === 'imap_mark_read')));
    const onlyNew = !!tasksObj?.only_new;

    const lastUid = item.automation?.last_uid || 0;
    const emails = await poll(item.connection, item.search?.search, item.automation.imap_folder, imapMarkRead, undefined, undefined, lastUid);

    const maxUid = emails.reduce((max: number, e: any) => (e.uid && e.uid > max ? e.uid : max), lastUid);
    if (maxUid > lastUid && item.automation?.id) {
      try {
        await db
          .update(automations)
          .set({ last_uid: maxUid })
          .where(eq(automations.id, item.automation.id));

        await emitTelemetryEvent({
          scope: EventScope.SYSTEM,
          level: EventLevel.DEBUG,
          category: 'automation',
          message: `Updated automation "${name}" last_uid to ${maxUid}`
        });
      } catch (uidErr) {
        console.error('Failed to update automation last_uid:', uidErr);
      }
    }

    const emailService = await getEmailService(ownerId);
    const persistedEmails = [];

    for (const email of emails) {
      try {
        if (item.connection?.auth_type === 'staging' || email.isStaging) {
          persistedEmails.push(email);
          continue;
        }

        const persisted = await emailService.create(email.source);
        if (persisted) {
          persistedEmails.push(persisted);
        } else if (!onlyNew) {
          persistedEmails.push(email);
        } else {
          await emitTelemetryEvent({
            scope: EventScope.SYSTEM,
            level: EventLevel.DEBUG,
            category: 'automation',
            message: `Skipped downloaded email (only_new)`,
            metadata: { subject: email.subject }
          });
        }
      } catch (err) {
        await emitTelemetryEvent({
          scope: EventScope.SYSTEM,
          level: EventLevel.ERROR,
          category: 'automation',
          message: `Email persist failed: ${email.subject}`,
          metadata: { error: String(err), subject: email.subject }
        });
      }
    }

    let passedEmails = [];
    if (item.llmFilter && persistedEmails.length > 0) {
      await emitTelemetryEvent({
        scope: EventScope.SYSTEM,
        level: EventLevel.DEBUG,
        category: 'automation',
        message: `Applying LLM filter "${item.llmFilter.name}" (${persistedEmails.length} emails)`
      });
      for (const email of persistedEmails) {
        const emailContent = `Subject: ${email.subject}\n\nBody:\n${email.text}`;
        const passed = await llmFilter(item.llmFilter, emailContent);
        if (passed) {
          passedEmails.push(email);
        }
      }
      await emitTelemetryEvent({
        scope: EventScope.SYSTEM,
        level: EventLevel.DEBUG,
        category: 'automation',
        message: `LLM filter passed: ${passedEmails.length} emails`,
        metadata: { passed: passedEmails.map((e: any) => e.subject) }
      });
    } else {
      await emitTelemetryEvent({
        scope: EventScope.SYSTEM,
        level: EventLevel.DEBUG,
        category: 'automation',
        message: `No LLM filter or emails`
      });
      passedEmails = persistedEmails;
    }

    const tasksToRun = tasksObj?.tasks || [];
    const isMultiple = !!tasksObj?.multiple;
    const sourceLinks = !!tasksObj?.source_links;

    if (tasksToRun.length === 0) {
      await emitTelemetryEvent({
        scope: EventScope.SYSTEM,
        level: EventLevel.DEBUG,
        category: 'automation',
        message: `No tasks configured: ${name}`
      });
      return;
    }

    if (passedEmails.length === 0) {
      await emitTelemetryEvent({
        scope: EventScope.SYSTEM,
        level: EventLevel.DEBUG,
        category: 'automation',
        message: `No emails to process: ${name}`
      });
      return;
    }

    const buildEmailItem = (email: any) => {
      let footer = '';
      if (sourceLinks) {
        const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
        const title = email.subject || '(No Subject)';
        const msgId = email.messageId || email.message_id || '';
        const url = `${baseUrl}/?message_id=${encodeURIComponent(String(msgId))}`;
        footer = `- [${title}](${url})`;
      }

      return {
        content: `Subject: ${email.subject}\n\nBody:\n${email.text}`,
        mime_type: 'text/plain',
        metadata: {
          imap: {
            headers: [{
              messageId: email.messageId || email.message_id || '',
              inReplyTo: email.inReplyTo || '',
              references: email.references || '',
              subject: email.subject || '',
              from: email.from || ''
            }],
            footer
          }
        }
      };
    };

    if (isMultiple) {
      await emitTelemetryEvent({
        scope: EventScope.SYSTEM,
        level: EventLevel.DEBUG,
        category: 'automation',
        message: `Running tasks (multiple mode): ${name}`
      });
      const context: any = {
        owner_id: ownerId,
        source: {
          imap: {
            email: passedEmails.map(buildEmailItem)
          }
        }
      };

      await runTasks(name, context, tasksToRun);
    } else {
      await emitTelemetryEvent({
        scope: EventScope.SYSTEM,
        level: EventLevel.DEBUG,
        category: 'automation',
        message: `Running tasks (individual mode): ${name}`
      });
      for (const email of passedEmails) {
        const context: any = {
          owner_id: ownerId,
          source: {
            imap: {
              email: [buildEmailItem(email)]
            }
          }
        };

        await runTasks(name, context, tasksToRun);
      }
    }

    const duration = Date.now() - startTime;
    await emitTelemetryEvent({
      scope: EventScope.USER,
      level: EventLevel.INFO,
      category: 'automation',
      message: 'events.user.info_automation_end',
      owner_id: ownerId,
      metadata: { id, name, durationMs: duration }
    });
  } catch (err: any) {
    await emitTelemetryEvent({
      scope: EventScope.USER,
      level: EventLevel.ERROR,
      category: 'automation',
      message: `Automation ${name} failed: ${err?.message || String(err)}`,
      owner_id: ownerId,
      metadata: { id, name, error: String(err) }
    });
    throw err;
  }
};
