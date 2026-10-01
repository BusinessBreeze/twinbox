// https://nuxt.com/docs/api/configuration/nuxt-config

export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  // extends: ['../nuxt-base-app'],
  extends: [
    //'github:mwolf-pi3g/nuxt-base-app',
    // '/home/mwolf/Desktop/test/nuxt-base-app'
    '/home/mwolf/Desktop/Git/GITHUB/nuxt-base-app'
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
    db: 'sqlite'
  },
  nitro: {
    externals: {
      external: ['drizzle-orm', 'better-sqlite3']
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
    optimizeDeps: {
      include: ['drizzle-orm', 'better-sqlite3']
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
