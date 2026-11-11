# SPEC: File Store, Email Structure and Attachments

Status: implemented (steps 1–4; deviations from the plan are noted in section 16). Replaces the `emails.html` column, the folder-based artifact store (`Artifacts/<userId>/`) and the
base app's artifact routes and local channel.

## 1. Goal

- **One file store** for everything binary: email attachments, artifacts (LLM output, TTS audio), later uploads
  (library). One owner check, one hardened serving route, one sweeper.
- **Emails keep their structure**: envelope, renditions (text/html), parts (attachments, inline images) and embedded
  messages (forwards), instead of a flat `text` + `html`.
- **Attachments are optional**: the operator allows them per server (env), the user switches them on per source
  (default off). Not-downloaded parts are still listed.
- **Isolation without exceptions for users**: no user or API token can ever view, change or delete a record or file
  it doesn't own. Admins are the only exception (section 11).

Not in scope: the library (uploaded documents) and its UI; it will use the file store from this spec.

## 2. Terms

| Term | Meaning |
|---|---|
| file | one stored binary: a `files` row (owner, mime, size, hash) + a blob in storage |
| blob | the bytes on disk, under an opaque `storage_key`; never addressed from outside |
| envelope | message metadata: addresses, date, subject, thread ids |
| rendition | one format of the message body (`text/plain`, `text/html`); alternatives, the viewer shows one |
| part | anything that isn't a rendition: attachment, calendar invite. Listed always, downloaded optionally. Inline images of the HTML are not parts: they are inside the HTML rendition (section 7a) |
| disposition | how a part is shown: `inline` (in the body, e.g. `cid:` images) or `attachment` (offered as a file) |
| embedded message | a message inside a message: forward as attachment (`message/rfc822`). Followed one level deep |
| sweeper | cron job that removes blobs without a row and files without a reference |

A part's `disposition` is taken from its `Content-Disposition`. A text/html or text/plain part with
`disposition: attachment` (a .csv, a .html file) is a part, not a rendition.

## 3. Decisions

| # | Decision | Choice | Why |
|---|---|---|---|
| D1 | Where the file store lives | twinbox | its only user is twinbox; move `fileService` to the base when a second app needs it (same interface) |
| D2 | Artifact routes and local channel | move from the base to twinbox | artifacts are LLM output, app logic |
| D3 | Records vs bytes | typed records (`emails`, `artifacts`, later `library_docs`) reference `files` by `file_id` | lifecycles and queries differ per type; one generic table would lose both |
| D4 | Text vs file | renditions (searched, processed, small) stay in the record; binaries go to `files` | filter and search never open files |
| D5 | Concatenating forwards | `text`: yes, with a separator. HTML: never | HTML documents carry their own `<style>`; joined, they leak into each other |
| D6 | Viewer input | the record as JSON (`application/vnd.twinbox.message+json`) | an `.eml` would mean downloading every attachment just to open the viewer |
| D7 | `.eml` download | built on the server, attachments included; same route as the record (`?format=eml`) | one lookup and owner check for both representations |
| D8 | Admin access | exception to the isolation rule | admin tables for all users exist and stay |
| D9 | Deduplication | by `sha256`, **per owner only** | a shared blob across owners would let B reach A's file through the hash |
| D10 | Order of work | selective IMAP download last (section 13) | attachments work after step 2 (mailparser returns them); selective IMAP download is an optimization |
| D11 | Links to files without a session (signed URLs) | not built | notifications link into the app, where the user is signed in; add when something needs it |
| D12 | Malware scanning | not built, no hook | accepted risk: attachments are served as downloads (section 9) and never executed by the app |
| D13 | Viewer default | the automation text (`text`), renditions and parts on demand | you see what the automations judged; nothing is rendered as HTML until asked |
| D14 | Combining input types (email, later RSS, chat) | not now: `emails` stays, but its `content` structure is type-neutral | one table and API (`items` with `kind`) only pays off with a second type; until then it is abstraction without a user. Revisit: section 15 |
| D15 | API grouping | by role: inputs (`email`, later `items`), outputs (`artifacts`), bytes (`files`, `storage`) | "storage" means bytes and quota; shared logic (owner check, paging, delete) lives in the service layer, not in a shared route |

## 4. Configuration

### 4a. Server (env), in `server/metadata/app_defaults.json` → `limits`

```jsonc
"attachments": {
  "enabled": false,      // LIMITS_ATTACHMENTS_ENABLED: master switch; off = no source downloads attachments
  "max_mb": 10,          // LIMITS_ATTACHMENTS_MAX_MB: per attachment; larger → status "too_large"
  "max_per_email": 20,   // LIMITS_ATTACHMENTS_MAX_PER_EMAIL: stored per email (embedded included); the rest → "skipped"
  "types": [             // LIMITS_ATTACHMENTS_TYPES="application/pdf,image/*": allowlist, "type/*" allowed
    "application/pdf", "image/png", "image/jpeg", "image/gif", "image/webp", "text/csv",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ]
},
"files": {
  "max_user_mb": 1024    // LIMITS_FILES_MAX_USER_MB: quota per user over all files (attachments, artifacts)
}
```

- Default **off**: attachments are untrusted and take space; the operator switches them on deliberately.
- **The type is checked on the content**, not only on the header (the sender sets the `Content-Type`): magic bytes
  via `file-type` when storing; stored under the type found. Not identifiable, or found type not allowed →
  `status: "skipped"`, `reason: "mismatch"`. Text types without magic bytes (`text/csv`, `text/plain`,
  `text/calendar`) are accepted by their declared type when the content has no NUL bytes; they are served as
  downloads, or as `text/plain` inline (section 9).
- **Never stored, whatever the list says**: `image/svg+xml`, `text/html`, `application/xhtml+xml`, XML and
  JavaScript types (`typeAllowed` in `server/services/app/email_builder.ts`).
- Inline images of the HTML (`cid:`, multipart/related) are part of the body, not attachments: they are always
  downloaded and kept inside the HTML rendition as `data:` URIs (mailparser's default), as before this spec.
- `limits.imap.max_email_mb` caps **what is downloaded** (body + wanted attachments, step 4), not the message on the
  server.
- **Disk filling**: anyone who can send mail to a connected mailbox can send attachments. `max_per_email` and
  `files.max_user_mb` bound that. Over the quota, attachments are not stored (`status: "skipped"`) and the owner
  gets one user event per source run (`events.user.warn_files_quota_reached`), not one per attachment. An artifact
  over the quota is a failed delivery of the local channel (reported like any failed notification). The email
  itself is always stored.
- `.env.example` lists the new variables commented out, like the other limits.

### 4b. Per source

- `sources.settings.download_attachments: boolean`, default `false`. Non-secret, so in `settings`, not `config`.
- Editor: a checkbox in `app/components/form_widgets/source_settings_editor.vue`. When `limits.attachments.enabled`
  is false it is disabled with the hint "Attachments are disabled on this server".
- **The server enforces both** (`enabled && download_attachments`); the UI only reflects them.
- Changing it affects only new emails. Old ones keep their `skipped` parts (they can be fetched later, section 8).
- Source types without attachments (staging) don't show the checkbox.

## 5. Data model

### 5a. `files` (new, twinbox)

```jsonc
{
  "id": "fil_01J…",              // random; the only id that appears in URLs
  "owner_id": "usr_…",
  "storage_key": "3f/3f9c2…e1",  // opaque, generated; never derived from user input or file names (5a, on disk)
  "mime": "application/pdf",     // verified type (section 4a), not the sender's claim
  "size": 183004,
  "sha256": "f9c2…",             // integrity; dedup per owner (unique on owner_id + sha256)
  "filename": "anfrage.pdf",     // display and download name only, never part of a path
  "created_at": 1793600000
}
```

**On disk**: `<FILES_DIR>/<storage_key>`, `FILES_DIR` defaults to `<APP_DATA_DIR>/files` (`.data/files`). The key is 32 random hex
characters, prefixed by its first two as a folder (`3f/3f9c2…e1`) so no folder grows past a few thousand entries.
No extension, no original name, no owner id in the path:
- nothing from the sender reaches the filesystem (no traversal, no odd characters, no length limits);
- a file is never executable or opened by type from the disk;
- a listing of the folder reveals nothing about users or contents.

The original name lives only in `files.filename`. The key is separate from `id` because the blob is written before
the row exists (7a).

Storage is one small module (`server/services/app/files_storage.ts`: `put / read / delete / list` on local disk),
not an abstraction with several implementations; replacing it with S3 later means rewriting that one file.

### 5b. `emails` (changed)

Columns stay where something filters, sorts, dedups or reads them today (`subject`, `from`, `to`, `text`), so the
automation engine (`server/jobs/automations/tasks/items.ts`, `server/jobs/sources/types/email/item.ts`) and the drafter keep working unchanged.

```jsonc
{
  // ── columns ──────────────────────────────────────────────
  "id": "…",
  "owner_id": "usr_…",
  "source_id": "src_…",                    // null: imported
  "messageId": "<01.8D.30312…@…sparkpost>", // unique with owner_id (unchanged)
  "thread_id": "<first@…>",                // new: first of References, else In-Reply-To, else messageId
  "date": "2026-11-02T08:00:00Z",
  "from": "Anna Muster <anna@example.com>",
  "to": "sales@firma.de",
  "subject": "Angebot Pumpe X200",
  "text": "…",                             // built, not received (section 7c)
  "size": 48213,                           // new: size of the original at the source
  "staging_item": 0,
  "createdAt": 1793600000, "updatedAt": 1793600000,
  // "html" column: removed, now content.renditions

  // ── content: JSON column (new) ───────────────────────────
  "content": {
    "envelope": {
      "from": [{ "name": "Anna Muster", "address": "anna@example.com" }],
      "to": [{ "name": null, "address": "sales@firma.de" }],
      "cc": [], "reply_to": [],
      "in_reply_to": "<…>", "references": ["<…>"],
      "headers": { "list-id": "<news.example.com>" }   // selected extra headers only
    },
    "renditions": [
      { "mime": "text/html", "size": 20311, "content": "<html>…</html>" },
      { "mime": "text/plain", "size": 4102, "content": "Hallo, …" }
    ],
    "parts": [
      {
        "id": "2",                     // IMAP part number (step 4) or index in the parsed message
        "mime": "application/pdf",
        "filename": "anfrage.pdf",
        "size": 183004,
        "disposition": "attachment",   // enum: inline | attachment
        "content_id": null,            // cid of an inline image
        "status": "stored",            // enum: stored | skipped | too_large | removed | failed
        "reason": "type",              // status skipped only: disabled | type | mismatch | count | quota
        "file_id": "fil_01J…"          // only when status = stored
      }
    ],
    "embedded": [
      {
        "kind": "forwarded",           // enum: forwarded | bounced
        "part_id": "3",
        "envelope": { "from": [{ "name": "Kunde", "address": "k@kunde.de" }], "subject": "Anfrage", "date": "…" },
        "renditions": [{ "mime": "text/html", "size": 9000, "content": "…" }],
        "parts": [],
        "embedded_skipped": 1          // nested deeper, not followed
      }
    ]
  }
}
```

Part `status`:

| status | meaning |
|---|---|
| `stored` | downloaded, verified, in `files` |
| `skipped` | not downloaded: attachments off (server or source), type not allowed, or type mismatch |
| `too_large` | over `limits.attachments.max_mb` |
| `removed` | was stored, removed by the user ("remove attachments, keep email") or by retention |
| `failed` | download or decoding failed; the email itself is stored |

The attachments of an email are `parts` with `disposition: "attachment"`, plus the same in every `embedded[]`.

### 5c. `artifacts` (new, twinbox)

```jsonc
{
  "id": "art_…",
  "owner_id": "usr_…",
  "file_id": "fil_…",
  "filename": "Bericht.md",      // its own name: identical bytes of two artifacts share one file
  "automation_id": "aut_…",      // null: delivered outside an automation
  "label": "Wochenbericht",
  "source_refs": ["…"],          // the items it was made from (TaskItem.sourceRefs)
  "created_at": 1793600000
}
```

## 6. Code structure

```
server/services/app/files.ts          fileService: create(ownerId, bytes, {mime, filename}) → file (dedup, quota),
                                      get / open / read(ownerId, id), usage, release(ownerId, ids), sweep().
                                      The ONLY code that touches files or blobs.
server/services/app/files_storage.ts  blobs on local disk: put/read/remove/list by storage_key
server/services/app/email_builder.ts  parsed message → structure (section 7), automation text, attachment decision
                                      (storeAttachments), allowed and verified types; pure, unit-tested
server/services/app/email.ts          emailService: createFromParsed / createFromBuilt (store), delete and
                                      deleteMany (release files), removeAttachments, import; toEml()
server/services/app/artifacts.ts      artifactService: create (via fileService), list, get, delete, applyRetention
server/api/v0.1/app/files/[id].get.ts the single file serving route (section 9)
server/api/v0.1/app/email/[id].get.ts one email, owner-checked, in two representations:
                                      ?format=json (default): the record for the viewer
                                      ?format=eml: message/rfc822, attachments included, always
                                      Content-Disposition: attachment. Other values → 400.
                                      A query parameter, not Accept: download links can't set headers.
                                      Both formats send X-Content-Type-Options: nosniff; json is
                                      application/json, so the raw HTML renditions in it are never
                                      rendered as a page (the viewer sanitizes them)
server/api/v0.1/app/email/[id]/remove_attachments.post.ts   remove attachments, keep the email
server/api/v0.1/app/email/index.get.ts   list rows without `content`, with an `attachments` count
server/api/v0.1/app/artifacts/*       moved from base /api/user/artifacts, now on artifactService
server/api/v0.1/app/storage.get.ts    storage usage per category (section 10)
server/api/admin/app/email/*          list without text/content; reads, changes, deletes logged (section 11)
server/utils/http_files.ts            requireOwner(event), contentDisposition(type, filename)
server/utils/admin_audit.ts           auditAdminAccess(): admin access → the owner's event log
server/cron/file_sweeper.ts           hourly: artifact retention, then fileService.sweep() (section 8)
server/plugins/import_legacy_artifacts.ts   one-off import of the old artifacts folder (section 12)
server/jobs/sources/types/imap/parts.ts     step 4: which parts to download, the message rebuilt from them (7d)
server/jobs/sources/types/imap/client.ts    step 4: bodystructure pass, then one part fetch per message
server/services/app/notification_local.ts  local channel provider, moved from the base's
                                      services/core/notification_local.ts (same place as notification_imap.ts);
                                      writes via artifactService
server/plugins/app_notification_registration.ts  also registers it as 'local' (the base no longer does)
shared/types/email.ts                 the record's structure (MessageContent …), MESSAGE_RECORD_MIME
app/components/media_viewer/renderers/message.ts  renderer for application/vnd.twinbox.message+json
app/pages/storage.vue                 storage page (Preferences → Storage)
```

`app/components/media_viewer/renderers/email.ts` (`message/rfc822`) stays for `.eml` files opened as files (e.g. an
artifact). The browser-side `.eml` builder (`app/utils/eml.ts`) is gone: the server builds `.eml` files (`toEml`).

## 7. Ingestion

### 7a. One builder

All parsed messages (IMAP, raw messages) go through `buildEmail()` in `server/services/app/email_builder.ts`, so
records never differ by path. Input: a message parsed by mailparser (`parseMessage`, with `skipHtmlToText`, so
`text` is only a real text/plain part). In step 4 that message is rebuilt from the downloaded parts (7d), so the
builder and its decoding are the same for both. Output: the record of section 5b; the parts' bytes come back as
`pending` for `storeAttachments` (the decision of 4a/4b) and `fileService.create`. Imports of records (exports) have
no raw message: `emailService.import` takes their structure, or builds it from old `html` / `text` fields.

Steps:
1. **Envelope** from the headers; `thread_id` as in 5b.
2. **Renditions**: `text/plain` and `text/html` parts reached only through `multipart/*` containers, without
   `disposition: attachment`. Several HTML parts of the same message (Apple Mail with images in between) become one
   rendition (mailparser joins them). Inline images (`cid:`) are replaced by `data:` URIs inside the HTML.
3. **Parts**: everything else. Each is listed; it is downloaded/stored only if attachments are allowed (4a and 4b),
   its type is allowed and verified, and it is within `max_mb`.
4. **Embedded**: `message/rfc822` parts sent as attachment (Outlook's and Gmail's "forward as attachment") at depth 0
   are followed once (envelope, renditions, parts by the same rules). Deeper ones are counted in `embedded_skipped`.
   Bounces (`multipart/report`) become `kind: "bounced"`. A `message/rfc822` part sent *inline* is merged into the
   body by mailparser (its text with a header block, its attachments as the outer message's), like an inline
   forward.
5. **`text`** (7c).

Writing order, without transactions across database and disk: blob (written to a temp file, then renamed), then its
`files` row, then the email row that references it. A failure in between leaves a blob without a row or a file
without a reference; the sweeper removes both after an hour (section 8).

### 7b. One parse per email

The IMAP source parses and builds each message once in `fetch()` (the automations read its `text`) and stores the
built message in `complete()` (`createFromBuilt`). The second parse of the raw source is gone.

### 7c. `text`

- Per message: its `text/plain` rendition, else `htmlToText` of its `text/html` rendition (one rule everywhere).
- Then each embedded message:
  ```
  ---------- Forwarded message ----------
  From: … | Date: … | Subject: …
  <its text, same rule>
  ```
- Rebuilt whenever the structure changes. This is what the filter, the artifact task, search and the drafter read.

### 7d. Step 4: selective IMAP download

`server/jobs/sources/types/imap/client.ts` and `parts.ts`:
1. First pass for all new messages: `uid, size, envelope, bodyStructure` (no content).
2. `planParts()` walks the structure: the body (text/plain and text/html not sent as attachment, images of
   multipart/related) always; attachments per 4a/4b before downloading (wanted, declared type, estimated size,
   count); embedded messages one level deep, deeper ones not at all. The sum of what is planned >
   `limits.imap.max_email_mb` → the email is reported and skipped as before.
3. One fetch per message (no other command while a fetch is iterated): `BODY[HEADER]`, each kept node's `n.MIME`,
   the kept leaves' `n` and embedded messages' `n.HEADER`, raw (not BINARY).
4. `rebuildMessage()` puts these sections back together as a MIME message, bodies still transfer-encoded, so
   mailparser decodes charsets and encodings as for a whole message. A part that was not downloaded stays as an
   empty placeholder whose MIME header carries `OMITTED_HEADER` (`<reason>; size=<estimated bytes>`); the builder
   lists it with that status and size. The header name is random per process, so a sender can't fake it.
5. Without a body structure (unusual server answer) the whole message is downloaded, as before.

Not built: fetching a skipped or removed part again later from the mailbox (the viewer only shows why it is missing).

## 8. Lifecycle and deletion

- **Emails**: deleted through `emailService.deleteMany` (user and admin deletes) or by pruning
  (`server/jobs/sources/types/email/prune.ts`); both release the files of the deleted rows' parts
  (`fileService.release`: a file still referenced elsewhere, e.g. the same PDF in another email, stays).
- **Remove attachments, keep email**: parts → `status: "removed"` (still listed), files released.
- **Artifacts**: single and bulk delete; retention per automation ("keep N days" or "keep the last N"), applied by
  the sweeper run.
- **Account deletion**: the sweeper deletes the files and artifacts of owners without an account. Their emails are
  not deleted (as before this spec; account deletion has no hook in the base).
- **Sweeper** (`server/jobs/cron/file_sweeper.ts`, hourly):
  - blobs without a `files` row, older than 1 hour → deleted;
  - `files` rows not referenced by any email part, artifact (later: library document), older than 1 hour → deleted;
  - artifact retention.
  Leftovers from failures disappear eventually; no cross-store transactions needed.

## 9. Serving files

`GET /api/v0.1/app/files/[id]`, the only route that returns file bytes:

1. `fileService.open(session.user.id, id)`: lookup `WHERE id = ? AND owner_id = ?`. Not found or not the owner →
   **404** (never 403: don't reveal that it exists).
2. Headers on every response:
   - `X-Content-Type-Options: nosniff`
   - `Content-Security-Policy: sandbox; default-src 'none'`
   - `Content-Type`: the verified `mime`
   - `Content-Disposition: attachment` by default; with `?inline=1` `inline` for an allowlist (PNG, JPEG, GIF,
     WebP, audio; text types as `text/plain`). Never inline for HTML, SVG, XML or unknown types. Not PDF: Chrome's
     PDF viewer refuses to run under the sandbox CSP.
3. **File name in `Content-Disposition`**: `files.filename` comes from the sender. One helper builds the header for
   every route that sends a file name (this route, `?format=eml`): remove CR, LF and other control characters, send
   an ASCII fallback with `"` and `\` replaced (`filename="anfrage.pdf"`) plus the full name per RFC 6266
   (`filename*=UTF-8''…`, percent-encoded). This prevents header injection.

Later, optional: serve files from a separate origin without session cookies; signed URLs (D11).

## 10. UI

| Page | Contains | Files appear as |
|---|---|---|
| Emails (`app/pages/repositories.vue`) | emails; new column: attachment count | inside the viewer: attachment chips |
| Artifacts | automation outputs | the artifact, in the media viewer |
| Account → Storage (new) | usage overview | not listed: totals only |

No raw file manager: files are always shown in the context of the record that owns them.

**Viewer** (renderer `app/components/media_viewer/renderers/message.ts`, mime `application/vnd.twinbox.message+json`):
- header block as today (from, to, cc, reply-to, subject, date, message id);
- **default view: the automation text**, the record's `text` (7c), i.e. what the filter and the tasks read. Shown
  first and selected, as a chip labelled "Automation text · 12 KB" (no "LLM" wording):
  - shown in full, with a visible marker where `limits.llm.max_input_chars` cuts it ("Automations read up to
    here"), since the filter and the artifact task only read up to there;
  - for a message with its own `text/plain` rendition it reads like the sender's text; for an HTML-only message it
    is a conversion (`htmlToText`: no layout, flattened tables), so the HTML chip is one click away;
  - when it equals the `text/plain` rendition (no embedded messages), only one chip is shown;
- then the rendition chips (`text/html · 20 KB`, `text/plain · 4 KB`), each rendered by its renderer;
- attachment chips: name, type, size. `stored` → fetched from the file route and shown in place by its type's
  renderer, or "no preview" with a download link (PDF, Office); `skipped`/`too_large`/`removed`/`failed` → shown
  disabled, the reasons listed below the chips;
- each embedded message: a chip "Forwarded: <subject>" showing its own header block, renditions and attachments;
- **inline images** are inside the HTML rendition as `data:` URIs (7a), which the HTML iframe's CSP allows;
- "Remove attachments" (with a confirmation) when the email has stored attachments;
- Download → `?format=eml` on the email route, attachments included (MediaViewer's `download-url`).

**Storage page**: usage only, per category (emails, attachments, artifacts) against `limits.files.max_user_mb`.
No lists and no actions: space is freed by source pruning, artifact retention and the deletes on the emails and
artifacts pages.

**Source editor**: the checkbox of 4b.

**Automation editor**: artifact retention, two fields in the options of every source type: keep N days
(`options.artifact_keep_days`), keep the newest N (`options.artifact_keep_last`); 0 = keep all.

## 11. Isolation

Rule: **a user or API token can never view, change or delete a record or file it doesn't own.** Admins are the
exception: the admin tables and admin routes may read and delete all users' records. Admin access goes only through
`/api/admin/**`, behind the admin role check.

**Admin access is logged**: every admin read of another user's content and every admin change or delete writes an
event to the affected user's event log (`events.user.info_admin_read|changed|deleted`, category `admin`): who
(admin id and name), what (record type and ids), when. The admin email list returns metadata only (no `text`, no
`content`) and is not logged. Today only emails have admin routes; files and artifacts have none.

Implementation:
- Every owner-scoped query has `owner_id` in its `WHERE`, inside the service, not the route.
- Files are reached only through `fileService.open(ownerId, id)`; nothing else reads blobs.
- Dedup is per owner; a hash never resolves to another owner's file.
- The unique email key includes `owner_id`: two users with the same mailbox get separate records.

### Tests (`tests/slow/api/isolation.test.ts`, extended)

Setup: users A and B, each with emails (with stored attachments and a forward), artifacts and files; an API token
for B. A's data is snapshotted before and compared after.

1. **Route sweep**: read all API routes from the route files of twinbox and the base (`tests/helpers/routes.ts`,
   as Nitro registers them); call every non-admin route that takes an id
   as B (session **and** API token) with each of A's ids. Expected: refused, never A's data, never 5xx. New routes
   are covered without editing the test.
2. **Lists**: every list endpoint (emails, artifacts, files, storage overview, activity, export) returns no row of
   A's to B, also with filters, search and paging.
3. **Files**: B gets 404 for A's `file_id` on the file route, and for A's email on the email route in both formats
   (`json`, `eml`).
4. **Writes**: delete, bulk delete, staging toggle, "remove attachments" and retention settings with A's ids act on
   0 of A's records; the snapshot is unchanged.
5. **Indirect paths**: a test run or automation draft of B never sees A's emails (staging examples, `sourceRefs`);
   an automation of B can't subscribe to a key of A's source.
6. **Dedup**: the same PDF for A and B gives two `files` rows and two blobs; deleting B's leaves A's intact.
7. **Same message**: B storing an email with A's `messageId` (B's source on A's mailbox) gets B's own record; A's
   stays A's. (Tested through the import: the slow tests have no IMAP server.)
8. **Anonymous**: every non-public route without login → 401/403.
9. **Admin**: admin routes may read and delete A's and B's records; each content read or delete appears in the
   owner's event log. B calling any admin route is refused (exists today, kept).

Other tests:
- builder (unit): renditions, Apple Mail split HTML, PDF-only message, text/html attachment, forward depth 1 and 2,
  bounce, `text` building, attachment decision matrix (server off/on × source off/on × type × size × mismatch ×
  count over `max_per_email` × quota reached);
- file service (unit): verified mime, dedup per owner, write order, sweeper, quota, storage keys never contain input;
- file route: headers (nosniff, sandbox CSP, disposition per type); file names with CR/LF, quotes, backslashes and
  non-ASCII produce one valid header line;
- migration: applied to a copy of the dev database (54 emails → `renditions`, `parts: []`), not an automated test;
- selective download (`tests/fast/unit/imap_selective.test.ts`, `imap_fetch.test.ts`): BODYSTRUCTURE and sections
  of real messages from a small stand-in server (`tests/helpers/mime_structure.ts`): only the body downloaded
  when attachments are off, wanted attachments byte for byte, size and count before downloading, PDF-only and
  single-part messages, inline images kept, the omission header not forgeable, the limit on what is downloaded;
- artifact retention (unit), storage usage and "remove attachments" (slow API), admin access logged (isolation);
- UI (`tests/slow/ui/media_viewer.test.ts`): automation text selected first, cut marker at
  `limits.llm.max_input_chars`, no duplicate chip when it equals `text/plain`; attachment chips (CSV shown, PDF
  as download), forwarded message, `.eml` download read back with its attachments and forward.

## 12. Migration

Hand-written (no `nuxi prepare`):
- `files`, `artifacts` tables.
- `emails`: add `content`, `thread_id`, `size`; fill `content.renditions` from `html` and `text`
  (`json_object`/`json_array`), `parts: []`, `embedded: []`; envelope from `from`/`to`; drop `html`.
- Old artifacts: at startup, `server/plugins/import_legacy_artifacts.ts` imports `<LOCAL_ARTIFACTS_DIR or
  ./Artifacts>/<userId>/*` into the file store once and writes a `.imported` marker into the folder (not renamed:
  in Docker it is a mounted volume; nothing is deleted). Remove the plugin once no installation has such a folder.

Existing records never had attachments. The 24 emails truncated before the 10 MB limit stay broken unless they are
fetched again.

## 13. Implementation steps (each verified before the next)

1. **File store + artifacts**: `files`, storage driver, `fileService`, file route, sweeper, `artifacts` table and
   service, routes and local channel moved from the base, migration script; isolation tests 1–3, 6, 8.
2. **Email structure** (whole download): `content` column + migration, builder, `emailService.delete`, prune via the
   service, import/staging through the builder, config 4a, source checkbox 4b, viewer renderer with inline images,
   `?format=eml`, attachment column; builder tests, isolation tests 4, 5, 7.
3. **Retention + storage page**: artifact retention, "remove attachments", storage usage page and API.
4. **Selective IMAP download** (7d).

Docs to update with each step: `docs/specs/SPEC_sources.md` (fetch, settings), `docs/media_viewer.md` (message renderer),
`docs/architecture.md` (file store), `.env.example`.

## 14. Layer boundary (base-app)

Nothing of this spec goes into the base. The base loses `server/api/user/artifacts/*` and
`server/services/core/notification_local.ts` (moved to twinbox), its `registerProvider('local', …)` line in
`server/plugins/core_notification_registration.ts`, and the `artifacts.*` i18n keys they used. Twinbox registers
the provider under the same name `'local'`, so existing channels keep working. If a
second app needs the file store, `fileService` and the storage driver move to the base unchanged.

## 15. Open points

1. **Revisit when a second input source type exists** (RSS, chat, …): combine `emails` into one `items` table and
   API (`/api/v0.1/app/items?kind=email|rss`) instead of adding a parallel table (D14). Because `content`
   (envelope, renditions, parts, embedded) is already type-neutral, the migration is a rename plus a `kind`
   column: email-only columns (`messageId`, `to`) become nullable or move into `content.envelope`, and the
   staging, prune and viewer code switch from `emails` to `items`. Artifacts stay separate (D15).

## 16. Implementation notes (deviations from the plan above)

1. **Inline images** stay inside the HTML as `data:` URIs (mailparser's default), always downloaded as part of the
   body. The planned `cid:` → `blob:` replacement from stored files would have made them disappear whenever
   attachments are off (the default), and they already showed before this spec.
2. **No cross-store transactions**: write order plus the hourly sweeper (7a, 8) instead.
3. **Step 4** rebuilds a MIME message from the downloaded sections and keeps mailparser as the only decoder (7d),
   instead of decoding parts with `libmime` / `iconv-lite` directly.
4. **PDF is not shown inline** by the file route (sandbox CSP), only downloaded or shown as "no preview".
5. **`artifacts.filename`**: each artifact keeps its own name; identical bytes share one file.
6. **Account deletion** removes files and artifacts (sweeper), not emails (no hook in the base).
7. **Not built**: fetching a skipped or removed attachment again later.
