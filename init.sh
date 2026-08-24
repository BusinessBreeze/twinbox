rm -rf .data .nuxt server/db/migrations
rm -rf node_modules/.c12/github_mwolf* node_modules/@nuxthub/db node_modules/.cache
npx nuxi prepare
npx nuxt db generate
npx nuxt db migrate
# npx drizzle-kit push # fixed by removing migrations in base layer
cp .nuxt/hub/db/schema-* node_modules/@nuxthub/db
npx nuxi dev
