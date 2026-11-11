import { db } from "hub:db";
import { eq, and } from "drizzle-orm";
import { automations, sources } from "#server/db/schema";
import { notificationChannels } from "hub:db:schema";
import { validateTasks, getTaskDefinition } from "#server/jobs/automations";
import { getSourceClass, createSourceInstance, type BaseSource } from "#server/jobs/sources";
import { zod_rules } from "#shared/rules/app/automation";
import { genericService } from "#layers/nuxt-base-app/server/services/generic";

/** A request body must be one record (an object), not a list, text or null. */
const requireRecord = (body: unknown) => {
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
        throw createError({ status: 400, statusMessage: 'error automations.bad_payload' });
    }
};

// Option keys the engine handles for every source; the rest belongs to the source type (its optionsSchema).
const ENGINE_OPTIONS = ['filter_prompt', 'add_source_links'];

class automationsService extends genericService {
    /** Adds `filter_prompt` (its own form field, stored in options) and `source_label` (table text). */
    private normalize(res: any) {
        if (!res) return res;
        const norm = (item: any) => {
            if (item && !Array.isArray(item.tasks)) {
                item.tasks = [];
            }
            if (item && (!item.options || typeof item.options !== 'object')) {
                item.options = {};
            }
            if (item && item.active === undefined) {
                item.active = 1;
            }
            if (item) {
                item.filter_prompt = item.options.filter_prompt ?? '';
            }
            return item;
        };
        if (Array.isArray(res)) {
            return res.map(norm);
        }
        return norm(res);
    }

    /** Form fields back into the stored columns: source_id from the key, filter_prompt into options. */
    private unpackFormFields(body: any, existing?: any) {
        if (!body) return body;
        const { filter_prompt, source_label: _label, ...rest } = body;
        if (typeof rest.source_key === 'string') {
            rest.source_id = rest.source_key.split(':')[0];
        }
        if (filter_prompt !== undefined) {
            rest.options = { ...(rest.options ?? existing?.options ?? {}), filter_prompt: filter_prompt ?? '' };
        }
        return rest;
    }

    private async sourceRow(sourceId: string) {
        const query = this.user_id ? and(eq(sources.id, sourceId), eq(sources.owner_id, this.user_id)) : eq(sources.id, sourceId);
        return sourceId ? await this.db.select().from(sources).where(query).get() : undefined;
    }

    /** Engine options plus the options of the source's type, the latter checked by the type's schema. */
    private async filterOptions(body: any, existing?: any) {
        if (!body?.options || typeof body.options !== 'object') return;
        const source = await this.sourceRow(body.source_id ?? existing?.source_id);
        const definition = getSourceClass(source?.type || '')?.definition;
        if (!definition) return;
        const typeKeys = new Set(Object.keys(definition.optionsSchema.shape).filter((k) => !ENGINE_OPTIONS.includes(k)));
        const engine = Object.fromEntries(Object.entries(body.options).filter(([key]) => ENGINE_OPTIONS.includes(key)));
        const own = Object.fromEntries(Object.entries(body.options).filter(([key]) => typeKeys.has(key)));
        const res = definition.optionsSchema.safeParse(own);
        if (!res.success) throw createError({ status: 400, statusMessage: 'error automations.options.invalid', data: { issues: res.error.issues } });
        body.options = { ...engine, ...res.data };
    }

    private async rawRow(id: string) {
        const query = this.user_id ? and(eq(automations.id, id), eq(automations.owner_id, this.user_id)) : eq(automations.id, id);
        return await this.db.select().from(automations).where(query).get();
    }

    private async validateReferences(body: any, existing?: any) {
        const { source_key, tasks } = body;
        // Whose automation this is: the service's user, or (admin, all users) the automation's owner. Everything it
        // references (source, channels) must be that owner's.
        const owner = this.user_id ?? body.owner_id ?? existing?.owner_id;

        // On save the key must be usable; it may only dangle later (source, search or folder gone).
        // Folders are not checked here (that needs the server): a missing folder is reported by every poll.
        if (source_key !== undefined) {
            const source = await this.sourceRow(body.source_id);
            if (!source || (owner && source.owner_id !== owner)) {
                throw createError({ status: 400, statusMessage: "error automations.source_key.source_not_found" });
            }
            const instance = createSourceInstance(source);
            const problem = instance ? instance.keyProblem(source_key) : 'invalid';
            if (problem) {
                throw createError({ status: 400, statusMessage: `error automations.source_key.${problem}` });
            }
        }

        if (Array.isArray(tasks)) {
            // Task inputs are checked against what this source produces (its type's itemMime)
            const source = await this.sourceRow(body.source_id ?? existing?.source_id);
            const itemMime = getSourceClass(source?.type || '')?.definition.itemMime ?? null;
            const errors = validateTasks(tasks, itemMime);
            const [taskId, messages] = Object.entries(errors)[0] ?? [];
            if (taskId && messages?.length) {
                // The first problem as the message (an i18n key); all of them per task id in data
                throw createError({
                    status: 422,
                    statusMessage: `error ${messages[0]}`,
                    data: { field: `tasks.${taskId}`, errors }
                });
            }

            // Task arguments that name a notification channel (set_type 'channel'): one of the owner's channels
            for (const task of tasks) {
                for (const arg of getTaskDefinition(task?.type)?.args ?? []) {
                    const channelId = arg.set_type === 'channel' ? task.args?.[arg.key] : undefined;
                    if (!channelId) continue;
                    const channel = await this.db.select({ owner_id: notificationChannels.owner_id }).from(notificationChannels)
                        .where(eq(notificationChannels.id, String(channelId))).get();
                    if (!channel || (owner && channel.owner_id !== owner)) {
                        throw createError({ status: 422, statusMessage: 'error automations.tasks.channel_not_found', data: { field: `tasks.${task.id}` } });
                    }
                }
            }
        }
    }

    /**
     * Automation names are unique per user (case-insensitive); a taken name is refused, not renamed.
     * The owner is the service's user, or (admin, all users) the automation's owner.
     */
    private async checkNameFree(name: unknown, ownId?: string, ownerId?: string) {
        if (typeof name !== 'string' || !name.trim()) return;      // the name rule reports it
        const owner = this.user_id ?? ownerId;
        if (!owner) return;                                         // no owner: the owner_id rule reports it
        const wanted = name.trim().toLowerCase();
        const rows = await this.db.select({ id: automations.id, name: automations.name }).from(automations)
            .where(eq(automations.owner_id, owner));
        if (rows.some((r: any) => r.id !== ownId && String(r.name ?? '').trim().toLowerCase() === wanted)) {
            throw createError({ status: 422, statusMessage: 'error table.automation.rules.name.duplicate', data: { field: 'name' } });
        }
    }

    async read(id?: string) {
        return this.withSourceLabels(this.normalize(await super.read(id)));
    }

    /** Table text for the key, e.g. "Work mailbox › INBOX › Newsletters"; empty when the source is gone. */
    private async withSourceLabels(res: any) {
        const rows = Array.isArray(res) ? res : res ? [res] : [];
        if (rows.length === 0) return res;
        const query = this.user_id ? eq(sources.owner_id, this.user_id) : undefined;
        const instances = new Map<string, BaseSource | undefined>(
            (await this.db.select().from(sources).where(query)).map((row: any) => [row.id, createSourceInstance(row)]));
        for (const row of rows) {
            row.source_label = row.source_key ? instances.get(row.source_id)?.keyLabel(row.source_key) ?? '' : '';
        }
        return res;
    }

    async create(input: any, hooks?: any) {
        requireRecord(input);
        const body = this.unpackFormFields(input);
        await this.checkNameFree(body.name, undefined, body.owner_id);
        await this.validateReferences(body);
        await this.filterOptions(body);
        return this.normalize(await super.create(body, hooks));
    }

    async update(id: string, input: any, hooks?: any) {
        requireRecord(input);
        const existing = await this.rawRow(id);
        const body = this.unpackFormFields(input, existing);
        // Only a changed key is checked: the automation may dangle after its source, search or folder is gone
        if (body.source_key === existing?.source_key) {
            delete body.source_key;
            delete body.source_id;
        }
        if (body.name !== undefined) await this.checkNameFree(body.name, id, body.owner_id ?? existing?.owner_id);
        await this.validateReferences(body, existing);
        await this.filterOptions(body, existing);
        return this.normalize(await super.update(id, body, hooks));
    }

    /** Source ids differ between installations: the export names the source and keeps the rest of the key. */
    async export(
        id?: string,
        stripFields: string[] = ['id', 'owner_id', 'createdAt', 'updatedAt', 'source_label', 'filter_prompt'],
        transformFields: string[] = ['source_id', 'source_key']
    ) {
        const transformMap: Record<string, { exportKey?: string; fn: (val: any, record: any) => Promise<any> | any }> = {
            source_id: {
                exportKey: 'source_name',
                fn: async (val: string) => (await this.sourceRow(val))?.name ?? null,
            },
            source_key: {
                // staging: '', IMAP: ':INBOX:s_1a2b3c4d'
                exportKey: 'source_key_suffix',
                fn: (val: string, record: any) => (val && record.source_id ? val.slice(record.source_id.length) : null),
            },
        };

        return super.export(stripFields, transformFields, id, transformMap);
    }

    async import(
        payload: any,
        transformFields: string[] = ['source_id', 'source_key']
    ) {
        const transformMap: Record<string, { importKey?: string; fn: (val: any, record: any) => Promise<any> | any }> = {
            source_id: {
                importKey: 'source_name',
                fn: async (val: string) => {
                    if (!val) return null;
                    const byName = this.user_id ? and(eq(sources.name, val), eq(sources.owner_id, this.user_id)) : eq(sources.name, val);
                    const res = await this.db.select().from(sources).where(byName).get();
                    if (!res) {
                        throw createError({ status: 400, statusMessage: `error automations.source_key.source_not_found:${val}` });
                    }
                    return res.id;
                }
            },
            source_key: {
                importKey: 'source_key_suffix',
                fn: (val: string | null, record: any) => (record.source_id && val !== null && val !== undefined ? `${record.source_id}${val}` : null),
            },
        };

        return super.import(payload, transformFields, transformMap);
    }
}

export const getService = async (ctx?: any) => {
    const ownerId = await resolveServiceContext(ctx);
    return new automationsService(db, automations, zod_rules, ownerId);
}
