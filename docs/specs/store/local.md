# SPEC: Local Store Provider

Status: draft. The store provider for the local disk (`docs/specs/store/store.md`, section 14): today's disk storage
(`server/services/app/files_storage.ts`, `docs/specs/store/attachments.md` 5a) behind the store interface, with no
change in behaviour. Built in step 1 of the store's build order.

## 1. Role

- The **system** provider instance: one per installation, configured by the operator, `owner_id` null.
- Holds the local files of every owner (the default target of every source provider): parts and inline images from
  sources, uploads, automation output (persisted notifications).
  Isolation is by the owning item (`store_files.item_id` → `store_items.owner_id`).
- Implements exactly the v1 interface: `writable: true`, `put`, `get`, `delete`, `list` (store spec section 14). No
  optional methods. The only provider twinbox deletes from and prunes (store spec 15.13); the quota
  (`limits.files.max_user_mb`) is enforced by the store core, not by the provider. `list()` serves the sweeper only.

## 2. Layout on disk (unchanged)

- `<FILES_DIR>/<locator>`; `FILES_DIR` defaults to `<APP_DATA_DIR>/files` (`.data/files`).
- The locator is 32 random hex characters, prefixed by its first two as a folder (`3f/3f9c2…e1`), so no folder grows
  past a few thousand entries. Generated here, never taken from input; validated against
  `^[0-9a-f]{2}/[0-9a-f]{32}$` before every disk access.
- No extension, no original name, no owner id in the path: nothing a sender chose reaches the filesystem (no
  traversal, no odd characters, no length limits); a file is never executable or opened by type from the disk; a
  listing reveals nothing about users or contents.
- The original name is never in the `store_files` row either: it lives on the item side (store spec section 4, `store_files`).

## 3. Interface mapping

| Interface | Local implementation (today's function in `server/services/app/files_storage.ts`) |
|---|---|
| `writable` | always `true` |
| `put(bytes) → locator` | `put`: temp file, then rename (a reader never sees a partial file) |
| `get(locator)` | `read`: a read stream (local files are immutable) |
| `delete(locator)` | `remove` (`force`: a missing file is not an error) |
| `list()` | `list`: every file and leftover temp file with its modification time, for the sweeper only |

## 4. Dedup and quotas

- **No dedup in v1** (store spec section 4a, decided 2026-11-18): every `put` writes new bytes; each file belongs to
  one item. Today's per-owner sha256 dedup is dropped; the migration copies shared files.
- Never shared across owners (docs/specs/store/attachments.md D9).
- Quota per owner over all local files: `limits.files.max_user_mb` (`server/metadata/app_defaults.json`), checked by
  the store core before `put`.

## 5. Consistency and sweeper (unchanged)

- Write order without cross-store transactions: file (temp, rename) → `store_files` row → the item that references it. A
  failure leaves a file without a row or a row without a reference.
- The hourly sweeper (`server/jobs/cron/file_sweeper.ts`) removes, older than one hour: files without a `store_files` row;
  `store_files` rows of this provider whose `item_id` no longer exists; files of deleted accounts.
- The reference check is one indexed lookup on `store_files.item_id` instead of today's JSON scan over all emails
  (`fileIdsReferencedByEmails`, `server/db/email_content.ts`).

## 6. Serving (unchanged)

Through the one file route (`docs/specs/store/attachments.md` section 9): owner check (not found, never forbidden),
`nosniff`, sandbox CSP, the verified mime, download by default and inline only for an allowlist, a safe
`Content-Disposition`.

## 7. Security

- The locator regex check on every access is the traversal guard; keep it in the provider, not in callers.
- `FILES_DIR` must not be served by any web server directly; the app's file route is the only way out.
- Backups: the database and `FILES_DIR` belong together (a database restore without the files gives `store_files` rows
  without bytes; the reverse leaves files the sweeper removes).

## 8. Migration

- Today's `files` table becomes `store_files`; `files.storage_key` → `store_files.locator`; every existing row gets `provider_instance_id` = the system local instance,
  `item_id` and `part_id` from the email or artifact that uses it (a file used by several gets a copy per extra use,
  store spec section 20); `files.filename` is dropped (the name is on the item side). No existing file on disk
  moves.
- `files_storage.ts` becomes the local provider (`server/modules/store/providers/local/`, under lint rule A,
  `docs/specs/store/store.md` section 19), registered in the store's registry; the store resolves providers instead of
  importing it.
