import { db } from "hub:db";
import { llmCreateArtifacts } from "#server/db/schema";
import { zod_rules } from "#shared/rules/app/llm_create_artifact";
import { genericService } from "#layers/nuxt-base-app/server/services/generic";

class llmCreateArtifactsService extends genericService {
    async export(id?: string, stripFields: string[] = ['id', 'owner_id', 'createdAt', 'updatedAt'], transformFields: string[] = []) {
        return super.export(stripFields, transformFields, id);
    }

    async import(payload: any, transformFields: string[] = []) {
        return super.import(payload, transformFields);
    }
}

export const getService = async (ctx?: any) => {
    const ownerId = await resolveServiceContext(ctx);
    return new llmCreateArtifactsService(db, llmCreateArtifacts, zod_rules, ownerId);
}
