import { db } from "hub:db";
import { connectionsIMAP } from "#server/db/schema";
import { zod_rules } from "#shared/rules/app/connections_imap";
import { genericService } from "#layers/nuxt-base-app/server/services/generic";
import { getFolderList } from "#server/utils/imap/getFolderList";
import { encryptObject, decryptObject } from "#server/utils/crypto/simple";

const CONFIG_KEYS = ['credential', 'oauth_refresh_token', 'oauth_token_expiry'] as const;

export function decryptConfig(config: any) {
    return decryptObject(config, CONFIG_KEYS);
}

class connectionsIMAPService extends genericService {
    private encryptConfig(config: any) {
        return encryptObject(config, CONFIG_KEYS);
    }

    private decryptConfig(config: any) {
        return decryptConfig(config);
    }

    private normalize(res: any) {
        if (!res) return res;
        const norm = (item: any) => {
            if (item) {
                if (!item.config) {
                    item.config = {};
                } else {
                    item.config = this.decryptConfig(item.config);
                }
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
        try {
            body.folders = await getFolderList(body);
        } catch (e) {
            console.error("Failed to fetch folders during creation", e);
        }

        const createBody = { ...body };
        if (createBody.config) {
            createBody.config = this.encryptConfig(createBody.config);
        }

        const res = await super.create(createBody, hooks);
        return this.normalize(res);
    }

    async update(id: string, body: any, hooks?: any) {
        try {
            const existing = await this.read(id);
            const merged = { ...existing, ...body };
            body.folders = await getFolderList(merged);
        } catch (e) {
            console.error("Failed to fetch folders during update", e);
        }

        const updateBody = { ...body };
        if (updateBody.config) {
            updateBody.config = this.encryptConfig(updateBody.config);
        }

        const res = await super.update(id, updateBody, hooks);
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
    return new connectionsIMAPService(db, connectionsIMAP, zod_rules, ownerId);
}
