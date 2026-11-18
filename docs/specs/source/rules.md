# SPEC: Source Rules

Status: draft (concept only, nothing implemented). Split out of the former `docs/specs/core/rules_queries.md`
(2026-11-18). Part of the source core (`docs/specs/source/sources.md`). Builds on `docs/specs/store/store.md` and
`docs/specs/source/classification.md`. Replaces the IMAP options of automations (`automations.options`).

## 1. Model

A rule belongs to one source and is evaluated in that source's run, at ingest, after classification:
`{ name, when: { tags?, trusted_attributes?, <conditions of the source provider> }, actions: [...] }`. No prompts of its
own; the "if it sounds like x" part is a tag (classification).

The **rules engine** is a small, generic part of the source core: it evaluates `when` and dispatches. It knows no
action and no source-specific condition: those are **registered by whoever performs them** (section 3). The store
never evaluates rules; it only offers actions.

Order at ingest: store spec section 13 (rules after classification, before the part download; source actions such as
IMAP moves after the item is stored).

## 2. Conditions

1. **General conditions** (the engine's own): tags (suggested or confirmed; rules never make anything trusted) and the
   general trusted attributes (`direction`, `verified`, `arrival`).
2. **Source-specific conditions are registered by the source provider** (decided 2026-11-18), like its actions: e.g. the
   queryable `origin` keys (IMAP: `folder`) and the sender.
3. **Sender condition (email types)** defaults to **verified**: matches only if the sender's domain passes DMARC
   (`verified.result = pass`). "Unverified is fine" is an option with a warning: a forged `From:` could plant a fake
   contract in a trusted folder. A sender condition never means trust: "from x → spam" is valid; trust only comes
   from review or the allowlist (classification spec, section 3).
4. Rules act on items of their own source only. Rule names are user input: length and character rules, plain text.

## 3. Actions

5. **Two kinds of action** (decided 2026-11-18): the source provider module registers its own (its interface gets an
   action list: `{ name, args (form schema), effect: 'internal' | 'leaves', run(item, args) }`; adding one touches
   only that module). The store actions are built into the source core: they are calls to the store API (store spec
   section 19), so the store registers nothing and knows nothing about rules. The engine validates `args` on save.
   - 5.1 Source provider actions (IMAP): `mv`, `cp`, `mark_read`, `mark_important`. They run after the item is stored; a
     failure is a warning, the item stays stored.
   - 5.2 Source core actions: `keep_attachments: { mime }` is the **source's own filter**: it decides which parts the
     source provider fetches and hands to the store at all; the store never requests parts (store spec 15.14). Parts of
     emails matching no such rule are not fetched; a classification error leaves them `pending`.
   - 5.3 Store API actions (store spec section 14a): `tag`, `promote_attachments: { mime }` (passed as `promote` per part
     to `ingest`; store spec section 11), `route: {
     provider_instance, tags? }` (store spec 15.7; any writable instance of the owner). Tagging and promotion are
     local and always `internal`; `route` is `internal` to the local store and `leaves` to an external instance.
6. **`effect: internal`**: reversible, nothing leaves twinbox or the user's own accounts (mv, cp, flags, tag,
   keep / promote attachments). Runs at once, also on suggested tags from untrusted input.
7. **`effect: leaves`**: data reaches a third party or an outside system (route to an external store provider, later
   forwarding). On untrusted input it **waits** (section 4) until review says "This once" or "Always".
8. Modules are our own reviewed code, so their declarations are trusted; each module tests its declarations, and an
   action without one counts as `leaves` (fail closed).
9. **The performer decides nothing, but trusts nothing either**: the store (or the source provider) runs what the source
   core directs without knowing about rules or review, but still enforces its own invariants on `args`: owner
   isolation (the item, the tags and the provider instance belong to the rule's owner), the type policy, provider
   capabilities, quotas. A rule can never make the store do what the user couldn't do by hand.

## 4. Waiting actions and the action log

10. **Waiting actions are held by the source core** (decided 2026-11-18), not by the store: table
    `source_pending_actions(id, owner_id, item_id, source_id, rule_id, action, args, created_at)`.
    - 10.1 `args` is a snapshot from match time: what the user is asked about is what runs, even if the rule changed
      since.
    - 10.2 "This once" / "Always" runs them through the action's `run` (also a store action such as routing); "No"
      deletes them.
    - 10.3 They expire after N days (new limit, logged as `expired`) and go with their source or item.
11. **Action log** (decided 2026-11-18): every action outcome is written, so the user can see what happened on their
    behalf: `source_action_log(id, owner_id, item_id, source_id, rule_id, action, args, result: done | failed | waiting |
    released | rejected | expired, reason?, created_at)`. Automatic tag confirmations are logged too, with the reason
    ("sender on allowlist"). Retention: N days (new limit), pruned nightly.
12. **"No" never undoes actions that already ran** (decided 2026-11-18): an internal action like a move is reversible
    by the user (drag the mail back). The log shows what ran.

## 5. UI

13. **Writing a rule**: the user writes it as they think it, in the source: "if it sounds like a newsletter → move
    to Newsletters, tag newsletter". Saving creates (or reuses) the tag with that description plus the rule; the
    split into classification and rule stays invisible.
14. **Review page, two parts** (decided 2026-11-18):
    - 14.1 **Waiting**: items where something waits for the user (a `leaves` action, or an automation that needs
      confirmed tags), grouped by sender: "Trust mail from x?" → No / This once / Always. Suggestions nothing waits
      on do not prompt; they stay filterable in the items list (`state: suggested`).
    - 14.2 **Log**: what happened, newest first, filterable by source, rule, action and result (the action log).
      Each entry links the item; the item viewer shows its own log entries.

## 6. Security

15. Rule conditions and actions are structured objects validated on save against the registered schemas, never
    free expressions.
16. `leaves` actions on untrusted input never run without the user (7, 10); the allowlist is the only shortcut
    (classification spec, 12).
17. Ownership is checked by the performer on every run (9), not only on save: a rule saved before a provider
    instance was removed or reassigned fails cleanly.

## 7. Migration

Each existing automation's IMAP options (mark read / important, copy / move) become a rule on its source,
`when: tag` (the tag from its `filter_prompt`, `docs/specs/core/automations.md` section 7).
