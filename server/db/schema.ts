import { sqliteTable, text, integer, check, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

// --- Emails Table ---
export const emails = sqliteTable('emails', {
    id: text('id').primaryKey(),
    messageId: text('message_id').notNull(),
    owner_id: text('owner_id').notNull(),
    subject: text('subject'),
    from: text('from').notNull(),
    to: text('to').notNull(),
    text: text('text'),
    html: text('html'),
    date: text('date'),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
}, (table) => [
    uniqueIndex('emails_owner_message_unique').on(table.owner_id, table.messageId)
]);

// --- Connections IMAP Table ---
export const connectionsIMAP = sqliteTable('connections_imap', {
    id: text('id').primaryKey(),
    owner_id: text('owner_id').notNull(),
    name: text('name').notNull(),
    host: text('host').notNull(),
    port: integer('port').notNull(),
    use_ssl: integer('use_ssl').default(1), // 0 or 1
    auth_type: text('auth_type').default('oauth'), // 'oauth' or 'login'
    username: text('username').notNull(),
    folders: text('folders', { mode: 'json' })
        .$type<string[]>()
        .default([]),
    config: text('config', { mode: 'json' }).$type<{ credential?: string; oauth_refresh_token?: string; oauth_token_expiry?: number }>(),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
}, (table) => [
    // Adds a native SQLite CHECK constraint to enforce port boundaries
    check('port_range_check', sql`${table.port} >= 1 AND ${table.port} <= 65535`)
]);

// --- IMAP Search Table ---
export const imapSearches = sqliteTable('imap_searches', {
    id: text('id').primaryKey(),
    owner_id: text('owner_id').notNull(),
    name: text('name').notNull(),
    search: text('search', { mode: 'json' })
        .$type<string[]>()
        .default([]),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
});

// --- LLM Filters Table ---
export const llmFilters = sqliteTable('llm_filters', {
    id: text('id').primaryKey(),
    owner_id: text('owner_id').notNull(),
    name: text('name').notNull(),
    prompt: text('prompt').notNull(),
    description: text('description').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
});

// --- LLM Create Artifacts Table ---
export const llmCreateArtifacts = sqliteTable('llm_create_artifacts', {
    id: text('id').primaryKey(),
    owner_id: text('owner_id').notNull(),
    name: text('name').notNull(),
    prompt: text('prompt').notNull(),
    description: text('description').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
});

// --- Automations table ---
export const automations = sqliteTable('automations', {
    id: text('id').primaryKey(),
    owner_id: text('owner_id').notNull(),
    name: text('name').notNull(),
    imap_connection_id: text('imap_connection_id').notNull(),
    imap_folder: text('imap_folder').notNull(),
    search_id: text('search_id'),
    llm_filter_id: text('llm_filter_id'),
    tasks: text('tasks', { mode: 'json' })
        .$type<{ multiple: boolean; tasks: [] }>()
        .default({ multiple: false, tasks: [] }),
    poll_seconds: integer('poll_seconds').default(60 * 60), // default 1 hour
    last_poll: integer('last_poll', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
});