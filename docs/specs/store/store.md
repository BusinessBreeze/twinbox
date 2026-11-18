# SPEC: Store

Status: draft (concept only, nothing implemented). Foundation for `docs/specs/source/classification.md`, `docs/specs/source/rules.md` and `docs/specs/core/automations.md`.

The store is everything twinbox keeps that can feed the LLM: the records (items, tags) and the bytes, the
latter behind one **store interface** with interchangeable **store providers** (only the local disk is built or planned; the interface stays open for others, section 14).
Replaces the `emails` and `artifacts` tables with one `store_items` table. Revisits D3 and D14 of
`docs/specs/store/attachments.md` (no generic table until a second type exists): documents and persisted
notifications are the second and third type. Replaces the single-module storage of `docs/specs/store/attachments.md`
5a ("not an abstraction with several implementations") by the provider interface.

Store specs: this one (records, interface), `docs/specs/store/local.md` (the local provider),
`docs/specs/store/attachments.md` (message structure; section 17 lists what this spec changes there).
How sources supply items: `docs/specs/source/sources.md`, `docs/specs/source/imap.md`.
Not in scope: classification (`docs/specs/source/classification.md`), source rules (`docs/specs/source/rules.md`), automation queries (`docs/specs/core/automations.md`); channels
(destinations); automation chains, retrieval (RAG), push sources (later, own specs).

## 1. Goal

- **One store for everything that can feed the LLM**: emails, documents (uploaded, or files on an external provider),
  twinbox's own persisted output. Selection, tags, cursors, pruning and reference counting exist once.
- **Two independent axes**: the mime type says what an item is, the trusted attributes say where it came from. No
  item kind per origin (an uploaded `.eml` is an email; a PDF on the local store and one at an external provider are both PDFs).
- **Where bytes live is invisible**: a PDF at an external provider and one on local disk would be used the same way, through one
  store interface. Which provider holds it can be looked up, but nothing depends on it.
- **Text in the record, bytes with a provider**: what the LLM reads is in the item; original bytes are files.
- **No behaviour change on migration**: emails and artifacts move first and work as before; uploads and the provider
  interface come in the same step as the first new type.

## 2. Terms

| Term | Meaning |
|---|---|
| store | the records (items, tags) plus the store interface; core code |
| store interface | the generic stub every provider implements: `writable`, put, get, delete, list (section 14) |
| store provider | an implementation of the store interface. Only `local` (disk) exists or is planned; the interface must not depend on its specifics |
| provider instance | a configured provider: the system's local disk; later possibly a user's own account at an external provider |
| local file | bytes on the local store; **twinbox manages their lifecycle** (pruning, quota, deletion) |
| external file | bytes at an external provider, whether twinbox wrote them there (routing, a source's target) or found them (a file in a folder a source watches); **the provider manages their lifecycle**, twinbox never deletes or prunes them (decided 2026-11-18) |
| item | one stored unit: an email, a document, a persisted notification |
| mime | what the item is: `message/rfc822`, `application/pdf`, `text/plain`, ... (the verified type) |
| attribute | an immutable fact fixed at ingest; either an trusted attribute or a untrusted attribute |
| trusted attributes | the attributes **twinbox observed** about how the item got here (section 6): general keys defined by the store, `origin` defined by the source provider or provider. Stored in the column `arrival` and the JSON column `trusted_attributes` (the rest, `source_id` included) |
| untrusted attributes | the attributes **the item states about itself**, normalized and **filterable**: from, to, cc, date, message_id, thread_id, list_id. Sender-controlled, never trusted on their own. Stored in the column `title` and the JSON column `untrusted_attributes` (the rest). A declared set per kind of item (messages, documents), not per source |
| content | the mime-specific structure needed to show and process the item, **never filtered on** (emails: renditions, parts, embedded, raw extra headers; documents: the file, extraction info). Holds no untrusted attribute (S12) |
| part | a file inside an item (attachment, inline image); listed always, stored by policy |
| extracted text | what automations read: **derived** from `content` (section 9), not content itself; rebuildable |
| tag | a managed label with a description (section 4); attached to items with an origin and a state |
| thread | what a message belongs with (`untrusted_attributes.thread_id`, section 10) |
| ingest_seq | monotonic number per arrival; what consumers' cursors use |
| source | what emails come from (IMAP, staging); `docs/specs/source/sources.md` |
| pruning scope | what pruning and quota rules apply to: one user on the local store (section 16); external providers maintain themselves |
| target provider | the writable provider instance a source directs new bytes to: a default per source provider, overridable per source and rule (section 14) |
| provider | a pluggable implementation inside a subsystem: a store provider (local), a source provider (IMAP, staging; formerly "source type"); in `server/modules/<subsystem>/providers/<name>/` (section 19) |

## 3. Decisions

| # | Decision | Choice | Why |
|---|---|---|---|
| S1 | One table or one per type | one `store_items` table; mime-specific data in `content` | tags, cursors, pruning and references once; reopens docs/specs/store/attachments.md D3 / D14 now that there are three types |
| S2 | What an item is | its mime type, not a `kind` | the same vocabulary as task items (`server/jobs/automations/tasks/types.ts`); origin is the trusted attributes |
| S3 | Text vs bytes | extracted text in the record, original bytes always a file with a provider, including inline images | one path for quotas, references, sweeper; the database stays small (backups, WAL) |
| S4 | Immutability | attributes and content never change; a changed original is a new item (linking versions: later, section 4a) | consumers' cursors stay valid; what an automation saw stays what it saw |
| S5 | Tags | managed objects with a description; attached with origin `rule \| user` and state `suggested \| confirmed` | consumers can trust by origin and state (reference context takes confirmed user tags only) |
| S6 | File references | each file belongs to exactly one item: `store_files.item_id` + `store_files.part_id`; no file dedup in v1 (2026-11-18) | no reference counting, no JSON scan over all emails (`server/db/email_content.ts`); deleting an item deletes its files |
| S7 | Relations | parts in `content`, their bytes in `store_files`; a promoted document records its email in `promoted_from`; thread as an indexed untrusted attribute; never tags; no general item-to-item links in v1 | structural facts are joined, not string-matched |
| S8 | Persisted notifications | the local channel writes items (`arrival: internal`) instead of artifacts | one viewer, one store; consumers can select them (with a loop guard) |
| S9 | Outbound notifications (ntfy, mail) | never stored | they leave the system; only the local channel persists |
| S10 | Where bytes live | one store interface, interchangeable providers; new bytes on the target provider instance the source directs (default local, any writable instance), found files where they already are | a file at an external provider would be used like a local one; extensible without touching callers |
| S11 | Trusted attributes vs untrusted attributes | two kinds of attribute: observed vs stated | the trust line: security rules rely on the trusted attributes, or on untrusted attributes they confirm (`verified`) |
| S12 | Where an attribute is stored | each key in exactly one place, never both. Columns only for keys **every** item has (owner, mime, ingest_seq, arrival, title, state, extractor); keys only some items have stay in JSON, made fast by partial expression indexes. Three JSON places: `trusted_attributes` (observed, trusted), `untrusted_attributes` (stated, filterable), `content` (structure, never filtered). The query builder offers fields from the first two only, claims marked "unverified" | the generic table carries no type-specific columns; no copies that can drift; small filterable JSON stays cheap to scan; the trust line is visible in the storage (decided 2026-11-17) |
| S13 | Trusted attributes: general vs origin | general keys defined by the store (rules and security use only these); `origin` defined by the source provider or provider | the rules engine stays free of IMAP and any provider specifics; each maps its facts to `direction` and `verified` |
| S14 | Attachments with a life of their own | a part can be promoted to a document item with a copy of the bytes, recording `promoted_from` | a contract from one email must be taggable and referable anywhere |
| S15 | Text extraction | extraction providers (built-in text, Tika in a separate container: bytes in, text out, no database access), section 13 | it parses untrusted files; a crash or exploit stays outside the app |
| S16 | Pruning and quotas | per user on the local store, done by the store; not per source. External providers do their own maintenance; twinbox only reads what they report (decided 2026-11-18) | twinbox controls only what it hosts; a source is how an item arrived, not who owns it |
| S17 | Dedup across providers | none | a file at an external provider and the same bytes on local disk are different files with different lifecycles |
| S18 | Layers | one folder per subsystem: `server/modules/store/` with `store.ts` (the API, only entry point), `contract.ts`, `internal/`, `providers/<name>/`; three lint rules (section 19) | providers can't bypass owner isolation or the trust rules; no special case for local |

## 4. Data model

### Overview: tables and JSON

**A thing gets its own table** when it has its own lifecycle, is shared between items, or must be queried across
items. **Everything that belongs to exactly one item and is only read with it is JSON inside the item row**
(decided 2026-11-18).

Five tables (each row is a record of its own; v1, 2026-11-18: file dedup, item links and versions are shelved, section 4a):

| Table | One row is | Relates to |
|---|---|---|
| `store_items` | one item: an email, a document, a persisted notification | everything below |
| `store_files` | one stored file (bytes at a provider instance), belonging to exactly one item | `store_items` (n — 1), `store_provider_instances` |
| `store_provider_instances` | one configured place for bytes (the local disk; later possibly a user's external account) | `store_files` |
| `store_tags` | one tag the user (or a provider) defined | items through `store_item_tags` |
| `store_item_tags` | "item X has tag Y", with who set it and its state | `store_items` n — n `store_tags` |

JSON columns (part of their parent row, not records; no ids of their own, never queried as rows):

| Column | In | Holds |
|---|---|---|
| `trusted_attributes` | `store_items` | what twinbox observed (section 6), incl. `origin` (source-defined) |
| `untrusted_attributes` | `store_items` | what the item states, normalized and filterable (from, to, date, list_id, ...) |
| `content` | `store_items` | the structure: renditions, the **parts list**, embedded messages (section 5a) |
| `scope` | `store_tags` | which mimes / sources the classifier considers the tag for |
| `config` | `store_provider_instances` | the provider's settings, secrets encrypted |

**Parts are not records.** A part (attachment, inline image) is an entry in `store_items.content.parts`. If its bytes are
stored, they are a `store_files` row with that item's `item_id` and the `part_id`. A part that gets a life of its own is
**promoted**: a new `store_items` row (a document) with its own copy of the bytes and `promoted_from` (section 11).

Outside the store (source core, `docs/specs/source/rules.md`): `source_pending_actions`, `source_action_log`.

### store_items

| Column | Notes |
|---|---|
| ingest_seq | `INTEGER PRIMARY KEY AUTOINCREMENT`: monotonic, never reused (15.1); internal only, never in the API |
| id | text, `NOT NULL UNIQUE`: the public id (API, URLs), as today |
| owner_id | always in every query |
| mime | verified type of the item itself |
| arrival | trusted attribute, stored as a column (15.2) |
| trusted_attributes | JSON, the trusted attributes except `arrival` (section 6), `source_id` included |
| title | untrusted attribute: subject / filename / notification title (every item has one; for a document it **is** the filename, stored nowhere else) |
| untrusted_attributes | JSON, the other untrusted attributes: from, to, cc, date, message_id, thread_id, list_id (mailing lists, newsletters); hot keys get partial expression indexes (S12, 15.2) |
| sort_date | generated column (`GENERATED ALWAYS AS`, Drizzle `generatedAlwaysAs`), indexed: `min(coalesce(untrusted_attributes.date, created_at), created_at)`. Computed by SQLite, so it never drifts; the clamp keeps a sender's future `Date` from pinning a mail to the top; imports keep their old dates (15.12) |
| content | JSON, mime-specific structure (section 5a); no untrusted attributes in it |
| extracted_text | derived (section 9) |
| extractor | name and version of what produced `extracted_text`, e.g. `email_builder@3`, `tika@2.9.2`, `provider:<name>` (a provider's own text); lets an improved extractor rebuild only outdated items, in batches (section 9) |
| state | `ok \| pending \| error` with `state_reason`: `pending` = parts not fetched yet (a classification error leaves them pending, source rules spec 5.2); `error` = `extraction` (no text, section 13), `gone` (an external file, later) |
| size | bytes of the original at the origin (email: RFC822 size) |
| created_at, updated_at | updated_at moves only for state and extracted text, never for content |

**Accepted duplicate** (decided 2026-11-18): for a document, `mime` and `size` repeat its original's `store_files.mime` and
`store_files.size`. Every item has a mime and a size (an email has no file of its own but an RFC822 size), so lists and
filters work without a join; both values never change and are written in one transaction, so they can't drift. The
only exception to S12.

Today's `emails` columns map as: `from`, `to`, `date`, `thread_id` → `untrusted_attributes`; `subject` → `title`;
`message_id` → `untrusted_attributes.message_id` (also the dedup key, section 8); `source_id` → `trusted_attributes.source_id`;
`text` → `extracted_text`; `staging_item` → `arrival = 'staging'`. The top-level envelope moves out of `content`
(section 5a).

### store_files

Today's `files` table, renamed `store_files` (`docs/specs/store/attachments.md` 5a: `id`, `mime`, `size`, `sha256`, `created_at`) plus
where the bytes are and whose they are, **without `filename` and `owner_id`** (decided 2026-11-18). A `store_files` row
holds only what twinbox determined about the bytes; what the item declared stays on the item side:

- `mime` here is the **verified** type (magic bytes); `content.parts[].mime` is what the message **declared**.
  Different facts, not a copy; a mismatch is a skip reason.
- The **filename** is declared, so it lives only on the item side: `content.parts[].filename` for a part, `title`
  for a document. Downloads take their name from there.
- **No `owner_id`** (decided 2026-11-18): every file is reached through its item (`read(item_id, part_id)`), whose
  owner check covers it; quota sums join `store_items`. A copy of the owner would be a second place to get wrong.
- The lifecycle follows `provider_instance_id` (local → twinbox, external → the provider); there is no `owned` flag.

| Column | Notes |
|---|---|
| item_id | the item the file belongs to; **every file belongs to exactly one item** (v1, no dedup). Indexed |
| part_id | the `id` of the entry in `content.parts` (messages: the MIME position, e.g. `2` or `3.1`; internal output: the id in `content.files`); not a foreign key, it points into the item's JSON. **Null = the item's own file** (a document's original). Unique `(item_id, part_id)` |
| provider_instance_id | which provider instance holds the bytes; for new bytes the directed instance at write time (default: the system's local disk) |
| locator | the provider's key: an opaque generated key on the local store (today's `storage_key`); provider path / id on external instances |
| sha256 | computed by twinbox when writing, as today |

`sha256` is kept for integrity and for consumers (`input.dedupe`, automations spec), not for sharing bytes. **The only
place where an item points to a file**: `content` holds no `file_id`, so nothing can drift and removing a part never
touches the immutable `content` (S4). The viewer loads the item and its `store_files` rows in one query.

### store_provider_instances

`(id, owner_id?, provider, name, config (encrypted secrets), created_at)`. `owner_id` null = a system instance (no
separate `scope` column: it would repeat that). The system's local disk is one row, `owner_id` null, `name` "local". User instances (an external account, none planned) belong to one owner and are only
usable for that owner's files.

### store_tags

`(id, owner_id, name, description?, color, scope: { mime?: [...], sources?: [...] }, created_at)`, unique
`(owner_id, name)`. Every tag is its own record, also an ad-hoc one.

- **User tags**: created by the user only (or by the migration); the classifier may propose, never create. Typing a
  new name in the tag picker creates it on the spot (decided 2026-11-18).
- **Description optional**: it explains the tag and is the classifier's criterion (classification spec). A tag without one is
  a plain label the classifier never sets; the tag dialog says "add a description so rules can suggest this tag".
- **No auto-confirm per tag**: whether a classifier tag is confirmed depends only on how trustworthy the input is
  (classification spec), not on the tag (decided 2026-11-18).

### store_item_tags

`(item_id, tag_id, origin: rule | user, state: suggested | confirmed, set_by?, created_at)`, unique
`(item_id, tag_id)`, indexed on `(tag_id, state, item_id)`.

- `set_by`: the user id (`origin: user`) or the rule / classifier run (`origin: rule`).
- **Manual tagging**, one item or a filtered selection in bulk (the item manager): `origin: user`,
  `state: confirmed`. Old and new items alike (e.g. tagging a subset for a new project).
- **Classifier tags** act on the user's behalf and look the same in the UI (sidebar, filter, remove). In the record
  they keep `origin: rule` even when confirmed automatically, so a wrong tag can be traced to its rule and everything
  that rule tagged can be found. Only the user's own confirmation (review) makes it `origin: user` (classification spec).
- **The store records facts, not consequences**: it does not know what a tag triggers. The rules subsystem decides the
  state when it writes a tag; each consumer states in its own selection which origins and states it accepts
  (decided 2026-11-18).

### 4a. Shelved for v1 (decided 2026-11-18)

Not built now; nothing in v1 blocks adding them later:

- **File dedup** (same bytes stored once, shared by several items): needs reference counting (`item_files`, many to
  many). Later migration: merge `store_files` rows with the same sha256 per owner, build `item_files` from
  `store_files.item_id`. Biggest gain would be repeated inline images (v1 stores them by default, 15.17).
- **Item links** (`item_links`): one document linked to every email it arrived with (needs file dedup), and
  **versions** (`supersedes`: a new upload of a document, a changed file at a provider). Until then a promoted
  document records its one email in `promoted_from`.
- **Upload dedup** (the same bytes uploaded twice → one item): v1 creates a new item each time.
- **Manual promotion** ("add to documents" on a part in the viewer): v1 promotes only at ingest. Workarounds: tag
  the email, or download and upload the attachment.
- **Removing a single part** (free space, keep the email): not a feature today either; v1 deletes whole items.
- **External tags** (only with an external provider that has tags): mirrored into `store_tags` with a
  `provider_instance_id` and into `store_item_tags` with `origin: external`; **immutable** in twinbox (changed on the
  provider's platform only), never a classifier criterion, never counted as user tags; the user's own tags sit next
  to them; removing the instance lists them for reclaiming (15.6). Adds a nullable column and an enum value.
- **Automation chains** (`chain_depth` in `trusted_attributes`, automations spec): own spec.

## 5. Item types (mime)

| Mime | Origin | Extracted text | Bytes | Dedup |
|---|---|---|---|---|
| `message/rfc822` | IMAP, staging, `.eml` upload | renditions + forwards (as today) | parts and inline images by policy, on the target instance | Message-ID (section 8) |
| documents (`application/pdf`, DOCX, `text/*`, ...) | upload, promoted attachment, or a referenced file on an external provider | extracted (S15), or the provider's own text | local (upload, promotion), or external (routed, found) | section 8 |
| internal output (any mime) | local notification channel | the textual output | local | none: one item per delivery |

New types need: a content shape, an extractor (builder for messages), a dedup rule, a viewer. Nothing else.

## 5a. Content per type

`content` is what is needed to show and process the item; it is never filtered on (S12).

```
// message/rfc822: today's MessageContent minus the top-level envelope's claim keys
{
  headers?: { ... },                        // raw extra headers, display / debugging only (list-id is a claim)
  reply_to: [...], in_reply_to?, references?, // kept for replies and threading, not filterable
  renditions: [{ mime, size, content }],    // HTML / plain text bodies (text, so in the record, S3)
  parts: [{ id, mime, filename, size, disposition, content_id, status, reason? }],
                                            // status = the ingest outcome, never changes: stored | skipped |
                                            // too_large | failed; whether bytes are there now = a files row
  embedded: [{ kind, part_id, envelope, renditions, parts, embedded_skipped }]
                                            // a forwarded mail keeps its whole envelope here: its from / to are
                                            // claims of the inner mail, not of the item
}

// documents (application/pdf, DOCX, text/*, ...): not broken down
{
                                            // the original: files row with part_id null; none if the policy
                                            // says keep_original: false (CSV)
  pages?,                                   // when the extractor knows it
}                                           // which extractor ran: items.extractor; failures: items.state / state_reason

// internal output: the textual output is the extracted text; content holds only attached files
{ files?: [{ id, filename }] }              // bytes and verified mime: files rows with part_id = id
```

The item's own file (a document's original) is a `store_files` row with `part_id` null; parts have their part id.
No raw `.eml` is kept for messages: the record is the parsed structure, `.eml` downloads are rebuilt on the server
(`docs/specs/store/attachments.md` D7).

## 6. Trusted attributes

```
arrival                                      // column (S12)
                                             // arrival: 'fetched' | 'staging' | 'upload' | 'attached' | 'internal'
                                             //          | 'referenced' (reserved: found files, external providers)
                                             //          | 'shared' (reserved, spaces, section 18a)
trusted_attributes: {
  // general, defined by the store; security checks rely on these (S11, S13)
  source_id?,                                // the source whose run created the item; a plain reference, no foreign
                                             // key, dangles after the source is deleted. Used to filter, display, count
                                             // on source deletion, and by the source provider to act on the origin
                                             // (it holds the credentials). Partial expression index.
                                             // Uploads: the built-in upload source (15.8); internal: none
  direction?: 'in' | 'out',                  // messages only; out = sent by the owner (IMAP: Sent folder)
  verified?: { identity, method, result: 'pass' | 'fail' | 'none' },
                                             // email: identity 'domain:acme.de', method 'dmarc'
                                             // upload: identity 'user:<id>', method 'session', result 'pass'
                                             // referenced: identity 'provider:<instance id>', method 'provider', result 'none'
  automation_id?,                            // internal: who produced it (loop guard, automations spec)
  promoted_from?: { item_id, part_id },      // attached: the email and part it was promoted from (written once;
                                             // partial expression index for "documents from this email")

  // specific, schema defined by the source provider or provider
  origin: { ... }                            // IMAP: folder, key, uid, uidvalidity, auth details (docs/specs/source/imap.md)
                                             // upload: none (who uploaded it is verified.identity 'user:<id>');
                                             // an external provider: e.g. folder, its own id (never the filename)
}
```

- Immutable; only what twinbox observed, never what the item states (that is an untrusted attribute).
- The source provider or provider defines the `origin` schema, maps its facts to `direction` and `verified`, and declares
  which `origin` keys are queryable (IMAP: `folder`; a folder-based provider: `folder`). Only these are offered by the query builder.
- **Location keys say where, never who** (decided 2026-11-18): a folder is a trusted observation that twinbox saw the
  item there, not evidence of who put it there (anyone with write access to a shared folder; a sender steering
  a server-side mail filter). Conditions on location may steer `internal` actions; trust comes only from the sender
  check (`verified`) or the allowlist (classification spec, section 3). Each value is stored once: folder in
  `origin`, filename in `title`.
- **Only the store writes the trusted attributes.** Source providers and providers return values; the store validates
  them (`verified` needs a known `method`, `identity` in the method's format). Every mapping has its own tests: a
  too generous `verified` undermines every trust rule.
- **`verified` of an upload says who put the item in, not who wrote it.** For an uploaded `.eml` it says nothing
  about the email's sender: a rule that wants a verified sender must require `method: 'dmarc'` (source rules spec, section 2).
- **Referenced files are not verified** (`result: none`): a shared folder at a provider can contain files anyone with access
  put there. The user can add a provider instance to the auto-confirm allowlist (classification spec) if it is theirs alone.
- A promoted document keeps the email's general keys (`direction`, `verified`) with `arrival: attached`. It is not
  trusted like an upload.

## 7. Verification

`verified` has one shape everywhere (section 6); the store validates it. How IMAP determines it (domain
authentication: DKIM / DMARC) is in `docs/specs/source/imap.md`.

## 8. Dedup

v1 deduplicates **fetched emails only**, by Message-ID, and never shares bytes (decided 2026-11-18; section 4a). There is no
generic `external_id` column: the Message-ID is stored once, in `untrusted_attributes.message_id`, and a unique
partial expression index `(owner_id, message_id) WHERE arrival IN ('fetched', 'staging')` does the dedup. A later
source provider with its own dedup key (e.g. a folder-watching source: its locator) adds it then.

- **Emails**: the same email fetched twice (two folders, Gmail labels / All Mail, two of the owner's sources) is one
  item. Two different emails with the same PDF are two items with two files. An uploaded `.eml` keeps its
  Message-ID (threading, replies) but is not deduplicated.
- **Known limitation**: the Message-ID is sender-controlled. Someone who knows in advance the Message-ID of an email
  the user is about to receive can send their own email with that ID first; the real one is then dropped as a
  duplicate. Hard to exploit (the ID must be known before delivery) and today's dedup behaves the same. Not
  mitigated in v1; noted so a later change (e.g. dedup per source and folder, or keeping both and flagging the
  clash) can address it.
- **Uploads, promoted documents, internal items**: never deduplicated; each is a new item with its own bytes.
- Never across owners.
- Processing the same file twice is the consumer's choice (`input.dedupe` by sha256, automations spec).

## 9. Extracted text

- Derived from `content`, never part of it. Messages: built from the renditions and forwards
  (`docs/specs/store/attachments.md`, section 17). Documents: extracted text, or the provider's own text. Internal:
  the textual output.
- **The source extracts, the store only stores** (decided 2026-11-18): every item reaches `ingest` with its
  `extracted_text` and `extractor` (name and version of the extraction provider, e.g. `tika@2.9.2`). The store has no
  extraction step of its own.
- **Rebuildable**: when an extractor improves, a job of the extraction subsystem reads outdated items (by `extractor`)
  and their bytes through the store API and writes the new text with `setExtractedText`. It stays traceable what an
  automation read. Rebuilding never moves `ingest_seq` (it is not a new arrival). Failed extractions are retried the
  same way.
- What an automation reads beyond it (renditions, parts) is chosen in its `input` (automations spec).

## 10. Threads

Messages only: `untrusted_attributes.thread_id`, computed once at ingest from the headers as today (first `References`
entry, else `In-Reply-To`, else the own Message-ID; `server/services/app/email_builder.ts`). A pure function of claims,
so it never changes and is sender-controlled: consumers must not trust it blindly (automations spec, thread injection).
Partial expression index on messages. Internal items are grouped by `trusted_attributes.automation_id` (no separate
group key, decided 2026-11-17). Documents have none: they relate through `promoted_from` and tags.

## 11. Parts

Parts belong to an item's `content` (messages: attachments and inline images, `docs/specs/store/attachments.md`).
Every stored part is a `store_files` row of its item (local or external); no bytes in the record (S3), so inline images become
parts too (docs/specs/store/attachments.md section 17).

### Promotion (S14)

A part can also become a document item, with **its own copy of the bytes** (v1, no shared files):
- at ingest only: by the type policy (`promote: true`, section 12) or a rule action (`promote_attachments`, source
  rules spec), passed as `promote` per part to `ingest` (section 14a). By hand after ingest is shelved (section 4a);
- the document gets `arrival: attached`, `promoted_from`, the email's `direction` and `verified`, its own
  `extracted_text` (extraction). The same PDF in a second email is promoted again as a second document (section 4a);
- the email's part stays as it is: the record of what arrived.

## 12. Type policy

Grows out of `limits.attachments` (`server/metadata/app_defaults.json`, docs/specs/store/attachments.md section 4).

```
{ mime: 'application/pdf', accept: true,  extract_text: true,  keep_original: true,  promote: true,  max_mb: 20 }
{ mime: 'text/csv',        accept: true,  extract_text: true,  keep_original: false, promote: false, max_mb: 5 }
{ mime: 'image/*',         accept: true,  extract_text: false, keep_original: true,  promote: false, max_mb: 10 }
{ mime: '*',               accept: false }
```

- First match wins; the last rule is always `*` → `accept: false` (allowlist).
- Levels, each only narrowing: the operator's policy (ceiling) ⊇ the source's or provider instance's subset (grows
  out of `download_attachments`) ⊇ the per-email rule decision (`keep_attachments`, source rules spec).
- Applies to uploads and referenced files too: a referenced file of a type not accepted is not listed as an item.
- Matched on the verified type, not the declared one (as `mismatch` today).
- Rejected parts are still listed with filename, type, size and reason (existing skip reasons, plus `pending`).

## 13. Ingest pipeline

**The source drives ingest; the store executes** (decided 2026-11-18). The source core runs classification and its
rules and then directs the store ("this is an email with two attachments; store them, on instance X, promote the
PDF"). The store never decides what to store and never requests anything from a source. How IMAP supplies the item:
`docs/specs/source/imap.md`; classification and rules: `docs/specs/source/classification.md`,
`docs/specs/source/rules.md`.

Source side (source core):
1. The source provider builds the item: untrusted attributes, content, its `origin` and its mapping to `direction` /
   `verified`, and the list of parts it offers.
2. **Extraction of the item's text** (decided 2026-11-18: the source always extracts) through the extraction subsystem: an
   email's text from its structure (the email builder, extraction provider for `message/rfc822`); a document's text
   from its bytes (Tika, text).
3. Classification on that text plus the part list (classification spec 1a), then the rules. Their outcome decides
   which parts the source provider fetches at all (the source's own filter; nothing is fetched for the store to reject
   later), the target instance, promotion and tags.
4. Fetching the kept parts; extraction of the parts that are promoted to documents (they need their own text).
5. The source hands the store the built item with its text, the fetched parts (promoted ones with their text) and its
   directions.

Store side, in this order:
6. Validate and write the trusted attributes (only the store writes them, section 6).
7. Type policy (operator ceiling, section 12): a part the policy rejects is listed with its reason, whatever the source
   directed.
8. Bytes: written to the directed instance (verified type by magic bytes, as today); found files are registered with
   their locator. One `store_files` row per stored part / original, with the item's id. Promotion: a document item
   per promoted part, with its own copy and its text.
9. The item is written (`state: ok`, or `pending` / `error` with a reason), with its text and the tags the source
   directed (state decided by the source, classification spec section 3).

Back on the source side:
10. Source-provider actions of the rules (IMAP: mv / cp / flags) run after the item is stored.

### Uploads

- In the items page (UI) and through the API under `/items` (multipart). Session or API token; the owner is always
  the authenticated user. CSRF protection as for every session route; request size limit at the server.
- Per file: verified type, type policy, the owner's quota on the local store (`limits.files.max_user_mb`; uploads
  go to the local store). Rejected files are reported
  per file with the reason.
- An uploaded `.eml` is parsed like a fetched email (`message/rfc822`, `arrival: upload`, no `direction`).
- Replacing a document ("upload new version"): later (versions, section 4a); v1: upload it as a new item.
- Filenames are display data only, never part of a path (the local provider uses generated keys).

### Extraction container (S15)

- A separate container, **Apache Tika by default** in the Docker Compose setup (decided 2026-11-18; proven and light; docling is
  better on layout and tables but much heavier, an operator option): bytes in, text out. No database, no providers, no network
  beyond the app.
- Size and time limits per file. **A failure** (decided 2026-11-18): the item is stored without text, `state: error`,
  reason `extraction`; automations that read text skip it until the text exists.
  - **The bytes stay in the store** as the item's normal file: they are the only input for a retry (an upload is gone
    once sent, a mail may have moved on the server) and the user can still open the original. With
    `keep_original: true` they would be stored anyway.
  - **`keep_original: false`** (e.g. CSV): the bytes are kept only until extraction succeeds, then deleted. After N
    failed attempts (new limit) the job gives up: bytes deleted, the item stays without text, a warning event names
    it.
  - **Retry is the extraction subsystem's job, not the store's**: on the existing cron (`nuxt-cron`), e.g. hourly,
    it lists the items with reason `extraction` through the store API, reads their bytes (`read`) and writes the text
    (`setExtractedText`). Backoff between attempts; one immediate run when the operator activates an extractor (e.g.
    sets Tika's URL). A "retry extraction" button in the viewer runs it for one item outside the backoff. Works for
    every item whatever its origin (also uploads, deleted sources): only the bytes are needed.
  - **Late text → classification again, rules not** (decided 2026-11-18): when the retry writes text for an item that
    had none, the job calls the source core's classification for it (`source.ts`), so an upload classified without
    text gets its tags. The rules don't run again: their actions (e.g. IMAP moves) already ran at ingest.
  - **Events** (section 19): "extractor unreachable" once per outage, grouped ("12 items without text: Tika
    unreachable"); "gave up after N attempts" per item.
- Configured by the operator; without it, only text types are extracted (in-process, they need no parser).

### Extraction providers (decided 2026-11-18)

Extraction is its own small subsystem with the same shape as the store (section 19): `server/modules/extraction/`
with `extraction.ts` (entry point), `contract.ts`, `providers/text/` (built in) and `providers/tika/`.

```
interface ExtractionProvider {
  name, version                    // → items.extractor, e.g. 'text@1', 'tika@2.9.2'
  mimes: string[]                  // declared statically in code
  extract(stream, mime) → text
}
```

- `text`: `text/*`, in-process, always active. `tika`: PDF, DOCX, ODT, ...; active only when the operator sets its URL
  (env). docling later as another provider.
- **Callers**: the source core (every new item) and the extraction subsystem's own rebuild / retry job; never the
  store. Internal output (the local notification channel) is already text and needs no extractor.
- **Selection**: `extraction.ts` takes the mime; the first active provider that declares it
  extracts. None → no extracted text, recorded in the item's state.
- **Static mime lists**, not what a running container reports: behaviour doesn't depend on whether the container is up
  at startup, and the lists are testable.
- **Whether vs who**: the type policy decides whether to extract (`extract_text`), the extraction subsystem decides who.
  The type policy settings warn when `extract_text` is on for a mime no active provider handles.
- **Security**: a provider's URL comes only from the operator's environment, never from user input (no SSRF).
- **The store interface is not affected**: storing bytes doesn't depend on the mime. Any type the type policy accepts is
  stored, whether or not it can be extracted (a PDF without Tika is stored, just without text). Fit check: an external
  store provider that only accepts some types (e.g. a document management system taking only PDFs) would add an
  optional `accepts(mime)` later; the local provider accepts everything.

## 14. Store interface and providers

### Interface (the generic stub in the core)

```
interface StoreProvider {                   // v1: the local provider implements exactly this (decided 2026-11-18)
  writable: boolean                          // an instance is either read-write or read-only
  put(bytes) → locator                       // writable only; the provider generates the locator
  get(locator) → stream
  delete(locator)                            // the local provider only: twinbox never deletes at an external one
  list() → every stored locator + mtime      // for the sweeper (later: reconciliation of external instances)
}

// Fit check only, not v1: an external provider may add optional methods; having the method is the capability,
// there are no capability flags.
//   text(locator)    its own extracted text
//   tags(locator)    its own tags (mirrored read-only)
//   limits()         { used?, limit?, pruning? }: what it reports about its own maintenance; twinbox only warns
//   put(bytes, meta) meta it can store (filename, tags)
```

- **Callers never see a provider**: they ask the store for a file by item and part (`read`, section 14a); the store
  resolves the file row, provider instance and locator. "Where is this?" can be looked up (`provider_instance_id`, shown in the viewer), nothing
  depends on it.
- **New bytes** (from sources, uploads, automation output) go to the instance the source directs: a default per
  source provider (IMAP: local), overridable per source and per rule (15.7). Any writable instance can be a target; a
  source may only target system instances or its owner's own user instances. The source settings say so when a
  target is external (the attachments leave twinbox, and their lifecycle is the provider's from then on).
- **Sources need to know only which instances are writable** (decided 2026-11-18): the store lists the owner's
  writable instances; tagging and promotion are local and always available.
- **Sources talk only to the core, never to a provider** (decided 2026-11-18). Discovering files that appear at a
  provider (later, not v1) would be a source's job: a folder-watching source asks the core to list an instance, the
  core calls `list()`, and the source hands in items (`arrival: referenced`) whose file is a locator there. The
  provider knows nothing about sources; it only serves bytes.
- **Only the local provider is built or planned** (repeated 2026-11-18). The interface is designed for extension and
  must not depend on the local provider's specifics; the fit check below uses provider *kinds*, not products.

### Integrity of external files (only for external providers, not part of v1)

Local files are written once under a generated key and never change, so v1 needs none of this (decided 2026-11-18).
It stays as a fit check for the interface; a future provider that needs change detection adds what it needs (e.g. a
`stat()` with a version tag such as an ETag, a version column in `store_files`) in its own spec.

- Changed (detected through that provider's version tag): a new item (new file row, new extracted text; linking it to the old one is later, section 4a), never a silent swap; an automation
  reads what was classified.
- Gone: the item gets `state: error`, reason `gone`. From then on it is twinbox's again: the local pruning rules
  apply to it (section 16), and the user can delete it earlier.
- **Reconciliation**: a daily job per external instance compares `list()` with its `store_files` rows, so files the
  provider removed are marked `gone` without waiting for a read. Batched and rate-limited; an unreachable provider
  marks nothing (a timeout is not a deletion).
- sha256 of a referenced file: the provider's checksum if it has one, else computed on first read.

### Capabilities (fit check, not planned work)

| Optional method (fit check) | local (built) | a file share (kind) | a document management system (kind) | object storage (kind) |
|---|---|---|---|---|
| `writable` (flag, not optional) | yes | yes, unless set up read-only | yes | yes |
| `text()` | — | — | often (OCR) | — |
| `store_tags()` | — | some | yes | object metadata |
| `limits()` | twinbox's own (`limits.files.max_user_mb`, section 16) | some report a quota | — | — |

- Only `local` is built (section 20); the other columns only check that the interface fits.

### Registry and instances (provisional, 2026-11-18)

- **Type registry**: a module-level `Map` provider name → class, filled by static imports (complete as soon as
  anything imports it), like the source provider registry (`server/jobs/sources/registry.ts`). Adding a provider = its
  folder + one line; a duplicate name fails at startup. v1: only `local`.
- **Instances come from the database**, not from registration: a `store_provider_instances` row becomes a live object via
  `createProviderInstance(row)` (config decrypted, passed to the constructor; providers never see the database).
  The core caches live instances by instance id and drops an entry when its config changes or it is removed.
- One server process is assumed (as today: SQLite, one writer, the source poll manager).
- **No timers or pings in v1**: the local provider has no scheduled work (leftover temp files are found by the core's
  sweeper through `list()`). Fit check: a provider with background work later gets `start()` / `stop()`; the core
  guarantees `stop()` on removal, config change and shutdown (a forgotten timer would keep using old credentials);
  the provider manages its own timers and catches its own errors.
- **Maintenance of the local store is core work, not provider work**: pruning (section 16) and the sweeper need the
  database (items, cursors, `store_files` rows), which providers can't reach (section 19). They end in
  `provider.delete(locator)`.

## 14a. Store API (provisional, 2026-11-18)

The contract every caller uses: the source core, the local notification channel, the `/items` routes, the UI and
automations. Nobody but the store calls a provider; nobody but the store touches the store tables (section 18).

```
// Every call gets ctx = { owner_id, actor }: owner from the session or API token, never from the request body.
// Every method checks ownership itself, so no route can forget it.
interface Store {
  // Sources (source core) and the local notification channel
  writableInstances(ctx) → [{ id, name }]
  ingest(ctx, {
    item,                                    // built by the source provider: attributes, content,
                                             // extracted_text + extractor (the source always extracts)
    parts: [{ part_id, bytes, promote?, extracted_text?, extractor? }],
                                             // only what the source decided to hand over; promote: also a
                                             // document, then with its text
    target_instance?,                        // default: local
    tags?: [{ tag_id, origin, state, set_by }]
  }) → item_id                               // a fetched email already stored (same Message-ID) → the existing id

  // Items: UI, /items routes, automations
  get(ctx, item_id) → item + its file list (part ids, mime, size; no locators)
  list(ctx, query, { after_seq?, limit })    // query = the structured object (automations spec 27);
                                             // after_seq = cursor over ingest_seq
  delete(ctx, item_ids[])
  setExtractedText(ctx, item_id, text, extractor)   // the extraction subsystem's rebuild / retry job only
  ownersNeedingExtraction() → owner_ids[]   // the one call without ctx: ids only, no items, no content; the job
                                             // then works per owner with that owner's normal ctx
  read(ctx, item_id, part_id?) → { stream, mime, size, name }
                                             // bytes of one file; part_id null = the item's own file; name from
                                             // the item side. File ids never leave the store

  // Tags
  listTags / createTag / updateTag / deleteTag(ctx, ...)
  tag(ctx, item_ids[], tag_id, { origin, state })   // bulk; checks ownership of every item and of the tag
  untag(ctx, item_ids[], tag_id)
  confirm(ctx, item_ids[], tag_ids?)

  // Storage page (quota bar, totals per category)
  usage(ctx) → { bytes, limit, per_category }
}
```

- **Uploads have no method of their own**: the route goes through the built-in upload source, which calls
  `ingest` (15.8); every item enters the same way.
- **No system ctx** (decided 2026-11-18): there is no ctx that sees every owner. Sources and automations belong to
  one owner; pruning and the sweeper run inside `internal/`. The extraction job is the only caller that must find
  items across owners, and `ownersNeedingExtraction()` gives it owner ids, nothing more.
- **Not in the API**: pruning, the sweeper (core jobs); the pruning hold for automations
  registers through a hook (section 16).
- Shelved (section 4a): manual promotion after ingest, removing a single part.

### Scopes

- **System** provider instance: the local disk (`docs/specs/store/local.md`), configured by the operator; holds every
  local file of every owner, isolated by `owner_id` (as today).
- **User** provider instances: a user's own external accounts (none planned); configured per user, secrets encrypted, usable only
  for that owner's items. A request for another owner's file through a user instance is "not found".

## 15. Decisions log

**Open** (as of 2026-11-18; everything numbered below is decided):
- none.

1. **`ingest_seq` = `INTEGER PRIMARY KEY AUTOINCREMENT`** (decided 2026-11-16), text `id` unique beside it.
   `AUTOINCREMENT` never reuses a number, even after deletes (SQLite keeps the high-water mark in `sqlite_sequence`;
   no counter code of ours); an explicit integer primary key is not renumbered by `VACUUM`. Rejected: the implicit
   rowid of a text-keyed table (renumbered, reused) and `MAX + 1` (reuses the number of a deleted newest item, so a
   cursor that passed it skips the new one). SQLite has one writer at a time, so number order = commit order.
   Drizzle: `integer(...).primaryKey({ autoIncrement: true })`.
2. **Columns** (S12, decided 2026-11-16): `arrival` becomes a column (every item has one; in nearly every selection,
   e.g. "never own output"). Not columns, because only messages have them:
   - `direction` (`trusted_attributes`): derived by the source provider, not by the source: one IMAP source has INBOX
     (`in`) and Sent (`out`). Stored so rules need no IMAP knowledge; null for documents and internal items.
     Partial expression index `WHERE direction IS NOT NULL`.
   - sender address (`untrusted_attributes.from`): a untrusted attribute of every message, whatever its source (IMAP,
     `.eml` upload, later chat); documents have none. Stored normalized (lowercase address); partial expression
     index on messages.
   - `verified` stays JSON without an index (read at ingest for auto-confirm, not filtered across many items).
   Revised 2026-11-17: `source_id`, `date` and `group_id` are no columns either (not every item has them):
   `source_id` → `trusted_attributes`; `date` and the thread (`thread_id`) → `untrusted_attributes`; `group_id` is gone
   (internal items group by `automation_id`). Sorting uses the generated `sort_date` column (section 4).
3. **API: `/items`** (decided 2026-11-16); `/email` and `/artifacts` go away with the migration.
4. **Same file in different dedup scopes**: superseded 2026-11-18, no file dedup in v1 (section 4a).
5. **No dedup across providers** (decided 2026-11-16): S17.
6. **Removing a provider instance** (decided 2026-11-16): the UI lists the local data that relates to it (items whose
   bytes are there, their text and tags) and offers to reclaim it. Files at the provider are never deleted.
7. **Rule-based routing of parts** ("if an attached PDF looks like an offer to Waldmann, store it on provider X
   with tag T", decided 2026-11-16): a rule action with a target instance and tags; the test is a tag (its
   description is the criterion). Classification: once per item, start simple (decided 2026-11-18): an email with
   attachments is one evaluation in the source; its result applies to the email and steers what happens to its
   parts. Details in `docs/specs/source/rules.md` and `docs/specs/source/classification.md`.
   Resolved (2026-11-18): an attacker's email can't steer what lands in an external store without the user, because
   routing to an external instance is a `leaves` action and waits on untrusted input (source rules spec, section 3).
   Remains outside twinbox: that store's own automation (e.g. auto-matching in a document management system) and its tags; twinbox mirrors
   them read-only and keeps its own tags next to them.
8. **Upload source** (decided yes 2026-11-16, built with the sources work): uploads get a built-in source per user,
   like staging. Until then uploads have `source_id` null.
9. **No lifecycle owner per item** (decided 2026-11-16): pruning and quotas are per user on the local store
   (section 16; external providers maintain themselves, 15.13). `source_id` is a fact, `store_files.provider_instance_id` says where bytes are; neither owns the item.
10. **Only the local store's rules prune** (decided 2026-11-16, narrowed to the local store 2026-11-18): no per-source limits and no automation retention for
    internal items. A source or automation that needs its own pruning flow uses the items API (`/items`), worst case.
11. **Three JSON places** (decided 2026-11-17, S12): untrusted attributes stay separate from `content`, which keeps only
    structure. The claim keys of today's top-level envelope (from, to, cc, date, message_id, subject → `title`) move
    out of `content`, so no value exists twice. Claims are filterable (rules, filters, the query builder), but a
    match that unlocks something an attacker wants (auto-confirm, routing to an external store, tools, auto-reply)
    must pair the claim with `verified` (S11, source rules spec).
12. **`sort_date`** (decided 2026-11-17): generated column, clamped to `created_at` so a future `Date` can't pin a
    mail to the top. `created_at` and `untrusted_attributes.date` must use the same ISO format, or the string
    comparison is wrong (tested).
13. **External providers maintain themselves** (decided 2026-11-18): twinbox never deletes, prunes or enforces a quota
    at an external provider, also not for files it wrote there. A provider may report its limits and pruning
    (`limits()`); twinbox turns that into a warning event (e.g. "provider X is 90 % full") and nothing else. A file the
    provider removed shows up as `gone` on the next read (section 14).
14. **The source directs, the store executes** (decided 2026-11-18): the store never requests parts or decides what to
    keep; the source's rules decide what is fetched and handed over (section 13). The type policy stays the store's
    ceiling.
15. **Instances are read-write or read-only** (decided 2026-11-18): no finer write / delete capabilities. Sources only
    need the list of writable instances; tagging and promotion are local and always available.
16. **Persisted externally = the provider's responsibility** (decided 2026-11-18): once an item's bytes are at an
    external provider, its lifecycle follows the file there, record included. The local rules don't prune it; it
    falls back to them only when the file is `gone` (reconciliation, section 14). Cost: such records (extracted text,
    tags) grow with the provider, bounded by the provider's own maintenance and the operator's system caps.
    Later, only if database size matters: the extracted text of external items is a cache (rebuildable from the file
    or the provider's own text) and could be dropped and fetched on demand. Tags are the user's work and
    always stay as long as the file does.
17. **Inline images: a source setting, default on** (decided 2026-11-18): "store inline images" sits in the source's
    level of the type policy (section 12, grows out of `download_attachments`); a rule's `keep_attachments` can
    narrow it per mail. Default on = today's behaviour: today they are always kept, as `data:` URIs inside the HTML
    rendition in the database (`docs/specs/store/attachments.md` section 4); v1 only moves those bytes to files (S3).
    Off is an option per source (e.g. a newsletter mailbox); the viewer then shows the mail without them.

## 16. Lifecycle

### Pruning (S16)

Per user on the local store: `retention_days`, `max_items`, `max_size_mb`, each optional, under the operator's system
caps (`server/jobs/sources/limits.ts`). They cover items whose bytes are local, items without files (an email
without stored parts, a notification) and items marked `gone`. **An item whose bytes are at an external provider is
that provider's responsibility** (15.16): the local rules don't prune it; its record lives as long as the file does.
An email is a local item even if a part was routed out; pruning the email leaves the routed document item alone.
The operator's system caps still apply to everything, as the server's safety net.

- These are the only pruning rules (15.10). They replace today's per-source limits (`retention_days`, `max_items`,
  `max_size_mb` on each IMAP source) and the automations' retention of persisted notifications
  (`artifactService.applyRetention`). A source or automation that needs its own pruning flow uses the items API.
- Migration: the strictest of a user's source limits becomes their local rule set; the release notes say so. A
  behaviour change, the exception to "no behaviour change on migration" (section 1).

A hook lets consumers hold items: nothing above the lowest active cursor that matches is pruned (automations spec), capped
by the system limits.

### Deletion

- **Deleting a source** asks: "also delete its N items?", default **keep**. Kept items keep their `source_id` as a
  historical fact and stay under their user's provider rules, so nothing is left unpruned. (Today's
  `sources.delete()` leaves a dangling `source_id` that no source prunes; the per-provider rules fix this with the
  migration, not before, decided 2026-11-16.)
- **Local files** are deleted with their item (they belong to it alone), and orphans by the hourly sweeper.
  **External files are never deleted at the provider** (15.13); only their `store_files` row goes.
- **Quota** on the local store only: per owner over local files (`limits.files.max_user_mb`, as now) plus the item
  records. An external provider's own limits are shown and warned about if it reports them (`limits()`, 15.13); a
  full provider fails the write visibly (part `state: error`). External files don't count against twinbox's quota.
- **No file dedup in v1** (section 4a): today's per-owner sha256 dedup (attachments spec D9) is dropped; the
  migration copies shared bytes (section 20).
- Account deletion removes items, tags, local files and the user's provider instances; files at external
  providers stay.

## 17. UI

- **Items page** replaces the emails and artifacts pages (kept as saved filters: "Emails" = `message/rfc822`,
  "Output" = `arrival: internal`, "Documents").
  - List with filters: mime, source, provider, trusted attributes, date, tag. Upload button.
  - **Tag sidebar** as facets: every tag with its count and its number of suggestions; click to filter.
  - **Review** lives on its own page (`docs/specs/source/rules.md` section 5): **Waiting** (the trust question per
    sender, waiting actions) and **Log** (what happened on the user's behalf). The items list keeps the filter
    `state: suggested` for browsing suggestions nothing waits on.
  - **Viewer** as today, plus tags (add, confirm, remove), the email it came from (`promoted_from`) and the documents promoted from an email,
    where the bytes are ("local", or the instance name and its locator).
  - **"Create tag from this"**: from a selection or filtered view, with a description suggested from the visible
    items.
- **Tag dialog** (from the sidebar and the viewer): name, description, color, scope, "used by"
  (automations, rules), **"test description"** (run the classifier on the last N items, show what would be tagged).
- **Tags settings page**: all tags with count, usage, last match, LLM calls per day; merge and delete.
- **Storage rules** (user settings): the local store's pruning and quota rules (section 16); external instances show
  what they report about their own limits.
- **Provider instances** (user settings, once an external provider exists): add an account, test; remove with the
  reclaim list (15.6).
- **Source settings**: target provider instance (default from the source provider).
- **Automations** reuse the items list for the selection picker with a live preview ("matches 14 items").
- **Sources** hold the rules (actions) next to connection and type policy.
- **Storage page**: usage of local files, as today.
- HTML and documents stay sandboxed in the viewer.

## 18. Security

- **Isolation**: every query scoped by `owner_id`, every file lookup through its item; local files never shared across owners
  (docs/specs/store/attachments.md section 11). User provider instances only usable for their owner. The store
  (`server/modules/store/`, through `store.ts`) is the only code touching `store_items`, `store_item_tags`, `store_tags`, `store_files`,
  `store_provider_instances`.
- **API tokens** reach the store only with store scopes (`store:read`, `write`, `delete`, `store_tags`;
  `docs/specs/core/api_tokens.md`); without `store:tags` a token can only suggest tags.
- **Everything ingested is untrusted**: emails, documents (hidden text in PDFs), referenced files. The store marks
  trust in the trusted attributes (`verified`, `arrival`, `direction`) and in tag origin and state; consumers decide.
- **Parsers**: MIME in-process as today; PDF, DOCX and other documents only in the extraction container (S15).
- **Tagging checks ownership**: setting or removing a tag (single or bulk) verifies that the tag and **every** item
  belong to the same owner, in the same query that writes; a guessed item or tag id of another user fails the whole
  request.
- **SSRF**: provider URLs are user input. Validate scheme and host; block private and loopback addresses unless the
  operator allows them. Timeouts on every remote call; a slow or offline provider fails the read visibly
  (`state: error`) and never blocks a poll or a run.
- **Secrets** (provider tokens, app passwords) encrypted like IMAP credentials (docs/specs/source/sources.md
  section 9); recommend a dedicated read-only account per external provider.
- **Serving**: files keep the hardened route and download-only rules of docs/specs/store/attachments.md section 9,
  whatever provider holds them (the route streams through the store, never redirects to the provider).

## 18a. Later: shared spaces (not designed, not precluded)

Users may later share a subset of their store with coworkers, working on the same items and tags (raised
2026-11-18). Nothing is designed yet; these choices keep it possible:

1. **Sharing is ownership, not a provider.** A provider says where bytes live; sharing says who may see and change
   records. A "shared_local" provider would mix the two. Likely shape: a **space** (team) is an owner like a user; a
   member shares an item into it explicitly (copy of the record and its bytes), and the space has its own tags.
2. **`owner_id` means the owner, not the acting user.** Every table already uses `owner_id`; who did something is
   recorded separately (`store_item_tags.set_by`, `verified.identity` of an upload, the action log). Never derive the actor from
   `owner_id`, never derive the owner from the session user outside the store.
3. **One place resolves access.** Only the store (`internal/`) touches the store tables (section 18); today it checks
   `owner_id = session user`, later `owner_id IN (user, user's spaces)`. No route or module compares owner ids
   itself.
4. **Sharing into a space is a `leaves` action** (`docs/specs/source/rules.md` section 3): data reaches other people,
   so on untrusted input it waits for the user.
5. **Trust does not travel.** A coworker's confirmation is `origin: user` in the space, but it is not the reader's
   own decision; consumers that trust confirmed user tags (reference context) will need "confirmed by me" vs
   "confirmed by a member". `set_by` already records who. No new trust layer: the store keeps recording facts, and
   the consumer's selection gets one more condition (`set_by` = the automation's owner, or a member the space trusts;
   a per-space setting for space automations). A shared copy keeps the original's trusted attributes, with
   `arrival: shared` and the sharing member.
6. Sources, allowlists and trust decisions stay per user; a space has no sources of its own.

## 19. Layers and file structure (decided 2026-11-18)

Every subsystem has the same shape: one folder, one entry file, its internals, its **providers** (the pluggable
implementations: store providers here; source providers such as IMAP for sources, formerly "source types").

```
server/modules/store/
  store.ts            the store API (section 14a); exports its types; the only file the rest of the app imports
  contract.ts         the StoreProvider interface + helpers providers may use (later e.g. an SSRF-safe HTTP client)
  internal/           ingest, items, tags, pruning, sweeper, registry; owns the store tables (no extraction)
    deps.ts           everything it uses from the rest of the app (database, events, live updates), as
                      server/jobs/sources/deps.ts today
  providers/
    local/            the local provider (docs/specs/store/local.md); its own types in its folder
```

TypeScript types: what crosses between the store and its providers is in `contract.ts`; a provider's own types stay
in its folder; the store API's types (`Item`, ingest input, ...) are exported by `store.ts`, and those the browser
needs too (the item shape for the viewer) live in `shared/types/`, as `shared/types/email.ts` today.

**Table names carry the subsystem as prefix** (decided 2026-11-18): `store_items`, `store_files`, `store_tags`,
`store_item_tags`, `store_provider_instances`; the source subsystem's `source_pending_actions`, `source_action_log`.
The owner of every table is visible in the database itself. Existing tables (`sources`, `automations`, ...) are
renamed when their subsystem moves to `server/modules/` (`sources` → `source_instances`, decided 2026-11-18, matching
`store_provider_instances`); base-app tables (users, events) keep their names. Each
subsystem's table definitions are one file in `server/db/schema/<subsystem>.ts` (`server/db/schema/store.ts`): the
place NuxtHub reads natively (also in its dev watcher), so no build hook is needed. Lint rule B covers it: only the
store's `internal/` imports `server/db/schema/store.ts`.

Three lint rules (`no-restricted-imports`), each a build error:

- **A, providers stay in their folder**: `providers/<name>/**` imports only its own folder, `../../contract.ts`,
  `#shared/**` and npm packages. Not the database (`hub:db`, `#server/db/*`), not `internal/`, not other providers.
  Keeps providers away from other owners' data.
- **B, one entry point**: outside `server/modules/store/**`, nothing imports `internal/**`, `providers/**`,
  `contract.ts` or the store's table definitions (`server/db/schema/store.ts`); only `store.ts`. No route can reach a table or provider past the ownership checks of the API.
- **C, providers only through the registry**: `internal/**` never imports `providers/**` directly; the registry's
  one import list is the exception. Adding a provider never touches store code.

- **Store API** (section 14a): the source core calls it directly; the store registers nothing with the rules engine
  and knows nothing about rules. It checks ownership, type policy and writability on every call (source rules spec,
  point 9).
- **Providers** implement the store interface. Only `local` is built (`docs/specs/store/local.md`); it is a provider
  like any other, no special place. A provider gets its config (secrets decrypted) through its constructor and
  returns bytes and listings; it never writes items, `store_files` rows or trusted attributes.
- **Events and live updates** (decided 2026-11-18): each subsystem's `internal/` reports through its `deps.ts`:
  `emitTelemetryEvent` (user events, base app) and `notifyUser` (live updates over SSE). **Providers never send
  events** (rule A: they can't reach the base app); a provider throws, the subsystem's `internal/` turns the error into
  an event, so events have one format and no provider writes event text.
  - Source: fetch errors, the missing authentication header (once per source), failed rule actions (also in the action
    log). Extraction: "extractor unreachable" once per outage, not per item; "gave up after N attempts" per item.
    Store: quota almost full / write rejected; `notifyUser` "items changed" so open lists update live (as today).
  - Related errors are grouped into one event ("12 items without text: Tika unreachable"), like today's source
    failures, so an outage doesn't flood the event log.
  - Event texts can carry sender-controlled data (filename, subject): shown as plain text, never HTML; never secrets
    or extracted text.
- **Contract tests**: one suite runs against every provider (put / get / delete, list).
- Pruning moves out of the source providers into the store (today each prunes itself,
  `server/jobs/sources/types/imap/index.ts:291`).
- Sources (IMAP, staging) keep their place (`server/jobs/sources/types/`) for now and hand built items to the store
  through `store.ts`; moving them to `server/modules/source/` (`source.ts`, `internal/`, `providers/imap/`) is not
  part of the store work. Notification channels follow the same shape later (`server/modules/notification/`).

## 20. Migration and build order (each step verified before the next)

1. Store core and the local provider (`docs/specs/store/local.md`, today's disk storage behind the interface):
   `store_items`, `store_files` (with provider, `item_id` and `part_id` columns), `store_provider_instances`, `store_tags`, `store_item_tags`,
   the store API (`store.ts`), pruning per user on the local store (section 16). Migrate `emails` → items (`message/rfc822`), `artifacts` → items (`arrival: internal`),
   file references → `store_files.item_id` / `part_id`; a file today shared by several emails is copied once per extra
   email (no shared bytes in v1). Routes move to `/items` (`/email`, `/artifacts` removed); viewer, sources and the
   local channel use the store. Source deletion asks (section 16). No other behaviour change; existing tests pass.
2. Uploads (UI and API), the extraction subsystem (providers `text`, `tika`; the retry job), items page with documents.
3. Inline images as parts, type policy for IMAP parts (replaces `limits.attachments`, adds `promote`), domain
   authentication (`docs/specs/source/imap.md`).
4. `docs/specs/source/classification.md` (tagging, trust, review question), `docs/specs/source/rules.md` (rules, actions, waiting actions, action log, review page) and `docs/specs/core/automations.md` (select, context, input, trigger).
5. External providers: not planned; built when needed, against the interface and contract tests of step 1.
