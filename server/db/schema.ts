import { sqliteTable, text, integer, uniqueIndex, index } from 'drizzle-orm/sqlite-core';
import type { MessageContent } from '#shared/types/email';

// --- Emails Table ---
// Columns: what is filtered, sorted or read by the engine. content: the structure (envelope, renditions, parts,
// embedded messages; shared/types/email.ts, docs/specs/SPEC_attachments.md).
export const emails = sqliteTable('emails', {
    id: text('id').primaryKey(),
    messageId: text('message_id').notNull(),
    owner_id: text('owner_id').notNull(),
    subject: text('subject'),
    from: text('from').notNull(),
    to: text('to').notNull(),
    text: text('text'),                                 // what automations read: built from the renditions and forwards
    date: text('date'),
    thread_id: text('thread_id'),                       // first of References, else In-Reply-To, else the message id
    size: integer('size'),                              // size of the original at the source (bytes)
    content: text('content', { mode: 'json' }).$type<MessageContent>(),
    staging_item: integer('staging_item').default(0), // 0 or 1
    source_id: text('source_id'),                       // the source that downloaded it (it prunes it); null: imported
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
}, (table) => [
    uniqueIndex('emails_owner_message_unique').on(table.owner_id, table.messageId)
]);

// --- Sources Table ---
// Where items come from (IMAP mailbox, staging, ...). See docs/specs/SPEC_sources.md.
export const sources = sqliteTable('sources', {
    id: text('id').primaryKey(),
    owner_id: text('owner_id').notNull(),
    name: text('name').notNull(),
    type: text('type').notNull(),                       // source type, e.g. 'imap', 'staging'
    type_version: integer('type_version').notNull().default(1),
    config: text('config'),                             // whole type config, encrypted (enc:...)
    // Non-secret saved data of the type (IMAP: { searches: [{ id, name, search }] })
    settings: text('settings', { mode: 'json' })
        .$type<Record<string, any>>()
        .default({}),
    // Runtime state of the type, written only by the type itself, never by the user or the form
    // (IMAP: { checkpoints: { '<key>': { last_uid, uidvalidity } } })
    state: text('state', { mode: 'json' })
        .$type<Record<string, any>>()
        .default({}),
    poll_seconds: integer('poll_seconds').default(60 * 60),   // pollable types only
    max_items_per_fetch: integer('max_items_per_fetch').default(50),
    // Pruning of what this source downloaded; 0 = no limit of its own (the SOURCE_* env caps still apply)
    retention_days: integer('retention_days').default(0),
    max_items: integer('max_items').default(0),
    max_size_mb: integer('max_size_mb').default(0),
    // When the source was last read without error (written by the engine; the poll schedule continues from it)
    last_successful_poll: integer('last_successful_poll', { mode: 'timestamp' }),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
}, (table) => [
    uniqueIndex('sources_owner_name_unique').on(table.owner_id, table.name)
]);

// --- Automations table ---
export const automations = sqliteTable('automations', {
    id: text('id').primaryKey(),
    owner_id: text('owner_id').notNull(),
    name: text('name').notNull(),
    active: integer('active').default(1), // 0 or 1 
    // What this automation subscribes to: a key decoded by the source type (staging '<source_id>',
    // IMAP '<source_id>:<folder>:<search_id>'); source_id is its first part, for lookups. May dangle after a source,
    // search or folder is gone (the automation then doesn't run).
    source_id: text('source_id'),
    source_key: text('source_key'),
    // Source-side settings: filter_prompt, mark_read, mark_important, add_source_links (see shared/types/automation_tasks.ts)
    options: text('options', { mode: 'json' })
        .$type<Record<string, any>>()
        .default({}),
    // TaskInstance[] (see jobs/automations/tasks/types.ts)
    tasks: text('tasks', { mode: 'json' })
        .$type<any[]>()
        .default([]),
    // Written by the engine (dashboard cards): when it last started, and its last warning or error. Kept here
    // because events are deleted (read ones nightly, all after the retention).
    last_run_at: integer('last_run_at', { mode: 'timestamp' }),
    last_issue_at: integer('last_issue_at', { mode: 'timestamp' }),
    last_issue_level: text('last_issue_level'),     // 'warn' | 'error'
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
}, (table) => [
    uniqueIndex('automations_owner_name_unique').on(table.owner_id, table.name)
]);

// --- Files table ---
// Every stored binary (artifacts; email attachments). The bytes are on disk under storage_key, reached only through
// server/services/app/files.ts. See docs/specs/SPEC_attachments.md.
export const files = sqliteTable('files', {
    id: text('id').primaryKey(),
    owner_id: text('owner_id').notNull(),
    storage_key: text('storage_key').notNull(),         // opaque, generated; never from user input
    mime: text('mime').notNull(),
    size: integer('size').notNull(),
    sha256: text('sha256').notNull(),
    filename: text('filename'),                         // display and download name only, never part of a path
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
}, (table) => [
    uniqueIndex('files_owner_sha256_unique').on(table.owner_id, table.sha256),   // dedup per owner only
]);

// --- Artifacts table ---
// What automations produced (delivered to the local channel or by a test run); the bytes are a file.
export const artifacts = sqliteTable('artifacts', {
    id: text('id').primaryKey(),
    owner_id: text('owner_id').notNull(),
    file_id: text('file_id').notNull(),
    filename: text('filename').notNull(),               // its own name: identical bytes share one file
    automation_id: text('automation_id'),               // null: unknown (a channel used outside an automation)
    label: text('label'),
    source_refs: text('source_refs', { mode: 'json' }).$type<string[]>().default([]),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
}, (table) => [
    index('artifacts_owner_idx').on(table.owner_id),
    index('artifacts_file_idx').on(table.file_id),
]);
