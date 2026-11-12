# SPEC: Sources, Keys and the Poll Manager

Status: implemented. Replaces `connections_imap`, `imap_searches` and per-automation polling.

## 1. Goal

Separate **where items come from** (sources) from **what is done with them** (automations).

- A **source** is a typed, credentialed record (today: IMAP, staging; later e.g. RSS, Gmail API, SMTP push).
  It replaces "connections" everywhere: table, API, UI, code.
- **Automations subscribe to a key.** A key starts with the source id; the source's class decodes the rest into
  what to fetch. Staging: `<sourceId>`. IMAP: `<sourceId>:<folder>:<searchId>`, the delimiters always kept
  (`<sourceId>:INBOX:` = the whole folder, no search). One run of a source serves every automation subscribed to
  any of its keys.
- Each source record lives as one **source instance**: an object of its type's class, which extends
  **`BaseSource`**. The base class carries the shared behavior (start a run, due check, keys, start/stop); a type
  overrides only what it needs.
- The **source poll manager** (`server/jobs/cron/source_poll_manager.ts`) is the scheduler for sources, and only
  for them. It gets one tick per minute from the real cron and keeps all scheduling state in memory: it polls each
  pollable source when its `poll_seconds` have passed and tells every source to **prune** every `limits.sources.prune_every_hours` (default 24).
- **Each source polices what it downloaded**: `prune()` deletes its own stored items beyond its limits.
- Push-capable types (later: IMAP IDLE, SMTP) start their own runs.

## 2. Terms

| Term | Meaning | Example (IMAP) |
|---|---|---|
| source | record: `type`, encrypted `config`, `settings`, poll interval, fetch limit | "Work mailbox" (host, user, credential), every 600 s |
| source type | class extending `BaseSource`, registered at startup | `ImapSource` |
| source instance | object of the type's class for one source record | the "Work mailbox" object |
| settings | non-secret saved data of a source, shape defined by its type | IMAP: named searches `[{ id, name, search }]`, `download_attachments` |
| key | what an automation subscribes to; decoded by the type | `<id>:INBOX:s_1a2b3c4d` = INBOX + search "Unread" |
| source run | fetch every due key of a source → subscribed automations → completion | |

Folders are not stored: IMAP has no stable folder id (no `OBJECTID`/MAILBOXID on our server), so the key names
the folder. A folder renamed or deleted on the server is an accepted edge case: every poll reports it (section 6),
the user re-points the affected automations.

## 3. Code structure

```
server/cron/source_poll_manager.ts    the real cron's only job for sources: every minute → sourcePollManager.tick()
server/plugins/sources.ts             boot: setSourceHooks({ run, subscribedKeys }), sourcePollManager.start()
server/queue/                         generic in-memory queue (unchanged)
server/jobs/
  cron/source_poll_manager.ts         sourcePollManager { start, register, unregister, tick }: scheduling state
                                      (last poll, last prune per source) in memory
  sources/                            source layer (no automation knowledge)
    limits.ts                         pruning limits: own values capped by SOURCE_* env (pure, unit-tested)
    base_source.ts                    BaseSource: shared instance behavior (section 3a)
    registry.ts                       type → class, static imports, config encryption helpers, createSourceInstance
    types/email/                      shared by the email-producing types (toEmailItem, emailUrl, pruneEmails);
                                      not a type
    types/imap/                       IMAP type: client setup (single place), test, folders, keys, saved searches,
                                      fetchSince, addFlags, append, relative search dates  (all of utils/imap);
                                      public.ts = what the rest of the app may use (exported as `imap`)
    types/staging/                    built-in type without config or settings: staged emails of the owner
  automations/                        engine (filter, tasks, runner) fed by source runs; no IMAP, no cron
server/services/app/sources.ts        CRUD (genericService like the other app services): type validation, config
                                      encryption + secret masking, settings, key list, deletion warnings, lazy
                                      staging source, test/run-now; keeps the source poll manager in sync
shared/source_types/                  each type's facts and config rules, imported by the app and the server
shared/types/sources.ts               SourceType, key list
app/schemas/source_types/             each type's form parts: config headers, settings fields, automation options
tools/db_migrate.mjs                  applies the migrations to LIBSQL_URL without `nuxt prepare`
```

`server/utils/imap/` is removed (moved into `jobs/sources/types/imap/`); `staging_poll.ts` is deleted (dead
since the task refactor). `server/cron/imap_tick.ts` and the automation producer's due logic are replaced.
`server/cron/truncate_email.ts` (per-account pruning by plan) is replaced by the sources' `prune()`.
`server/cron/system_metrics.ts` is a separate subsystem and stays as it is.

## 3a. BaseSource and the source poll manager

```ts
abstract class BaseSource {                  // one instance per source record; types extend it (like BaseTask)
  static definition                          // type, version, title, schemas, fields (section 4)
  static normalizeSettings(settings, stored) // validate settings before saving (IMAP: search ids, unique names)
  constructor(record)                        // the source record (config decrypted)
  get id(); get record()                     // read access, state kept private

  keys(): Promise<SourceKeyOption[]>         // what can be subscribed to now; default [{ key: id }] (staging)
  parseKey(key)                              // the key's parts or null; default: key === id
  keyProblem(key): string | null             // checked on save without the server: 'invalid', 'search_deleted'
  keyLabel(key): string                      // table label without the server, e.g. "Work mailbox › INBOX › Unread"

  run(keys): void                            // enqueue a source run on server/queue under 'source:<id>'
                                             // (no overlapping runs); used by the source poll manager, push
                                             // listeners and "run now"
  subscribedKeys(): Promise<string[]>        // keys with ≥1 active automation (account not paused)
  runSubscribed(): void                      // run(subscribedKeys()): polls and "run now"
  prune(): Promise<number>                   // delete own downloaded items beyond pruneLimits; default no-op
  get pruneLimits()                          // own retention_days / max_items / max_size_mb, capped by SOURCE_* env
  start?(): Promise<void>                    // push types only: open listeners (later IMAP IDLE) that call run()
  stop?(): Promise<void>

  get maxItems()                             // max_items_per_fetch, never above the system limit
  protected abstract fetch(keys)             // per-type run steps, called by the source run (section 6)
  afterFilter(results)                       // default no-op; IMAP: mark read / important (section 6)
  afterTasks(results)                        // default no-op; IMAP: copy / move to a folder (section 6)
  protected abstract complete()
}
```

**Source poll manager** (`server/jobs/cron/source_poll_manager.ts`): generic over source types, knows nothing about
IMAP or automations. All scheduling state lives here, in memory.

```ts
sourcePollManager.start()                    // boot: an instance for every source record
sourcePollManager.register(instance) / unregister(id)  // by the sources service on create / update / delete
sourcePollManager.tick(now)                  // every minute, from server/cron/source_poll_manager.ts:
                                             //   pollable and poll_seconds passed → runSubscribed()
                                             //   a day since the last prune      → prune()
```

- Staging is not pollable (it runs on demand); it is registered for pruning.
- After a restart the poll schedule continues from each source's `last_successful_poll` (a source never read polls on the next tick); every source prunes; missed runs are not made up.
- Errors in one instance are logged and never stop the tick for the others.

## 4. Source type class (extends BaseSource)

```ts
static definition = {                                     // data, like task definitions
  ...sharedType,                                          // shared/source_types/<type>.ts, also imported by the app:
                                                          //   type, version, title (i18n key), pollable, builtin,
                                                          //   defaultName?, itemMime, secretKeys, configSchema
  settingsSchema                                          // non-secret saved data (IMAP: searches)
  optionsSchema                                           // the type's own automation option keys (IMAP: mark_read,
                                                          // mark_important, copy_to, move_to); engine options are separate
}
static migrate?(config, settings, fromVersion)            // upgrade stored config/settings when version increases
static test(config): Promise<{ ok: boolean; reason?: string }>
static listResources(config): Promise<Resource[]>         // IMAP folders (key list, IMAP notification channel)

protected fetch(keys): Promise<Map<key, TaskItem[]>>      // new items per key since its checkpoint,
                                                          // at most max_items_per_fetch; session closed after
afterFilter(results): Promise<void>                       // after the filter, per automation { options, refs }: the type
                                                          // acts on its own options (IMAP: mark read / important,
                                                          // one short session); the engine never interprets them
afterTasks(results): Promise<void>                        // after the tasks, the same results: the last thing done on
                                                          // the source (IMAP: copy / move, one short session)
protected complete(): Promise<void>                       // store all fetched items, save how far it got
                                                          // (IMAP: checkpoints in its state)
getState(key) / setState(key, value)                      // the type's runtime state (sources.state), see section 5
forgetKeys(keys)                                          // drop state kept for keys that broke (IMAP: checkpoints)
```

Only what the form shows while typing is shared: the facts and the field rules of the config (and the IMAP search
name). Checks across fields or against the database (duplicate search names, stored secrets, search ids, the since
date of new searches) are the class's. How the forms look is the app's alone (`app/schemas/source_types/<type>.ts`:
config headers with rules from the shared zod, settings fields, automation options); no route describes a type.

IMAP keys: the source id runs up to the first `:`, the search id follows the last `:`, everything in between is the
folder (folder names may contain `:`). `keys()` lists every folder on the server, alone and with each saved search.

Everything else a type can do (`fetchSince`, `addFlags`, `append`) is private to the server; the IMAP
notification channel imports the IMAP type's `append` directly.

## 5. Data model

- `sources`: `id, owner_id, name, type, type_version, config` (whole config encrypted), `settings` (JSON, not
  encrypted; IMAP `{ searches: [{ id, name, search }] }`, search ids `s_xxxxxxxx` generated once),
  `poll_seconds` (pollable types), `max_items_per_fetch` (default from
  `app_defaults.limits.automation.max_emails_per_fetch`), pruning limits `retention_days, max_items, max_size_mb`
  (0 = none of its own), `created_at, updated_at`; unique `(owner_id, name)`.
- `emails.source_id`: the source that downloaded the email (it prunes it); null for imports (staging prunes those).
- Migrations: `0001` adds the limits and `emails.source_id`, `0002` drops `sources.last_poll` (scheduling state
  is the source poll manager's).
- `sources.state` (JSON): the type's own runtime state, written only by the type (`getState`/`setState`), never by
  the sources service or the form, and never sent to the browser. Runs of one source are serialized by the queue, so
  its read-modify-write can't lose an update. IMAP: `{ checkpoints: { "<key>": { last_uid, uidvalidity } } }`;
  staging: nothing. (Replaces the `checkpoints` table, which only IMAP used; migration `0003` moved its rows here.)
- `automations`: `source_key` (the key) and `source_id` (its first part, set by the service, for lookups); removes
  `imap_connection_id, imap_folder, search_id, poll_seconds, last_poll, last_uid`. Keeps `options` and `tasks`.
- Removed: `connections_imap`, `imap_searches` (searches live in the IMAP source's settings).
- Staging: one `staging` source per user (no config, no settings), created lazily the first time the sources
  list, the key list or the automation form is loaded. Its only key is its id.
- IMAP notification channel (twinbox provider `notification_imap.ts`, registered into base-app's provider
  registry; config stored in base-app's `notification_channels`): `record_id` points to `sources.id`. Its form
  schema (`getSchemas()`) lists the user's IMAP sources and gets each one's folders **live** via the IMAP type's
  `listResources()` (one IMAP connection per source whenever the channel form loads; no cached folder list).
- The database URL is read at runtime (`LIBSQL_URL`, default `file:<APP_DATA_DIR or .data>/db/sqlite.db`), so
  several Nuxt processes of one folder (dev server, test server) can use their own databases.

## 6. Source run

1. **Tick** (real cron → source poll manager, every minute): a pollable source whose `poll_seconds` have passed is
   started with `runSubscribed()`, queued under `source:<source_id>` (no overlapping runs of one source).
2. **Fetch**: `fetch(keys)` new items of each due key since its checkpoint, limited to `max_items_per_fetch`;
   the IMAP session is closed afterwards. IMAP lists the folders first: a key whose folder doesn't exist
   (renamed or deleted on the server) produces a warning on **every poll** and is skipped; the other keys run.
   Only the body and the wanted attachments are downloaded (the source's `download_attachments` setting, when the
   server allows attachments; see `docs/specs/SPEC_attachments.md` 7d), up to `limits.imap.max_email_mb` (default
   10) of what is downloaded; a larger one is not downloaded, moves the checkpoint and produces a warning
   (`warn_source_email_too_large`). Each email is parsed and built once here (`buildEmail`): its automation text
   feeds the filter and tasks, the built structure is stored in step 7.
3. **Filter** per subscribed automation (LLM, no open IMAP session). The LLM gets at most `limits.llm.max_input_chars`
   of an email (the same cut applies to the artifact task): a long email is judged on its beginning.
4. **After the filter**: `afterFilter()` gets each automation's options and the items that passed; the type acts on
   its own options (IMAP: mark read / important, one short second session).
5. **Tasks** per automation → outcomes.
6. **After the tasks**, last: `afterTasks()` gets the same results as step 4 (the filter's outcome, not the tasks').
   IMAP copies the passed emails to `copy_to` and moves them to `move_to` (folders of the same account), one short
   session, copies before moves. Every done copy and move is an info event with the emails (`info_source_copied`,
   `info_source_moved`). Moves need the server's MOVE extension (RFC 6851): without it nothing is moved
   (`warn_source_move_unsupported`), since imapflow's fallback (COPY, `\Deleted`, EXPUNGE) can expunge other
   messages flagged `\Deleted` in the folder. A missing destination (`warn_source_target_folder_missing`), an email
   two automations move to different folders (not moved, `warn_source_move_conflict`) and a refused command
   (`warn_source_transfer_failed`) are reported; nothing is ever deleted.
7. **Complete**: store all fetched emails (and their attachments, as 4a/4b of SPEC_attachments allow; one warning
   per run when the storage quota stops some) and save how far the source got (IMAP: every key's checkpoint in its
   state), always (see 7).
8. Other triggers ("run now" endpoint; later IMAP IDLE, SMTP push) call `instance.run(keys)`.

**Pruning** (every `limits.sources.prune_every_hours` per source, default daily, by the source poll manager): each source deletes what it downloaded beyond its
limits: older than `retention_days`, beyond the newest `max_items`, beyond the newest `max_size_mb` (text and
structure plus stored attachments). The files of deleted emails are released. Each limit is the source's own value, capped by `SOURCE_RETENTION_DAYS` / `SOURCE_MAX_ITEMS` /
`SOURCE_MAX_SIZE_MB` (env, default 0 = no cap: any value allowed; a source without its own value gets the cap).
Values above a cap are rejected on save. Staged emails are kept while staged. IMAP prunes the emails with its
`source_id`; staging prunes the emails without one (imports). Built-in sources can change their fetch and pruning
limits.

**First run** (no checkpoint): the newest `max_items_per_fetch` messages matching the search (or of the whole
folder); later runs take the oldest unseen first and leave the rest for the next run.

**Dated new searches (IMAP):** a new IMAP source gets the saved search "Default" (a supplied search of that name
replaces it). Every new saved search (new source, UI or API) is stored with a fixed `since: YYYY-MM-DD`,
`limits.sources.new_search_since_days` (default 7, 0 = none) before its creation, unless it has its own `since` /
`_since_days`. It is ordinary search data: the user can edit or remove it before the first run, and it is never
added again. Nothing is enforced at fetch time; folder-only keys stay unbounded. A note above the search editor says so.

**Renumbered folder (IMAP):** on fetch, the folder's UIDVALIDITY is compared with the stored one. If it changed,
the stored `last_uid` is meaningless, so the key's search runs again **without** the UID condition and only the
**last 10 messages** (highest UIDs) of the result are fetched. The duplicate check (message id already stored) skips
those processed before; only new mail goes on. The new `last_uid` (highest UID found) and `uidvalidity` are stored
and a warning event is logged ("Folder 'INBOX' of 'Work mailbox' was renumbered; resumed from the latest messages").
More than 10 new messages between the last run and the renumbering: the older ones are not picked up.

## 7. Failure model: visible failure, no automatic retries, no reprocessing

- Every source run advances the checkpoints and stores all fetched emails, also failed ones.
- Any failure (item error or service outage) produces **one grouped user event per automation and run**:
  reason + links to the stored emails ("12 emails failed in 'Research digest': TTS returned 500").
- Failed emails are not reprocessed automatically. Recovery is the user's: open the email from the event, or
  rerun an automation on chosen emails via staging (mark them as staging, run the automation on staging).
- Removed: hold-and-retry (`retry` outcome, unchanged checkpoint on outage), "will retry" wording.
- Email links point to `/repositories?message_id=<id>` (the root path redirected to /dashboard and dropped the
  query). Links to emails that were pruned since show a localized "This message has been pruned".

## 8. Deletion rules

- Deleting a source or a saved search is always allowed.
- Deleting a source: one warning event per affected **automation**. Other parts of the app that reference sources
  register `onSourceDeleted(listener)` with the sources service and warn their own records (the IMAP notification
  channel: channels with `config.record_id` = the source).
- Changing a source's settings: every automation whose key stops working (its search was deleted) gets one
  warning; the type drops what it kept for that key (`forgetKeys`, IMAP: its checkpoint).
- Affected automations stop running quietly (no repeated events, except the per-poll missing-folder warning);
  their form shows the stored key's label with a red note.
- Deleting a built-in source (staging) returns 200 and does nothing. Of a built-in source only
  `max_items_per_fetch` can be changed.
- `max_items_per_fetch` of every source is capped at the system limit
  (`app_defaults.limits.automation.max_emails_per_fetch`); higher values are rejected. `poll_seconds` must lie within
  `limits.sources.min_poll_seconds`..`max_poll_seconds`; new sources default to `limits.sources.default_poll_seconds`.
  Every value under `limits` can be overridden by an env variable `LIMITS_<PATH>` (e.g. `LIMITS_SOURCES_MIN_POLL_SECONDS`).

## 9. Secrets

- The whole `config` is stored encrypted.
- Reads return the config **without** secret fields (those with `set_type: 'string_secret'`).
- Updates: decrypt the stored config, merge the changed fields, keep a stored secret when its field comes back
  empty, encrypt again. A secret never returns to the browser once entered.

## 10. API

| Method | Path | Purpose |
|---|---|---|
| GET/POST/PATCH/DELETE | `/api/v0.1/app/sources[/:id]` | CRUD (validation, encryption, secret masking, settings, deletion warnings) |
| GET | `/api/v0.1/app/sources/keys` | every key automations can subscribe to now, with labels (IMAP folders live); sources that can't be listed under `unavailable` |
| POST | `/api/v0.1/app/sources/test` | type `test()` with the form's data (`id`, `type`, `config`); stored secrets fill empty secret fields; rate-limited externally (Traefik) |
| POST | `/api/v0.1/app/sources/:id/run` | "run now": `runSubscribed()` |
| GET/POST | `/api/v0.1/app/sources/export`, `/import` | backup without secrets (re-enter after import); search ids kept |
| GET/DELETE | `/api/admin/app/sources[/:id]` | admin: read and delete (permissions `sources.crud.*`) |

Test takes the form body instead of `:id` because it must work before the source is saved and with unsaved
edits, while secrets never leave the server.

Automation export/import: source ids differ between installations, so an automation exports `source_name` and
`source_key_suffix` (the key without the id: `''` for staging, `:INBOX:s_1a2b3c4d` for IMAP); import rebuilds the
key from the source found by name.

## 11. UI

- **Sources page**: choose a type → the type's config form (secrets masked) → test → poll interval and fetch
  limit → the type's settings (IMAP: saved searches, each a name + the search builder; staging: nothing).
  Settings widgets are looked up by `set_type` in `source_settings_editor.vue` (IMAP:
  `components/form_widgets/imap_searches.vue`). Built-in sources show only the fetch limit (base Form `hidden`).
- **Automation form**: name, active → **one source dropdown** with every key (`Source › Folder [› Search]`,
  just "Staging" for staging), listed live from `/sources/keys` → **Source options**, the selected type's
  automation options (its app form) → **Filter Prompt** (engine feature for every source; empty keeps all) → tasks.
  `filter_prompt` is a virtual form field stored in `options.filter_prompt`; the service drops option keys the
  source type's `optionsSchema` doesn't declare (also for API calls and imports). A stored key that isn't offered any more shows
  its saved label with a red note, unless its source couldn't be listed (server unreachable).
- **Event log**: grouped failure events with links.
- **Email view**: pruned emails show the localized pruned message.
- Removed: IMAP-search and IMAP-connection pages, APIs, schemas, rules, admin entries, nav items,
  example content, their import/export.

## 12. Implementation steps (each verified before the next)

1. IMAP type class + registry: move `utils/imap` into `jobs/sources/types/imap`, one client setup; old tables untouched.
2. Tables: `sources` (later with `state`), automation columns; drop old tables; database reset.
3. Sources service + API: schemas, encryption + secret masking, settings, key list, test,
   deletion warnings, staging (lazy creation, no-op delete).
4. `BaseSource` + source poll manager (`server/jobs/cron/source_poll_manager.ts`, boot `start()`, register/unregister by the service)
   + IMAP and staging classes + fan-out to automations:
   fetch → close → filter → flag → tasks → complete; failure model 7; renumbered and missing folders.
5. Automation service + form: key selection, broken-reference display.
6. IMAP notification channel on `sources` (base-app + cache).
7. Sources UI incl. saved searches, search builder, masked secrets.
8. Grouped failure events with links; pruned-message view.
9. Cleanup: old utils/endpoints/pages/i18n/templates (`add_template` picks the staging source), docs;
   twinbox's `userinfo_import_export.vue` exports `sources` instead of the old tables; base-app example nav (13).
10. End-to-end: staging and a real IMAP source, filter, flags, tasks, notification, deletion warnings, pruned link
    (tests: `tests/slow` for staging; real IMAP checked by hand).

## 13. Layer boundary (base-app)

Everything about sources, IMAP and automations lives in twinbox. Base-app only provides generic parts
(notification channels + provider registry, forms, telemetry); twinbox plugs in by registering providers
and by overriding components. Base-app must not reference twinbox tables, endpoints or vocabulary.

Generic base-app changes made for this plan (base-app + cache):
- `app/components/form/form.vue` passes `formData` to custom form components (the settings editor needs the type
  of the form it is in), and validates a stored record once when it is opened (broken references show at once).
- `app/components/form/set/string_line.vue`, `string_area.vue`: optional `placeholder`.
- `app/components/form/form.vue`: optional `header.hidden(formData)` leaves a field out for a record.
- `app/components/user_events.vue` renders `metadata.links` ({label, url}) as links (grouped failure events).
- `app/Examplesmetadata/app_nav.json`: dead `llm_filter` / `llm_create_artifact` entries removed.

Done ahead of this plan (base-app + cache):
- `app/components/userinfo_import_export.vue` exports/imports only base data (notification channels);
  twinbox's own component of the same name overrides it with the app tables (sources, automations).
- `server/utils/telemetry/event.ts`: the `'imap_poll'` example category was removed from the type.

Out of scope: the production instance on gx10-3513 (to be wiped later), IMAP IDLE, push types.
