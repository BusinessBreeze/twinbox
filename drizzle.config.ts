import { defineConfig } from 'drizzle-kit';
import { fileURLToPath } from 'url'


export default defineConfig({
  schema: './server/db/schema.ts',
  out: './server/db/migrations',
  dialect: 'sqlite',
  dbCredentials: {
    url: './.data/db/db.sqlite',
    // url: fileURLToPath(new URL('./.data/db/db.sqlitee', import.meta.url)),
  },
});
