/**
 * WORKAROUND for NuxtHub bug: https://github.com/nuxt-hub/core/issues/915
 * (present in @nuxthub/core <= 0.10.8)
 *
 * When the base layer is extended from GitHub (`github:mwolf-pi3g/nuxt-base-app`),
 * NuxtHub bundles the merged DB schema into `.nuxt/hub/db/` as:
 *   - schema.mjs          (imports the chunk below)
 *   - schema-<hash>.mjs   (base layer tables: accounts, roles, ...)
 * but only copies `schema.mjs` / `schema.d.mts` into `node_modules/@nuxthub/db/`.
 * At runtime / during Nitro bundling this fails with:
 *   Cannot find module '.../node_modules/@nuxthub/db/schema-<hash>.mjs'
 *
 * This module mirrors every `schema-*` chunk next to `schema.mjs`:
 *   - once after NuxtHub's own copy (dev, build, prepare, Docker `npm run build`)
 *   - before the Nitro build (safety net)
 *   - in dev, whenever NuxtHub rebuilds the schema (its file watcher exposes no hook,
 *     so we watch `.nuxt/hub/db/` directly)
 * Stale `schema-*` chunks in the target are removed.
 *
 * Delete this file once #915 is fixed upstream.
 */
import { defineNuxtModule } from 'nuxt/kit'
import { copyFile, mkdir, readdir, unlink } from 'node:fs/promises'
import { existsSync, watch, type FSWatcher } from 'node:fs'
import { join } from 'node:path'

// Matches chunk files only (schema-<hash>.mjs / .d.mts), never schema.mjs itself
const CHUNK_RE = /^schema-[\w-]+\.(mjs|d\.mts)$/

export default defineNuxtModule({
  meta: { name: 'hub-schema-chunk-fix' },
  setup(_options, nuxt) {
    const sourceDir = join(nuxt.options.buildDir, 'hub/db')
    const targetDir = join(nuxt.options.rootDir, 'node_modules/@nuxthub/db')

    const sync = async () => {
      if (!existsSync(sourceDir)) return
      const chunks = (await readdir(sourceDir)).filter((f) => CHUNK_RE.test(f))
      await mkdir(targetDir, { recursive: true })

      for (const file of chunks) {
        await copyFile(join(sourceDir, file), join(targetDir, file))
      }

      // Remove chunks from previous schema builds
      for (const file of await readdir(targetDir)) {
        if (CHUNK_RE.test(file) && !chunks.includes(file)) {
          await unlink(join(targetDir, file)).catch(() => {})
        }
      }

      if (chunks.length) {
        console.info(`[hub-schema-chunk-fix] synced ${chunks.join(', ')} -> node_modules/@nuxthub/db`)
      }
    }

    const safeSync = () =>
      sync().catch((err) => console.warn('[hub-schema-chunk-fix] sync failed:', err))

    let watcher: FSWatcher | undefined

    // NuxtHub registers its build+copy hook (hookOnce 'app:templatesGenerated') inside
    // 'modules:done'. Registering ours inside 'modules:done' too guarantees it runs after.
    nuxt.hook('modules:done', () => {
      nuxt.hooks.hookOnce('app:templatesGenerated', async () => {
        await safeSync()

        if (nuxt.options.dev && !nuxt.options._prepare && !watcher && existsSync(sourceDir)) {
          let timer: ReturnType<typeof setTimeout> | undefined
          watcher = watch(sourceDir, (_event, filename) => {
            if (!filename || !filename.startsWith('schema')) return
            clearTimeout(timer)
            timer = setTimeout(safeSync, 200)
          })
          nuxt.hook('close', () => watcher?.close())
        }
      })
    })

    // Safety net: make sure chunks are in place before Nitro bundles @nuxthub/db
    nuxt.hook('nitro:build:before', safeSync)
  }
})
