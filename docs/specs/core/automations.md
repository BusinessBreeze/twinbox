# SPEC: Automation Queries

Status: draft (concept only, nothing implemented). Split out of the former `docs/specs/core/rules_queries.md`
(2026-11-18). Builds on `docs/specs/store/store.md` (items, trusted attributes, tags, `ingest_seq`, `promoted_from`, pruning
hook) and `docs/specs/source/classification.md`. Replaces per-automation filters (`automations.options`) and the
per-poll coupling of automations to sources (`server/jobs/automations/run_source.ts`).

## 1. Model

Automations are consumers of the store: `{ select, context, input, trigger, cursor, tasks }`. No IMAP access, no
filter of their own, no knowledge of source rules.

- **select**: which items are processed (tags + trusted attributes + untrusted attributes); the cursor advances over it.
- **context**: what each selected item is handed over with; never selected itself.
- **input**: which pieces of an item the tasks get.
- **trigger**: `on_new` (each tick with new matching items) or `cron` (a schedule).

## 2. Selection, cursor and trigger

1. **Cursor**: the highest `ingest_seq` processed. A date cursor misses or doubles items. Later, for per-item retry:
    `automation_items(automation_id, item_id, status)`.
2. **Trigger** `on_new | cron`, not timer-only. Cron chosen with a picker, validated server-side. `on_new` latency is
    at most one tick (1 min).
3. **Batch cap** per run (new limit), warning event when hit.
4. **Start of a new automation**: its cursor starts at the current highest `ingest_seq` ("from now"), so a new
    automation never runs over the whole store. The form offers "also process items from the last N days" with a
    preview count; the batch cap applies. Same for `on_new` and `cron`. (Items already in the store; nothing is
    fetched from sources for it.)
5. **Pruning hold**: through the store's hook, nothing above the lowest cursor of the active automations that match
    it is pruned, capped by the system limits.
6. **Never select own output**: items with `arrival: internal` and `automation_id` = the automation itself are
    excluded. Selecting other automations' output (chains) needs a depth limit (`chain_depth`); own spec.
7. **Never select `direction: out`**: an `on_new` automation must never answer own mail.
8. **Selection on tags** may require `state: confirmed` (default for automations with sending or drafting tasks) or
    accept suggestions (default for the rest, e.g. digests).
9. **Selection preview** in the form: the items list with the current selection ("matches 14 items, latest: ...").

## 3. Context

```
context: {
  thread:    false | { include_sent: boolean }   // messages only; include_sent default true
  origin:    boolean                             // documents only: the email they were promoted from (promoted_from)
  reference: { tags: [...], mime?: [...] }       // any mime, any source: explicit
}
```

The form offers `thread` only when the selection can contain messages and `origin` only when it can contain
documents; validated on save.

### Thread (implicit, messages)
10. **Several new items in one thread in one run**: one unit per thread with all new ones marked, not one per item.
11. **Size**: strip quoted text from older messages (keep it in the newest), cap by count or characters, drop the
    oldest first, note the truncation.
12. **Context ignores tags**: thread messages that didn't get the selected tags are included. Said in the UI.
13. **Order**: by `Date` header, then `ingest_seq` (the header is sender-controlled).
14. **Gaps**: pruned messages are missing; own replies are missing unless `include_sent`.
15. **Sent items** (`include_sent`, default on): fetched at ingest, never at run time (automations stay without IMAP;
    searching Sent per thread is slow and misses archived replies). The source subscribes its Sent folder while at
    least one automation has `include_sent`, and drops it when none does. Folder via SPECIAL-USE `\Sent` (RFC 6154),
    else chosen by the user; mapped to `direction: out`. Text only, no attachments, not classified; first fetch only
    as far back as `new_search_since_days`. The form says that turning it on fetches the Sent folder.
16. **Security: thread injection.** `untrusted_attributes.thread_id` comes from sender-controlled `References` / `In-Reply-To`. An outsider
    who knows a Message-ID can attach to another conversation and, with prompt injection, leak it through a task that
    replies or sends. Expand within the same source only, and include a context message only if it shares a
    participant with the new item, confirmed by `verified` where available. Required when `include_sent` is on (Sent
    is the most sensitive folder); thread context is not shipped for sending tasks without it.

### Origin (documents)
17. Example: "summarize this contract, with the cover email as context". Follows `promoted_from` (one email in v1),
    capped like the thread.

### Reference (explicit)
18. Example: select quote requests (tag `quote-request`), reference the tag `price-list` → the task drafts a reply
    with the price list.
19. **Only confirmed tags with `origin: user`.** Never suggestions, never `rule` or `external` tags unless the user
    marks the source or tag as trusted: an attacker's email could earn a classifier tag, and external tags are
    content-driven.
20. **Draft-only**: an automation with reference context can't contain a sending task (validated on save); output =
    drafts (IMAP APPEND to Drafts) listing the references used. Keep internal-only documents (margins, purchase
    prices) out of reference tags: the model can't reliably keep secret what it was given.
21. **Size**: capped with a warning. Retrieval (RAG) later as an extension of `reference`, own spec.

## 4. Input (which pieces of an item the tasks get)

A fixed vocabulary, not a path language (no XPath / JSONPath over MIME):

```
input: {
  unit:       'item' | 'part'                       // one task item per item (bundle), or one per matching part
  text:       boolean                               // extracted text, the default
  renditions: ('text/html' | 'text/plain')[]        // messages: the body in a specific format
  parts:      { mime?: string[], disposition?: 'attachment' | 'inline', filename?: string }   // stored parts only
  embedded:   boolean                               // messages: forwards / bounces, their renditions and parts
  dedupe:     'none' | 'content'                    // content: skip parts whose sha256 this automation processed
}
```

- HTML of a mail: `{ unit: 'item', renditions: ['text/html'] }`
- Attachments of the selected emails, one task item each: `{ unit: 'part', parts: { mime: ['application/pdf'] } }`
  (or select the promoted documents directly)
- Everything of a mail: `{ unit: 'item', text: true, parts: {}, embedded: true }` (a bundle)

Each produced task item carries its mime (`server/jobs/automations/tasks/types.ts`); the form checks on save that the
first task accepts it (cf. "show only task types for which you have mime sources").

22. **`unit: part` with thread context**: not allowed (the thread belongs to the item, not to one attachment).
23. **Parts not stored** (`status` ≠ `stored`) are skipped; if none remain, the item produces no task item and a
    warning event names the item and the reasons (decided 2026-11-16).
24. **`dedupe: content`** skips are shown in the run log ("same file as in email X"), never silent.
25. **HTML renditions are untrusted**: tasks never render them; size caps as for text.

## 5. Security

26. **Items are untrusted**: tasks treat them as untrusted; trust only comes from confirmed tags or a verified ingest
    attribute (classification spec, section 3; point 19).
27. **Queries are structured objects** (whitelisted fields: general trusted attributes, declared `origin` keys, untrusted attributes,
    tags; whitelisted operators; `owner_id` always enforced), never raw SQL or free expressions. A later
    natural-language query builder produces this object, shown for confirmation.
28. **Tag state is the consumer's choice** (store spec, `store_item_tags`): each automation states which origins and states
    it accepts (8, 19); the store does not know what a tag triggers.

## 6. Migration

Each existing automation becomes:
- a **tag** whose description is its `filter_prompt` (rephrased by the user later if needed), scope = its source;
  the automation's selection accepts suggested tags (today's filters act without confirmation; keeps behaviour);
- a **rule** on its source with its IMAP options (`docs/specs/source/rules.md` section 7);
- an **automation** selecting that tag, `trigger: on_new`, `context: { thread: false }`,
  `input: { unit: 'item', text: true }`.

Automations without a filter select their source key's items directly. Runs after the store migration (store spec
section 20, step 4).
