# SPEC: Classification

Status: draft (concept only, nothing implemented). Split out of the former `docs/specs/core/rules_queries.md`
(2026-11-18). Part of the source core (`docs/specs/source/sources.md`), like the rules: **every trust decision is made in
the source** (decided 2026-11-18); the store only records the outcome (`store_item_tags` origin and state). Builds on
`docs/specs/store/store.md` (items, trusted attributes, tags, `store_item_tags`).

## 1. Model

Classification is tagging on the user's behalf, in the source run: at ingest, one LLM call per item puts tags on
it, through the store's tag API. A
tag's description is its criterion (store spec section 4). It writes nothing but `store_item_tags` rows; what a tag triggers
is decided elsewhere (source rules: `docs/specs/source/rules.md`; automations: `docs/specs/core/automations.md`).

Order at ingest: store spec section 13 (emails: classification after the text, before the part download, so rules can
decide which parts to keep).

## 2. The call

1. **One call per item, multi-label**: the classifier gets the item's extracted text and the descriptions of every tag
   in scope (`store_tags.scope`: mime, sources) and returns all that apply. Ten tags cost one call, not ten. Tags without a
   description and external tags are never in the prompt.
1a. **Once per item, start simple** (decided 2026-11-18): an email with attachments is one evaluation. It runs before
    the part download (rules decide which parts to keep), so it sees the email's extracted text plus the list of parts
    (filename, mime, size), not the attachments' contents. Promoted documents are not classified on their own; they
    get tags from rule actions (`route: { tags }`, `tag`) or by hand. Per-part or per-document classification is a
    later extension if the email text turns out not to be enough.
2. **Failure ≠ no tag**: a classification error is recorded on the item (`state` / reason) and retried on the next
   run, shown on the dashboard. Otherwise a fail-closed classifier makes items silently invisible to every rule and
   automation (cf. commit 936567e: an unusable model answer is an error with a link).
3. **New tags only by the user**: the classifier may propose one ("several items look like NDAs, create tag?"), never
   create it: an uncontrolled vocabulary costs money, and an injected prompt could add tags.
4. **Changing a description** applies to new items only. Re-classifying old ones = explicit "re-run on last N days".
   The tag dialog's "test description" shows the effect on the last N items before saving.
5. **Cost**: scope keeps prompts small; a vocabulary cap per call (new limit in `server/metadata/app_defaults.json`);
   LLM calls per day per tag on the tags settings page; "used by" per tag, warning when a tag has no consumer.
6. **Sent items** (`direction: out`) and internal items are not classified by default.
6a. **Text that arrives later** (decided 2026-11-18): an item whose extraction failed at ingest is classified without
    text. When the extraction subsystem's retry writes its text, it calls classification for that item again; the
    rules don't run again (their actions already ran). Store spec section 13.

## 3. Trust: the input decides, not the tag

Classifier tags act on the user's behalf and follow the same flow as manual tagging. The only question is whether
the **input** (what the classifier read) is trustworthy (decided 2026-11-18):

7. **Trusted input** → `origin: rule`, `state: confirmed` directly: `verified.result = pass` and `verified.identity`
   on the user's allowlist (e.g. the own company domain), a local upload (`identity: user:<id>`), or the user's own
   items.
8. **Untrusted input** (unknown or unverified sender) → `origin: rule`, `state: suggested`.
9. **Review asks about the sender, not the tag**: "Trust mail from x?" → **No** / **This once** / **Always**
   (review page: `docs/specs/source/rules.md` section 5).
   - 9.1 "This once" confirms this item's tags (they become `origin: user`: the user decided) and releases its waiting
     actions.
   - 9.2 "Always" also adds x to the allowlist, **bound to the verified identity** (`domain:x.de` via DMARC pass),
     never to the `From:` text: otherwise anyone forging x inherits the trust. Without a verified identity only "No"
     and "This once" are offered, with the reason.
   - 9.3 "No" rejects the suggestions; waiting actions are dropped. Actions that already ran are not undone.
10. **Automatic confirmation keeps `origin: rule`** (store spec, `store_item_tags`), so a wrong tag is traceable to its rule
    and everything it tagged can be found.
11. **No per-tag auto-confirm** (removed 2026-11-18).
12. **The allowlist is security-relevant**: shown and edited on its own (user settings), with the domains' current
    verification rate. It is the only way a sender becomes trusted; a rule condition "from x" never is.

## 4. Security

13. **Classifier-driven prompt injection reaches further**: one tag can feed several rules and automations. Consumers
    treat items as untrusted; trust only comes from confirmation or a verified trusted attribute.
14. The classifier's answer is validated against the tags in scope: unknown tag names are dropped and logged, never
    created (3).
