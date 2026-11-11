import { createInsertSchema, createSelectSchema, createUpdateSchema } from 'drizzle-zod';
import * as schema from "hub:db:schema";

const { emails, sources, automations } = schema;

const sv_email = {
    insert: createInsertSchema(emails).omit({ createdAt: true, updatedAt: true }),
    select: createSelectSchema(emails),
    update: createUpdateSchema(emails).omit({ createdAt: true, updatedAt: true })
}

const sv_sources = {
    insert: createInsertSchema(sources).omit({ createdAt: true, updatedAt: true }),
    select: createSelectSchema(sources),
    update: createUpdateSchema(sources).omit({ createdAt: true, updatedAt: true }),
    prep: { json: ['settings', 'state'] }
}

const sv_automation = {
    insert: createInsertSchema(automations).omit({ createdAt: true, updatedAt: true }),
    select: createSelectSchema(automations),
    update: createUpdateSchema(automations).omit({ createdAt: true, updatedAt: true }),
    prep: { json: ['tasks', 'options'] }
}

export default {
    emails: sv_email,
    sources: sv_sources,
    automations: sv_automation,
};