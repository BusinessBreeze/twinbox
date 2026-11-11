# Drizzle ORM Workflow

This project uses **Drizzle ORM** with **NuxtHub (SQLite)** for persistence.

## Single Source of Truth

We maintain a single source of truth for all database tables and their corresponding validation schemas in:
`server/db/schema.ts`

### Unified Schema Architecture
1. **Drizzle Table**: Defined using `sqliteTable`.
2. **Zod Schema**: Auto-generated via `createInsertSchema` / `createSelectSchema`.
3. **Usage**: Shared across server-side code (Nitro) and client-side code (Vue components).

## Development Workflow

### Changing the Schema
If you need to add a field or create a new table:
1. Edit `server/db/schema.ts`.
2. Run database push to apply structural changes to local SQLite:
   ```bash
   npx drizzle-kit push
   ```
3. Update any corresponding service or API route.

### Inline Migrations
For production/boot, the `server/plugins/init.ts` plugin contains `CREATE TABLE IF NOT EXISTS` statements. This ensures that the environment is "self-healing" on boot. If you add a new table, ensure you add the corresponding `CREATE TABLE` raw SQL in `init.ts`.

## Developer Gotchas

### SQLite Data Types
* **Booleans**: SQLite doesn't have a native boolean type. Drizzle maps `integer('field')` to `number` (0 or 1). Our `db_*` wrappers handle some transparent conversion, but be mindful when writing raw queries.
* **Arrays/Objects**: Stored as `JSON TEXT`.
  * **Serialization**: Done automatically by the `db_create` and `db_update` wrappers.
  * **Deserialization**: Done automatically by the `db_read` and `db_findAll` wrappers.
  * **Reference**: If you use raw Drizzle `db.select()`, you MUST manually `JSON.parse` fields like `dow`, `app`, or `tags`.

### shared/ rules
Shared validation rules in `shared/rules/` now import directly from the Drizzle schema. Ensure these files remain "pure" and do not import any server-only logic or secrets.

### ID Generation
We use `crypto.randomUUID()` for all record IDs. This is handled centrally in the `dbCreate` wrapper.



### COMMANDS:
```
"npx nuxt db generate" - create migration for ALL LAYERS (will likely create duplicate table errors)
"npx drizzle-kit generate" - create LAYER SPECIFIC migration file 
"npx drizzle-kit push" - push LAYER SPECIFIC schema to database
"npx nuxt db migrate" - run migrations for CURRENT LAYER
??? "npx drizzle-kit migrate" - run migrations for LAYER SPECIFIC migration file 
```
