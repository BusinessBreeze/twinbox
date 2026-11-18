# SPEC: IMAP Source Type (changes with the store)

Status: draft (concept only, nothing implemented). How the IMAP source provider supplies items to the store
(`docs/specs/store/store.md`, sections 6, 13 and 19). Out of scope: the IMAP channel (destination,
`server/services/app/notification_imap.ts`). Connection, saved searches, keys and checkpoints stay as described in
`docs/specs/source/sources.md` (sections 4 and 6); this spec covers what changes with the store.

## 1. What the source provider returns

For each fetched email, a built item (store spec section 13, step 1):

| Field | From |
|---|---|
| mime | `message/rfc822` |
| untrusted attributes | headers: `title` = Subject; `untrusted_attributes`: date, message_id (also the dedup key), thread_id, from (normalized lowercase address), to, cc, list_id. Reply-To, In-Reply-To and References go to `content` (store spec section 5a) |
| content | `buildEmail` (`server/services/app/email_builder.ts`), structure per `docs/specs/store/attachments.md` |
| origin | `{ folder, key, uid, uidvalidity, auth: { dkim, spf, dmarc, d, arc? } }`; queryable: `folder` |
| direction | section 2 |
| verified | section 3 |
| parts offered | from BODYSTRUCTURE: every part with its position, declared type, size, disposition |

## 2. Direction

- `out` when the email was fetched from the Sent folder, `in` otherwise.
- Sent folder: SPECIAL-USE `\Sent` (RFC 6154, reported by `imapflow`), else chosen by the user in the source's
  settings. Gmail: `[Gmail]/Sent Mail`.
- Fetched only while at least one automation on the source has `context.thread.include_sent`
  (`docs/specs/core/automations.md`, point 15): the source subscribes its Sent folder then, and drops it when none
  does. Text only, no attachments, not classified; the first fetch reaches back `new_search_since_days`.

## 3. Verification (domain authentication)

Determined at ingest (DKIM keys rotate and signatures expire, so a later check can fail for a valid email):

1. **Trusted header first**: the topmost `Authentication-Results` (RFC 8601) whose `authserv-id` is the source's
   trusted one. A source setting, proposed from the first emails, confirmed by the user. All other
   `Authentication-Results` headers are ignored: senders can add their own.
2. **No fallback** (decided 2026-11-18): when the trusted header is missing, the email gets `result: none`
   (unverified). Checking DKIM ourselves would need the whole raw message, attachments included (the signature
   covers the body hash), which defeats the selective download. The big providers set the header; the user's does.
   A source whose emails lack it gets **one warning event per source** (not per email, repeated only after the
   header was seen again and went missing): "your mail server adds no authentication results; emails from this
   source count as unverified". No per-email review: every email would land there, and "Always" needs a verified
   identity anyway. Later option: trust rules per domain for an IMAP source (e.g. "treat mail from acme.de as
   verified on this source"), a source setting; not designed now.
3. **Result**: `verified = { identity: 'domain:<aligned domain>', method: 'dmarc', result }`, `result = pass` only for
   a DMARC-aligned pass. The details (DKIM, SPF, DMARC, `d=`, ARC) go to `origin.auth`.
4. **Limits**: it authenticates domains, not people (lookalike domains pass). Forwarding breaks SPF and often DKIM
   (the e4e1 test setup), mailing lists break DKIM; ARC results are recorded when present.
5. **DNS**: timeouts and a cache, so a slow DNS answer can't block a poll.
6. Sent items (`direction: out`) are not verified (`result: none`): they are the owner's own.

## 4. Fetch order

1. Headers, BODYSTRUCTURE and the text renditions (small, always fetched).
2. The source core extracts the email's text (email builder), then runs classification and rules (store spec
   section 13, steps 2–3).
3. Only the parts the type policy accepts and the rules keep are downloaded, each fetched on its own by its part
   number (no full-message download); promoted parts are extracted (step 4 there).
4. The store stores bytes and the item, text included (steps 6–9 there).
5. The rules' IMAP actions (mv, cp, mark read, mark important) run after the item is stored, in one short session.
   A failure is a warning; the item stays stored. Storing before moving means no stale UIDs.
6. Checkpoints advance as today (`docs/specs/source/sources.md` section 6).

A classification error leaves the offered parts `pending`; they are fetched once the retry passes.

## 5. Dedup and pruning

- Message-ID: the same email in two folders (or Gmail labels / All Mail) is one item. `origin` records the folder it
  was first fetched from (immutable).
- Pruning moves to the store (store spec S16, section 19): the type's `prune()` (`server/jobs/sources/types/imap/
  index.ts:291`) goes away; the core prunes by the source instance's limits.

## 6. Security

- `verified` is the most security-relevant output of this source provider: every trust rule relies on it. Tests
  cover at least: a forged `Authentication-Results` from another authserv-id is ignored;
  DMARC fail → `result: fail`; DKIM pass with a non-aligned `d=` → not `pass`; a Sent-folder email → `direction: out`,
  `result: none`; a lookalike domain passes as its own domain, never as the real one.
- Credentials stay encrypted as today (`docs/specs/source/sources.md` section 9).
- Parsing stays in-process (MIME only; document parsing is the extraction container's).

## 7. Decided (former open points)

1. DKIM fallback: decided 2026-11-18, none (section 3, point 2).
2. Record further sightings of the same email (another folder, a Gmail label)? Decided 2026-11-18: not at all;
   there are no item links in v1 (store spec section 4a).
