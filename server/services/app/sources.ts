// Sources CRUD (docs/specs/SPEC_sources.md): type validation, whole-config encryption with secret masking, type
// settings, the keys automations can subscribe to, deletion warnings, the lazily created built-in sources, and keeping
// the poll manager in sync.
import { notifyUser } from '#bs/utils/user_stream';
import { db } from "hub:db";
import { limits } from '#shared/limits';
import { and, eq } from "drizzle-orm";
import { sources, automations } from "#server/db/schema";
import { zod_rules } from "#shared/rules/app/sources";
import { sourceTypes } from "#shared/source_types";
import { genericService } from "#layers/nuxt-base-app/server/services/generic";
import { emitTelemetryEvent, EventScope, EventLevel } from "#bs/utils/telemetry/event";
import {
    getSourceClass, secretKeys, encryptConfig, decryptConfig, createSourceInstance,
    systemMaxItemsPerFetch,
    PRUNE_LIMIT_KEYS, systemPruneLimits, limitAboveCap,
} from "#server/jobs/sources";
import type { SourceKeyList } from "#shared/types/sources";
import { sourcePollManager } from "#server/jobs/cron/source_poll_manager";

/** A source that was deleted, as listeners get it. */
export interface DeletedSource { id: string; name: string; type: string; owner_id: string }

// Other parts of the app that reference sources (e.g. the IMAP notification channel) register here to warn their
// own records when a source is deleted; this service doesn't know them.
const deletedListeners: Array<(source: DeletedSource) => Promise<void>> = [];
export const onSourceDeleted = (listener: (source: DeletedSource) => Promise<void>) => { deletedListeners.push(listener); };

class sourcesService extends genericService {
    /** Live updates: the owner's sources table and dashboard cards reload. */
    private changed(ownerId?: string | null) {
        notifyUser(this.user_id ?? ownerId, 'sources');
    }

    /** What the browser gets: config without secret fields, no runtime state (the type's own). */
    private toClient(row: any) {
        if (!row) return row;
        const config = decryptConfig(row.config);
        for (const key of secretKeys(row.type)) delete config[key];
        const { state: _state, ...rest } = row;
        return { ...rest, config, settings: row.settings && typeof row.settings === 'object' ? row.settings : {} };
    }

    private async rawRow(id: string) {
        const query = this.user_id ? and(eq(sources.id, id), eq(sources.owner_id, this.user_id)) : eq(sources.id, id);
        return await this.db.select().from(sources).where(query).get();
    }

    private sourceClass(type: string) {
        const SourceCls = getSourceClass(type);
        if (!SourceCls) throw createError({ status: 400, statusMessage: 'error sources.type.unknown' });
        return SourceCls;
    }

    /** Stored config + changed fields; an empty secret field keeps the stored secret. */
    private mergeConfig(type: string, stored: Record<string, any>, incoming: Record<string, any> = {}) {
        const merged = { ...stored, ...incoming };
        for (const key of secretKeys(type)) {
            if (incoming[key] === undefined || incoming[key] === null || incoming[key] === '') merged[key] = stored[key];
        }
        return merged;
    }

    private validateConfig(type: string, config: Record<string, any>) {
        const res = this.sourceClass(type).definition.configSchema.safeParse(config);
        if (!res.success) {
            const issue = res.error.issues[0];
            const reason = issue?.message && /^[\w.]+$/.test(issue.message) ? issue.message : 'sources.config.invalid';
            throw createError({ status: 422, statusMessage: `error ${reason}`, data: { field: `config.${issue?.path.join('.')}`, issues: res.error.issues } });
        }
        return res.data;
    }

    private normalizeSettings(type: string, settings: any, existing: any = {}) {
        return this.sourceClass(type).normalizeSettings(settings ?? {}, existing ?? {});
    }

    private syncPollManager(row: any) {
        const instance = createSourceInstance(row);
        if (instance) sourcePollManager.register(instance);
    }

    private warn(message: string, ownerId: string, metadata: Record<string, unknown>) {
        return emitTelemetryEvent({ scope: EventScope.USER, level: EventLevel.WARN, category: 'source', message, owner_id: ownerId, metadata });
    }

    /** After an update: automations whose key just stopped working (e.g. its search was deleted) are warned once. */
    private async warnBrokenKeys(before: any, after: any) {
        const old = createSourceInstance(before);
        const now = createSourceInstance(after);
        if (!old || !now) return;
        const broken: string[] = [];
        for (const automation of await this.db.select().from(automations).where(eq(automations.source_id, after.id))) {
            const key = automation.source_key || '';
            if (old.keyProblem(key) || !now.keyProblem(key)) continue;
            broken.push(key);
            await this.warn('events.user.warn_source_key_broken_automation', automation.owner_id, { name: automation.name, source: after.name });
        }
        if (broken.length) await now.forgetKeys(broken);
    }

    private async warnOrphans(sourceRow: any) {
        for (const automation of await this.db.select().from(automations).where(eq(automations.source_id, sourceRow.id))) {
            await this.warn('events.user.warn_source_deleted_automation', automation.owner_id, { name: automation.name, source: sourceRow.name });
        }
        const deleted: DeletedSource = { id: sourceRow.id, name: sourceRow.name, type: sourceRow.type, owner_id: sourceRow.owner_id };
        for (const listener of deletedListeners) await listener(deleted);
    }

    /** No source fetches more, or keeps more, than the system allows (pruning caps from SOURCE_* env, 0 = none). */
    private checkLimits(body: any) {
        const fetch = body?.max_items_per_fetch;
        if (fetch !== undefined && fetch !== null && Number(fetch) > systemMaxItemsPerFetch()) {
            throw createError({ status: 400, statusMessage: 'error sources.max_items_per_fetch.too_high', data: { max: systemMaxItemsPerFetch() } });
        }
        const above = limitAboveCap(body || {}, systemPruneLimits());
        if (above) {
            throw createError({ status: 400, statusMessage: `error sources.${above}.too_high`, data: { max: systemPruneLimits()[above] } });
        }
    }

    /** One source of every built-in type (staging), created the first time a user's sources are listed. */
    async ensureBuiltins() {
        if (!this.user_id) return;
        for (const definition of sourceTypes.filter((t) => t.builtin)) {
            const existing = await this.db.select().from(sources)
                .where(and(eq(sources.owner_id, this.user_id), eq(sources.type, definition.type))).get();
            if (existing) continue;
            await super.create({
                name: definition.defaultName || definition.type,
                type: definition.type,
                config: encryptConfig({}),
                settings: {},
                max_items_per_fetch: systemMaxItemsPerFetch(),
            });
        }
    }

    async read(id?: string) {
        if (!id) await this.ensureBuiltins();
        const res = await super.read(id);
        return Array.isArray(res) ? res.map((r) => this.toClient(r)) : this.toClient(res);
    }

    async create(body: any, hooks?: any) {
        const SourceCls = this.sourceClass(body?.type);
        if (SourceCls.definition.builtin) throw createError({ status: 400, statusMessage: 'error sources.type.builtin' });
        this.checkLimits(body);
        const config = this.validateConfig(body.type, body.config || {});
        const { last_successful_poll: _p, ...fields } = body || {};    // written by the engine only
        const row = await super.create({
            // Defaults from limits (app_defaults.json); the form sends its own
            poll_seconds: limits.sources.default_poll_seconds,
            max_items_per_fetch: systemMaxItemsPerFetch(),
            ...fields,
            type_version: SourceCls.definition.version,
            config: encryptConfig(config),
            settings: this.normalizeSettings(body.type, SourceCls.newSettings(body.settings ?? {})),
            state: {},                                  // the type's own runtime state, never from the client
        }, hooks);
        this.syncPollManager(row);
        this.changed(row?.owner_id);
        return this.toClient(row);
    }

    async update(id: string, body: any, hooks?: any) {
        const existing = await this.rawRow(id);
        if (!existing) throw createError({ status: 404, statusMessage: 'error sources.not_found' });
        this.checkLimits(body);
        // Built-in sources: only the fetch and pruning limits can be changed
        if (getSourceClass(existing.type)?.definition.builtin) {
            const limits = Object.fromEntries(['max_items_per_fetch', ...PRUNE_LIMIT_KEYS]
                .filter((key) => body?.[key] !== undefined && body?.[key] !== null).map((key) => [key, Number(body[key])]));
            if (Object.keys(limits).length === 0) return this.toClient(existing);
            const row = await super.update(id, limits, hooks);
            this.syncPollManager(row);
            this.changed(existing.owner_id);
            return this.toClient(row);
        }

        const type = body?.type || existing.type;
        const stored = type === existing.type ? decryptConfig(existing.config) : {};
        const config = this.validateConfig(type, this.mergeConfig(type, stored, body?.config));
        const oldSettings = existing.settings && typeof existing.settings === 'object' ? existing.settings : {};
        const settings = body?.settings ? this.normalizeSettings(type, body.settings, oldSettings) : oldSettings;

        // state and last_successful_poll are the engine's (runtime); the form never writes them
        const { createdAt: _c, updatedAt: _u, state: _s, last_successful_poll: _p, ...rest } = body || {};
        const row = await super.update(id, { ...rest, type, config: encryptConfig(config), settings }, hooks);
        await this.warnBrokenKeys(existing, row);
        this.syncPollManager(row);
        this.changed(existing.owner_id);
        return this.toClient(row);
    }

    async delete(id: string) {
        const existing = await this.rawRow(id);
        if (!existing) return null;
        if (getSourceClass(existing.type)?.definition.builtin) return this.toClient(existing);   // built-in: no-op
        await this.warnOrphans(existing);
        sourcePollManager.unregister(id);
        const deleted = await super.delete(id);
        this.changed(existing.owner_id);
        return this.toClient(deleted);
    }

    async deleteMany(ids: string[]) {
        const deleted = [];
        for (const id of ids) deleted.push(await this.delete(id));
        return deleted.filter(Boolean);
    }

    /** Config for the connection test from form data: stored secrets fill in what the form doesn't send. */
    private async formConfig(body: any) {
        const existing = body?.id ? await this.rawRow(body.id) : null;
        const type = body?.type || existing?.type;
        const stored = existing && existing.type === type ? decryptConfig(existing.config) : {};
        return { type, config: this.validateConfig(type, this.mergeConfig(type, stored, body?.config)) };
    }

    async test(body: any) {
        const { type, config } = await this.formConfig(body);
        const result = await this.sourceClass(type).test(config);
        await emitTelemetryEvent({
            scope: EventScope.USER,
            level: result.ok ? EventLevel.INFO : EventLevel.ERROR,
            category: 'source',
            message: result.ok ? 'events.user.info_source_test_ok' : 'events.user.error_source_test_failed',
            owner_id: this.user_id,
            metadata: { source: body?.name || type, source_id: body?.id, reason: result.reason || '' },
        });
        return result;
    }

    /** "Run now": every key of the source with a subscribed automation. */
    async runNow(id: string) {
        const row = await this.rawRow(id);
        if (!row) throw createError({ status: 404, statusMessage: 'error sources.not_found' });
        const instance = createSourceInstance(row);
        if (!instance) throw createError({ status: 400, statusMessage: 'error sources.type.unknown' });
        await instance.runSubscribed();
        return { started: true };
    }

    /**
     * Everything the user's automations can subscribe to right now (IMAP: live folders × saved searches).
     * A source that can't be listed (server down) is reported in `unavailable` instead of failing the whole list.
     */
    async keys(): Promise<SourceKeyList> {
        await this.ensureBuiltins();
        const rows = (await super.read()) as any[];
        const list: SourceKeyList = { keys: [], unavailable: [] };
        await Promise.all((Array.isArray(rows) ? rows : [rows]).filter(Boolean).map(async (row) => {
            const instance = createSourceInstance(row);
            if (!instance) return;
            try {
                list.keys.push(...await instance.keys());
            } catch (err: any) {
                list.unavailable.push({ source_id: row.id, name: row.name, reason: String(err?.message || err).slice(0, 200) });
            }
        }));
        list.keys.sort((a, b) => a.label.localeCompare(b.label));
        return list;
    }

    /** Backup without secrets: they have to be entered again after an import. */
    async export() {
        const rows = (await super.read()) as any[];
        return (Array.isArray(rows) ? rows : [rows])
            .filter((r) => r && !getSourceClass(r.type)?.definition.builtin)
            .map((r) => {
                const { id: _i, owner_id: _o, createdAt: _c, updatedAt: _u, config: _cfg, ...rest } = this.toClient(r);
                return { ...rest, config: this.toClient(r).config };
            });
    }

    async import(payload: any) {
        const list = Array.isArray(payload) ? payload : [payload];
        const created = [];
        for (const item of list) {
            const SourceCls = getSourceClass(item?.type);
            if (!SourceCls || SourceCls.definition.builtin) continue;
            created.push(this.toClient(await super.create({
                name: item.name,
                type: item.type,
                type_version: SourceCls.definition.version,
                config: encryptConfig(item.config || {}),        // without secrets; enter them again to use the source
                // keep the exported ids (IMAP search ids): imported automations' keys reference them
                settings: this.normalizeSettings(item.type, item.settings, item.settings),
                poll_seconds: item.poll_seconds,
                max_items_per_fetch: item.max_items_per_fetch,
                retention_days: item.retention_days,
                max_items: item.max_items,
                max_size_mb: item.max_size_mb,
            })));
        }
        if (created.length > 0) this.changed(created[0]?.owner_id);
        return created;
    }
}

export const getService = async (ctx?: any) => {
    const ownerId = await resolveServiceContext(ctx);
    return new sourcesService(db, sources, zod_rules, ownerId);
};
