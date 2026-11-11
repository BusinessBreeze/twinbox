// Applies the database migrations (NuxtHub's own migration code) to LIBSQL_URL, default ./.data/db/sqlite.db.
// Unlike `nuxt db migrate` it does not run `nuxt prepare`, which would restart a running dev server, and it works
// with the runtime database URL (see nuxt.config.ts). Used by `docker compose run --rm migrate` and the test setup.
// Needs .nuxt/hub/db/config.json (written by `nuxt prepare` / `nuxt build`) for the layers' migration folders.
import { readFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { drizzle } from 'drizzle-orm/libsql';
import { copyDatabaseMigrationsToHubDir, applyDatabaseMigrations } from '@nuxthub/core/db';

const dataDir = resolve(process.env.APP_DATA_DIR || '.data');
const url = process.env.LIBSQL_URL || `file:${join(dataDir, 'db/sqlite.db')}`;
const config = JSON.parse(readFileSync(resolve('.nuxt/hub/db/config.json'), 'utf8'));

mkdirSync(join(dataDir, 'db'), { recursive: true });   // libsql does not create folders
const hub = { ...config, dir: dataDir, db: { ...config.db, connection: { url } } };
const db = drizzle({ connection: { url } });

await copyDatabaseMigrationsToHubDir(hub);
const ok = await applyDatabaseMigrations(hub, db);
db.$client.close();
if (ok === false) process.exit(1);
console.log(`Migrations applied to ${url}`);
