// https://nuxt.com/docs/api/configuration/nuxt-config
import { mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'

// Data dir (sqlite DB, migrations copy). APP_DATA_DIR gives a test server its own throwaway database.
const dataDir = resolve(process.env.APP_DATA_DIR || '.data')
// The DB URL is read at runtime (LIBSQL_URL) instead of being baked into node_modules/@nuxthub/db, which all Nuxt
// processes of this folder share: a test server must not switch the dev server to its database.
// Production sets LIBSQL_URL in the Dockerfile.
process.env.LIBSQL_URL ||= `file:${join(dataDir, 'db/sqlite.db')}`
mkdirSync(join(dataDir, 'db'), { recursive: true })

export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  // The media viewer's renderers are classes, not components
  components: [{ path: '~/components', ignore: ['**/renderers/**'] }],
  devtools: { enabled: true },
  extends: [ // Managed by tools/release.mjs  DO NOT EDIT MANUALLY
    ['github:mwolf-pi3g/nuxt-base-app#v0.1.1', { install: true }],
    // Working on the base: use a local checkout instead (never commit it, image builds can't reach it)
    // '/home/mwolf/Desktop/Git/GITHUB/nuxt-base-app'
  ],
  ignore: [
    'app/schemas/fake_data.ts',
    'app/pages/index.vue',
    'server/api/v0.1/app/fake_data/**',
    'app/metadata/**',
    'server/db/validator/validator_app.ts'
  ],
  modules: ['nuxt-cron', 'vuetify-nuxt-module', '@nuxtjs/i18n', 'nuxt-auth-utils', '@nuxthub/core'],
  hub: {
    db: {
      dialect: 'sqlite',
      driver: 'libsql',                   // explicit libsql without a URL: db.mjs reads LIBSQL_URL at runtime
      applyMigrationsDuringBuild: false   // the build has no database; migrate with tools/db_migrate.mjs
    },
    dir: dataDir
  },
  hooks: {
    // DevTools' database studio connects with the configured URL. Set it only now, after NuxtHub wrote
    // node_modules/@nuxthub/db/db.mjs, which must stay URL-free (see LIBSQL_URL above).
    ready(nuxt) {
      const db = (nuxt.options.runtimeConfig as any).hub?.db
      if (db?.connection && !db.connection.url) db.connection.url = process.env.LIBSQL_URL
    }
  },
  runtimeConfig: {
    // Declared so NUXT_SESSION_COOKIE_SECURE=false can override it at runtime: h3 defaults the
    // session cookie to Secure, which browsers drop over plain HTTP (non-localhost) -> 403 after login.
    session: { cookie: { secure: true } }
  },
  nitro: {
    externals: {
      external: ['drizzle-orm', 'better-sqlite3'],
      // Bundle NuxtHub's generated DB package: 'hub:db:schema' resolves to @nuxthub/db/schema (bundled),
      // while db.mjs imports './schema.mjs' (externalized) -> RollupError in production builds.
      inline: ['@nuxthub/db']
    },
    // storage: {
    //   hub: {
    //     driver: 'fs',
    //     base: fileURLToPath(new URL('./.data/db', import.meta.url))
    //   }
    // },
    // alias: {
    //   '@nuxthub/db/schema': resolve('./.nuxt/hub/db/schema.mjs')
    // }
  },
  vite: {
    // One copy of Vue and Vuetify: the base layer, linked from a local checkout, has its own node_modules. Two copies
    // don't share state (e.g. a select's menu inside a dialog opened behind it).
    resolve: {
      dedupe: ['vue', 'vuetify'],
    },
    optimizeDeps: {
      // The media viewer's libraries are only reached from the artifacts and email pages; bundled at start, so the
      // dev server doesn't re-bundle (504 "Outdated Optimize Dep") when one of those pages is opened first
      include: ['drizzle-orm', 'better-sqlite3', 'dompurify', 'marked', 'postal-mime']
    },
  },
  i18n: {
    lazy: true,             // Best for performance: only loads the current language
    langDir: 'locales',     // Folder name
    locales: [
      { code: 'en', file: 'en.json', name: 'English' },
      { code: 'de', file: 'de.json', name: 'Deutsch' }
    ],
    defaultLocale: 'en',
    strategy: 'no_prefix',
    detectBrowserLanguage: {
      useCookie: true,
      cookieKey: 'i18n_redirected',
      alwaysRedirect: true
    }
  },
  vuetify: {
    moduleOptions: {
      /* module specific options */
    },
    vuetifyOptions: {
      theme: {
        defaultTheme: 'light',
        themes: {
          light: {
            colors: {
              primary: '#1976D2',
              secondary: '#424242',
              // Event levels (bell, dashboard events, readouts)
              info: '#1976D2',
              warning: '#FB8C00',
              error: '#E53935',
            },
          },
          dark: {
            colors: {
              primary: '#2196F3',
              secondary: '#424242',
            },
          },
        },
      },
    }
  }
})
