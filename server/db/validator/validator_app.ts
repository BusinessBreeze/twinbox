import { createInsertSchema, createSelectSchema, createUpdateSchema } from 'drizzle-zod';
import * as schema from "hub:db:schema";

const { emails, connectionsIMAP, imapSearches, llmFilters, automations, llmCreateArtifacts } = schema;

const sv_email = {
    insert: createInsertSchema(emails).omit({ createdAt: true, updatedAt: true }),
    select: createSelectSchema(emails),
    update: createUpdateSchema(emails).omit({ createdAt: true, updatedAt: true })
}

const sv_connections_imap = {
    insert: createInsertSchema(connectionsIMAP).omit({ createdAt: true, updatedAt: true }),
    select: createSelectSchema(connectionsIMAP),
    update: createUpdateSchema(connectionsIMAP).omit({ createdAt: true, updatedAt: true }),
    prep: { json: ['config'] }
}

const sv_imap_search = {
    insert: createInsertSchema(imapSearches).omit({ createdAt: true, updatedAt: true }),
    select: createSelectSchema(imapSearches),
    update: createUpdateSchema(imapSearches).omit({ createdAt: true, updatedAt: true }),
    prep: { json: ['search'] }
}

const sv_llm_filter = {
    insert: createInsertSchema(llmFilters).omit({ createdAt: true, updatedAt: true }),
    select: createSelectSchema(llmFilters),
    update: createUpdateSchema(llmFilters).omit({ createdAt: true, updatedAt: true })
}

const sv_llm_create_artifact = {
    insert: createInsertSchema(llmCreateArtifacts).omit({ createdAt: true, updatedAt: true }),
    select: createSelectSchema(llmCreateArtifacts),
    update: createUpdateSchema(llmCreateArtifacts).omit({ createdAt: true, updatedAt: true })
}

const sv_automation = {
    insert: createInsertSchema(automations).omit({ createdAt: true, updatedAt: true, last_poll: true }),
    select: createSelectSchema(automations),
    update: createUpdateSchema(automations).omit({ createdAt: true, updatedAt: true, last_poll: true }),
    prep: { json: ['tasks'] }
}

export default {
    emails: sv_email,
    connections_imap: sv_connections_imap,
    imap_searches: sv_imap_search,
    llm_filters: sv_llm_filter,
    llm_create_artifacts: sv_llm_create_artifact,
    automations: sv_automation,
};