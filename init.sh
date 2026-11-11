# Clean-slate init for twinbox.
#
# WHY THIS SCRIPT EXISTS (NuxtHub bug, @nuxthub/core <= 0.10.8):
#   When the base layer is extended from GitHub (extends: ['github:mwolf-pi3g/nuxt-base-app']),
#   NuxtHub bundles the merged DB schema into .nuxt/hub/db/ as TWO files:
#     - schema.mjs          (app tables, imports the chunk below)
#     - schema-<hash>.mjs   (base layer tables: accounts, roles, ...)
#   NuxtHub then copies ONLY schema.mjs (+ schema.d.mts) into node_modules/@nuxthub/db/
#   (see node_modules/@nuxthub/core/dist/module.mjs, the copyFile calls in the
#   "app:templatesGenerated" hook and the schema watcher).
#   Result at runtime:
#     Cannot find module '.../node_modules/@nuxthub/db/schema-<hash>.mjs'
#       imported from .../node_modules/@nuxthub/db/schema.mjs
#   Extending from a local path does not produce the extra chunk, so this only bites with github: layers.
#
#   Upstream: https://github.com/nuxt-hub/core/issues/915 (open, no maintainer response as of 2026-10-07)
#   Related:  https://github.com/nuxt-hub/core/issues/852 (gh: layers under node_modules/.c12 break schema build)
#             https://github.com/nuxt-hub/core/issues/866 (.output/server/node_modules/@nuxthub/db may only
#             contain one layer's schema -> relevant for Docker/production builds)
#
#   Remove the `cp` step below once #915 is fixed upstream.

# Wipe local DB, build output and generated migrations
rm -rf .data .nuxt server/db/migrations
# Wipe cached github: layer (c12), stale NuxtHub db package and build caches
rm -rf node_modules/.c12/github_mwolf* node_modules/@nuxthub/db node_modules/.cache
npx nuxi prepare
npx nuxt db generate
npx nuxt db migrate
# npx drizzle-kit push # fixed by removing migrations in base layer
# WORKAROUND for nuxt-hub/core#915: copy the missing schema chunk(s) next to schema.mjs
cp .nuxt/hub/db/schema-* node_modules/@nuxthub/db
npx nuxi dev
