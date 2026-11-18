# SPEC: API Token Scopes

Status: draft (concept only, nothing implemented). App layer (twinbox); the base app (nuxt-base-app) keeps creating,
hashing and authenticating tokens and needs one small hook (section 7).

Today an API token has every right of its account, except what the base app forbids for all tokens: managing tokens,
changing the password, impersonating, logging in or out (`TOKEN_FORBIDDEN` in the base app's
`server/middleware/session.ts`). This spec gives each token a set of scopes, so a script that prunes the store can't
also change IMAP credentials.

Related: `docs/specs/store/store.md` (the store, `/items`, tags and their trust rules).

## 1. Goal

- A token can do only what it was given: read, write or delete, per area.
- **Fail closed**: a route nobody mapped to a scope is refused for every token.
- Browser sessions (cookie login) are unchanged: scopes apply to tokens only.
- No change to how tokens are created, stored or checked in the base app beyond one hook.

## 2. Terms

| Term | Meaning |
|---|---|
| token | an API token of the base app: `Authorization: Bearer <token>`, stored as a hash in the account's `tokens` |
| area | a part of twinbox a token can be given access to: `store`, `sources`, `automations`, `notifications`, `account` |
| scope | `<area>:<action>`, e.g. `store:read`; a token holds a list of them |
| route map | twinbox's table from API route (path pattern + HTTP method) to the scope it needs (section 5) |

## 3. Decisions

| # | Decision | Choice | Why |
|---|---|---|---|
| T1 | Where scopes live | app layer: a twinbox table keyed by token id | the base app knows nothing of twinbox's areas |
| T2 | How a route declares its scope | one central route map in twinbox, not per-route metadata | it also covers the base app's routes (notifications, account), which twinbox can't annotate |
| T3 | Unmapped route | refused for tokens (403) | a new route is never silently open to every token |
| T4 | Granularity | read / write / delete per area; the store adds `tags` | delete is the destructive action; tags are trust-relevant (section 4) |
| T5 | Existing tokens | get all scopes, marked "full access" in the UI | nothing breaks; the user narrows them |
| T6 | Expiry | optional `expires_at` per token | cheap, same table |
| T7 | Admin routes (`/api/admin/*`) | refused for every token | no current need; an `admin` area can come later (11.1) |

## 4. Scopes

| Scope | Allows |
|---|---|
| `store:read` | list and search items, read their text, download files (includes persisted notifications, which are items) |
| `store:write` | upload items, add tags as **suggestions**, import |
| `store:delete` | delete and prune items, remove attachments |
| `store:tags` | confirm tags; create, edit and delete tag definitions |
| `sources:read` | list and read sources (secrets are never returned, as today), export |
| `sources:write` | create and change sources, import, test a connection, start a poll |
| `sources:delete` | delete sources |
| `automations:read` | list and read automations, export, list task types |
| `automations:write` | create and change automations, import, drafts, templates, test runs |
| `automations:delete` | delete automations |
| `notifications:read` | list and read notification channels (ntfy, IMAP, local), their schemas, export |
| `notifications:write` | create and change notification channels, import, send a test |
| `notifications:delete` | delete notification channels |
| `account:read` | own profile, permissions, event log, status pages, storage usage |
| `account:write` | change own profile |
| `account:delete` | clear the event log |

- **`store:tags` is the security-relevant scope.** Confirmed user tags decide what an automation may use as
  reference context, and a tag's description is the classifier's criterion (`docs/specs/source/classification.md`). A
  token that can confirm tags or change descriptions can steer what reaches the LLM. Without `store:tags`, a tag set
  through a token is only ever `state: suggested`, never `confirmed`.
- `write` does not imply `read`, `delete` does not imply `write`: each is granted on its own. The UI offers presets
  ("read only", "read + write", "full") that tick the boxes.
- Testing a source connection (`sources:write`) and sending a test notification (`notifications:write`) make the
  server connect to user-supplied hosts; they stay behind the existing SSRF checks.
- Later (noted, not planned): a token limited to a saved store filter (only `arrival: internal`, only one tag), e.g.
  for a narrow pruning script. It adds a filter check to every store route; built only when needed.

## 5. Route map

One file in twinbox (`server/utils/token_scopes.ts`), path pattern + method → scope. Default by method: `GET` →
`read`, `POST` / `PATCH` → `write`, `DELETE` → `delete`; exceptions listed explicitly.

| Routes | Area | Exceptions |
|---|---|---|
| `/api/v0.1/app/email/**`, `/artifacts/**`, `/files/**` (later `/items/**`, `/tags/**`) | `store` | `email/[id]/remove_attachments` (POST) → `store:delete`; `set_staging` → `store:write`; tag confirm and tag definitions → `store:tags` |
| `/api/v0.1/app/storage` | `account` | |
| `/api/v0.1/app/sources/**` | `sources` | `keys.get` → `sources:read` |
| `/api/v0.1/app/automation/**` | `automations` | |
| `/api/user/notification/**` | `notifications` | `test.post` → `notifications:write` |
| `/api/user/account` (GET, PATCH), `/api/user/permissions/**`, `/api/user/event/**`, `/api/v0.1/app/status/**` | `account` | |
| not in the map: `/api/admin/**`, `/api/user/account/initial_password`, `/api/user/stream`, `/api/v0.1/app/fake_data`, `/api/v0.1/app/account`, everything else | refused | |

- The base app's `TOKEN_FORBIDDEN` still applies first (tokens, password, impersonation, auth).
- The live update stream (`/api/user/stream`) already refuses tokens; it stays that way.
- **Coverage test**: lists every server route (twinbox and base app) and fails when one is neither mapped nor on the
  explicit "refused" list. A new route then forces a decision.

## 6. Data model

`api_token_scopes`: `(token_id PK, owner_id, scopes JSON (string[]), expires_at?, full_access_legacy (0|1),
created_at, updated_at)`.

- `token_id` is the base app's token id (random UUID). `owner_id` is always checked against the token's account.
- **A token without a row has no scopes** (fail closed): every mapped route returns 403.
- A row whose token no longer exists (deleted in the base app's token page or by an admin) is removed by a daily
  cleanup; it grants nothing in the meantime, since no bearer can match it.

## 7. Request flow

1. The base app's session middleware authenticates the bearer token as today and sets `event.context.tokenUser`.
   **Base app hook (the only base change):** it also sets `event.context.tokenId`. Generic, no knowledge of scopes.
2. Twinbox's middleware (`server/middleware/token_scopes.ts`, runs after the base app's; a test checks the order),
   only for token requests:
   - no row, or `expires_at` passed → 401 `auth.token.expired` / 403 `auth.token.no_scopes`;
   - route not in the map → 403 `auth.token.not_allowed`;
   - required scope not in the token's scopes → 403 `auth.token.missing_scope` with the scope's name.
3. The route runs as the token's account, as today. Routes with a finer rule than the map (a tag write that sets a
   suggestion vs. a confirmation) check `hasScope(event, 'store:tags')` themselves.

## 8. Creating and managing tokens

- Twinbox's token page replaces the base app's for users: description, scopes (presets + checkboxes per area),
  optional expiry. One request to a twinbox route creates the token through the base app's account service and
  writes the scope row; if the row can't be written, the token is deleted again. The token is shown once, as today.
- Scopes and expiry of an existing token can be edited; the token itself can't be shown again.
- Token management routes are refused for tokens (base app `TOKEN_FORBIDDEN`, and twinbox's routes are not in the
  route map), so a token can never widen its own scopes or create another token.
- The list shows per token: scopes, expiry, last used (base app), and "full access" for legacy tokens with a hint to
  narrow them.

## 9. Audit

- Items uploaded through a token record it in their trusted attributes:
  `verified: { identity: 'token:<id>', method: 'token', result: 'pass' }` (`docs/specs/store/store.md` section 6).
- Deletions through a token (items, sources, automations, notification channels) go to the owner's event log with
  the token's description.
- A refused request (missing scope, unmapped route) goes to the event log at most once per token and route per hour,
  so a misconfigured script is visible without flooding the log.

## 10. Migration

- Every existing token gets a row with all scopes of section 4 and `full_access_legacy = 1`.
- Release notes: tokens now have scopes; existing tokens keep full access until narrowed; admin routes are no longer
  reachable with a token (T7).

## 11. Open

1. An `admin` area for admins' tokens (`/api/admin/*`), grantable only when the account is an admin. Not needed now.
2. The filter-limited store token (section 4, last point).

## 12. Tests

- Coverage test of the route map (section 5).
- Per area: a token with only `read` can read and gets 403 on write and delete; likewise for `write` and `delete`.
- A token without `store:tags` can add a tag only as a suggestion; confirming and editing definitions are 403.
- No row → 403; expired → 401; unmapped route → 403; admin route → 403 even for an admin's full-access token.
- A token can't reach the token routes or widen its scopes.
- Legacy migration: an existing token keeps working on every mapped route.
- Middleware order: the scope check runs after the base app's authentication.
