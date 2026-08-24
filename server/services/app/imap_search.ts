import { db } from "hub:db";
import { imapSearches } from "#server/db/schema";
import { zod_rules } from "#shared/rules/app/imap_search";
import { genericService } from "#layers/nuxt-base-app/server/services/generic";

class imapSearchesService extends genericService {
    private normalize(res: any) {
        if (!res) return res;
        const norm = (item: any) => {
            if (item && !item.search) {
                item.search = {};
            }
            return item;
        };
        if (Array.isArray(res)) {
            return res.map(norm);
        }
        return norm(res);
    }

    async read(id?: string) {
        const res = await super.read(id);
        return this.normalize(res);
    }

    async create(body: any, hooks?: any) {
        const res = await super.create(body, hooks);
        return this.normalize(res);
    }

    async update(id: string, body: any, hooks?: any) {
        const res = await super.update(id, body, hooks);
        return this.normalize(res);
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
    return new imapSearchesService(db, imapSearches, zod_rules, ownerId);
}
