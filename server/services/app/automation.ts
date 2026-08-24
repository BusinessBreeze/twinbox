import { db } from "hub:db";
import { eq, and } from "drizzle-orm";
import { automations, connectionsIMAP, imapSearches, llmFilters, llmCreateArtifacts } from "#server/db/schema";
import { zod_rules } from "#shared/rules/app/automation";
import { genericService } from "#layers/nuxt-base-app/server/services/generic";

class automationsService extends genericService {
    private normalize(res: any) {
        if (!res) return res;
        const norm = (item: any) => {
            if (item && !item.tasks) {
                item.tasks = { multiple: false, tasks: [] };
            }
            return item;
        };
        if (Array.isArray(res)) {
            return res.map(norm);
        }
        return norm(res);
    }

    private async validateReferences(body: any) {
        const { imap_connection_id, search_id, llm_filter_id } = body;

        if (imap_connection_id) {
            const query = this.user_id 
                ? and(eq(connectionsIMAP.id, imap_connection_id), eq(connectionsIMAP.owner_id, this.user_id))
                : eq(connectionsIMAP.id, imap_connection_id);
            const connection = await this.db.select().from(connectionsIMAP).where(query).get();
            if (!connection) {
                throw createError({
                    status: 400,
                    statusMessage: "error automations.imap_connection_id.not_found"
                });
            }
        }

        if (search_id) {
            const query = this.user_id
                ? and(eq(imapSearches.id, search_id), eq(imapSearches.owner_id, this.user_id))
                : eq(imapSearches.id, search_id);
            const search = await this.db.select().from(imapSearches).where(query).get();
            if (!search) {
                throw createError({
                    status: 400,
                    statusMessage: "error automations.search_id.not_found"
                });
            }
        }

        if (llm_filter_id) {
            const query = this.user_id
                ? and(eq(llmFilters.id, llm_filter_id), eq(llmFilters.owner_id, this.user_id))
                : eq(llmFilters.id, llm_filter_id);
            const filter = await this.db.select().from(llmFilters).where(query).get();
            if (!filter) {
                throw createError({
                    status: 400,
                    statusMessage: "error automations.llm_filter_id.not_found"
                });
            }
        }
    }

    async read(id?: string) {
        return this.normalize(await super.read(id));
    }

    async create(body: any, hooks?: any) {
        await this.validateReferences(body);
        return this.normalize(await super.create(body, hooks));
    }

    async update(id: string, body: any, hooks?: any) {
        await this.validateReferences(body);
        return this.normalize(await super.update(id, body, hooks));
    }

    async export(
        id?: string,
        stripFields: string[] = ['id', 'owner_id', 'createdAt', 'updatedAt'],
        transformFields: string[] = ['imap_connection_id', 'search_id', 'llm_filter_id', 'tasks']
    ) {
        const transformMap: Record<string, { exportKey?: string; fn: (val: any, record: any) => Promise<any> | any }> = {
            imap_connection_id: {
                exportKey: 'imap_connection_name',
                fn: async (val: string) => {
                    if (!val) return null;
                    const query = this.user_id
                        ? and(eq(connectionsIMAP.id, val), eq(connectionsIMAP.owner_id, this.user_id))
                        : eq(connectionsIMAP.id, val);
                    const res = await this.db.select().from(connectionsIMAP).where(query).get();
                    return res ? (res.tag || res.username || res.host || res.id) : null;
                }
            },
            search_id: {
                exportKey: 'search_name',
                fn: async (val: string) => {
                    if (!val) return null;
                    const query = this.user_id
                        ? and(eq(imapSearches.id, val), eq(imapSearches.owner_id, this.user_id))
                        : eq(imapSearches.id, val);
                    const res = await this.db.select().from(imapSearches).where(query).get();
                    return res ? res.name : null;
                }
            },
            llm_filter_id: {
                exportKey: 'llm_filter_name',
                fn: async (val: string) => {
                    if (!val) return null;
                    const query = this.user_id
                        ? and(eq(llmFilters.id, val), eq(llmFilters.owner_id, this.user_id))
                        : eq(llmFilters.id, val);
                    const res = await this.db.select().from(llmFilters).where(query).get();
                    return res ? res.name : null;
                }
            },
            tasks: {
                exportKey: 'tasks',
                fn: async (tasksObj: any) => {
                    if (!tasksObj || !Array.isArray(tasksObj.tasks)) return tasksObj;
                    const clonedTasks = JSON.parse(JSON.stringify(tasksObj));
                    for (const t of clonedTasks.tasks) {
                        if (t.arguments && t.arguments.task_id) {
                            const query = this.user_id
                                ? and(eq(llmCreateArtifacts.id, t.arguments.task_id), eq(llmCreateArtifacts.owner_id, this.user_id))
                                : eq(llmCreateArtifacts.id, t.arguments.task_id);
                            const artifact = await this.db.select().from(llmCreateArtifacts).where(query).get();
                            if (artifact) {
                                t.arguments.task_name = artifact.name;
                                delete t.arguments.task_id;
                            }
                        }
                    }
                    return clonedTasks;
                }
            }
        };

        return super.export(stripFields, transformFields, id, transformMap);
    }

    async import(
        payload: any,
        transformFields: string[] = ['imap_connection_id', 'search_id', 'llm_filter_id', 'tasks']
    ) {
        const transformMap: Record<string, { importKey?: string; fn: (val: any, record: any) => Promise<any> | any }> = {
            imap_connection_id: {
                importKey: 'imap_connection_name',
                fn: async (val: string, record: any) => {
                    const lookupVal = val || record.imap_connection_id;
                    if (!lookupVal) return null;
                    const query = this.user_id
                        ? and(eq(connectionsIMAP.tag, lookupVal), eq(connectionsIMAP.owner_id, this.user_id))
                        : eq(connectionsIMAP.tag, lookupVal);
                    let res = await this.db.select().from(connectionsIMAP).where(query).get();
                    if (!res) {
                        const fallbackQuery = this.user_id
                            ? and(eq(connectionsIMAP.id, lookupVal), eq(connectionsIMAP.owner_id, this.user_id))
                            : eq(connectionsIMAP.id, lookupVal);
                        res = await this.db.select().from(connectionsIMAP).where(fallbackQuery).get();
                    }
                    if (!res) {
                        throw createError({
                            status: 400,
                            statusMessage: `error automations.imap_connection_id.not_found:${lookupVal}`
                        });
                    }
                    return res.id;
                }
            },
            search_id: {
                importKey: 'search_name',
                fn: async (val: string, record: any) => {
                    const lookupVal = val || record.search_id;
                    if (!lookupVal) return null;
                    const query = this.user_id
                        ? and(eq(imapSearches.name, lookupVal), eq(imapSearches.owner_id, this.user_id))
                        : eq(imapSearches.name, lookupVal);
                    let res = await this.db.select().from(imapSearches).where(query).get();
                    if (!res) {
                        const fallbackQuery = this.user_id
                            ? and(eq(imapSearches.id, lookupVal), eq(imapSearches.owner_id, this.user_id))
                            : eq(imapSearches.id, lookupVal);
                        res = await this.db.select().from(imapSearches).where(fallbackQuery).get();
                    }
                    if (!res) {
                        throw createError({
                            status: 400,
                            statusMessage: `error automations.search_id.not_found:${lookupVal}`
                        });
                    }
                    return res.id;
                }
            },
            llm_filter_id: {
                importKey: 'llm_filter_name',
                fn: async (val: string, record: any) => {
                    const lookupVal = val || record.llm_filter_name || record.llm_filter_id;
                    if (!lookupVal) return null;
                    const query = this.user_id
                        ? and(eq(llmFilters.name, lookupVal), eq(llmFilters.owner_id, this.user_id))
                        : eq(llmFilters.name, lookupVal);
                    let res = await this.db.select().from(llmFilters).where(query).get();
                    if (!res) {
                        const fallbackQuery = this.user_id
                            ? and(eq(llmFilters.id, lookupVal), eq(llmFilters.owner_id, this.user_id))
                            : eq(llmFilters.id, lookupVal);
                        res = await this.db.select().from(llmFilters).where(fallbackQuery).get();
                    }
                    if (!res) {
                        throw createError({
                            status: 400,
                            statusMessage: `error automations.llm_filter_id.not_found:${lookupVal}`
                        });
                    }
                    return res.id;
                }
            },
            tasks: {
                importKey: 'tasks',
                fn: async (tasksObj: any) => {
                    if (!tasksObj || !Array.isArray(tasksObj.tasks)) return tasksObj;
                    const clonedTasks = JSON.parse(JSON.stringify(tasksObj));
                    for (const t of clonedTasks.tasks) {
                        if (t.arguments && (t.arguments.task_name || t.arguments.task_id)) {
                            const lookupVal = t.arguments.task_name || t.arguments.task_id;
                            const query = this.user_id
                                ? and(eq(llmCreateArtifacts.name, lookupVal), eq(llmCreateArtifacts.owner_id, this.user_id))
                                : eq(llmCreateArtifacts.name, lookupVal);
                            let artifact = await this.db.select().from(llmCreateArtifacts).where(query).get();
                            if (!artifact) {
                                const fallbackQuery = this.user_id
                                    ? and(eq(llmCreateArtifacts.id, lookupVal), eq(llmCreateArtifacts.owner_id, this.user_id))
                                    : eq(llmCreateArtifacts.id, lookupVal);
                                artifact = await this.db.select().from(llmCreateArtifacts).where(fallbackQuery).get();
                            }
                            if (artifact) {
                                t.arguments.task_id = artifact.id;
                                delete t.arguments.task_name;
                            }
                        }
                    }
                    return clonedTasks;
                }
            }
        };

        return super.import(payload, transformFields, transformMap);
    }
}

export const getService = async (ctx?: any) => {
    const ownerId = await resolveServiceContext(ctx);
    return new automationsService(db, automations, zod_rules, ownerId);
}
