import { db } from "hub:db";
import { emails } from "#server/db/schema";
import { zod_rules } from "#shared/rules/app/email";
import { genericService } from "#layers/nuxt-base-app/server/services/generic";
import { simpleParser } from 'mailparser';
import { lt, and, eq, inArray } from 'drizzle-orm';
import { emitTelemetryEvent, EventScope, EventLevel } from '#bs/utils/telemetry/event';
import { userMetrics } from '#server/utils/telemetry/user';

class emailService extends genericService {
    async truncate() {
        const sevenDaysAgoMs = Date.now() - (7 * 24 * 60 * 60 * 1000);
        const sevenDaysAgo = new Date(sevenDaysAgoMs);

        let conditions: any = lt(this.table.createdAt, sevenDaysAgo);
        if (this.user_id) {
            conditions = and(conditions, eq(this.table.owner_id, this.user_id));
        }

        return await this.db.delete(this.table).where(conditions).returning();
    }

    // Override create 
    async create(stream: any) {
        const parsed = await simpleParser(stream);

        if (!parsed.messageId) {
            throw createError({
                statusCode: 400,
                statusMessage: 'error email.create.missing_message_id',
            });
        }

        const toAddress = parsed.to?.value?.[0]?.address;
        if (!toAddress) {
            throw createError({
                statusCode: 400,
                statusMessage: 'error email.create.missing_to_address',
            });
        }

        const fromAddress = parsed.from?.value?.[0]?.address;
        if (!fromAddress) {
            throw createError({
                statusCode: 400,
                statusMessage: 'error email.create.missing_from_address',
            });
        }

        // Re-map simpleParser result to our internal format
        const emailParsed = {
            messageId: parsed.messageId,
            to: toAddress,
            from: fromAddress,
            subject: parsed.subject || '',
            text: (parsed.html || "")
                .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '') // remove style tags & content
                .replace(/<[^>]*>/g, '') // remove html tags
                .replace(/&[a-z0-9#]{1,4};/gi, ' ') // remove html entities
                .replace(/\s+/g, ' ').trim() || parsed.text || '',  // remove extra spaces & newlines
            html: parsed.html || '',
            date: parsed.date?.toISOString() || new Date().toISOString(),
            headers: parsed.headers
        };

        const record = {
            owner_id: this.user_id,
            messageId: emailParsed.messageId,
            to: emailParsed.to,
            from: emailParsed.from,
            subject: emailParsed.subject,
            text: emailParsed.text,
            html: emailParsed.html,
            date: emailParsed.date || new Date().toISOString()
        };

        // Check if an email with the same messageId and owner_id already exists to prevent unique constraint violation
        await emitTelemetryEvent({
            scope: EventScope.SYSTEM,
            level: EventLevel.DEBUG,
            category: 'email',
            message: `Checking email exists`,
            metadata: { messageId: record.messageId, owner_id: this.user_id }
        });

        const existing = await this.db
            .select()
            .from(this.table)
            .where(
                and(
                    eq(this.table.messageId, record.messageId),
                    eq(this.table.owner_id, record.owner_id)
                )
            )
            .limit(1);

        if (existing && existing.length > 0) {
            await emitTelemetryEvent({
                scope: EventScope.SYSTEM,
                level: EventLevel.DEBUG,
                category: 'email',
                message: `Email exists. Skipping.`,
                metadata: { messageId: record.messageId, owner_id: record.owner_id }
            });
            return null;
        }

        try {
            const res = await super.create(record);
            if (res && this.user_id) {
                userMetrics.recordIngestedMail(this.user_id);
            }
            return res;
        } catch (err: any) {
            await emitTelemetryEvent({
                scope: EventScope.SYSTEM,
                level: EventLevel.ERROR,
                category: 'email',
                message: `Create failed (${record.messageId}): ${err?.message || String(err)}`,
                metadata: { messageId: record.messageId, owner_id: record.owner_id }
            });
            throw err;
        }
    }

    async setStaging(idOrIds: string | string[], stagingValue: number = 1) {
        const ids = Array.isArray(idOrIds) ? idOrIds : [idOrIds];
        if (ids.length === 0) return [];

        let conditions: any = inArray(this.table.id, ids);
        if (this.user_id) {
            conditions = and(conditions, eq(this.table.owner_id, this.user_id));
        }

        return await this.db.update(this.table)
            .set({ staging_item: stagingValue, updatedAt: new Date() })
            .where(conditions)
            .returning();
    }

    async export(id?: string, stripFields: string[] = ['id', 'owner_id', 'createdAt', 'updatedAt'], transformFields: string[] = []) {
        return super.export(stripFields, transformFields, id);
    }

    async import(payload: any, transformFields: string[] = []) {
        return super.import(payload, transformFields);
    }
}

export const getService = async (ctx?: any) => {
    const ownerId = await resolveServiceContext(ctx);
    return new emailService(db, emails, zod_rules, ownerId);
}