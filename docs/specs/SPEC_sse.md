# SPEC: Live updates (server-sent events)

Status: implemented (steps 1–4, 2026-11-12; base v0.1.0). Replaces the timed polling of the dashboard and the
bell (the polling code is removed), and adds live refresh to pages that today only change on reload.

## 1. Goal

- **The UI learns that something changed, at the moment it changes**: a run starts or ends, a warning is raised,
  an email or artifact is stored. No 60 s delay in the bell, no 10 s polling on the dashboard.
- **Fewer requests**: the dashboard sends about 6 requests every 10 s per open tab today, nearly always for unchanged
  data. With this spec, a page only loads when something it shows has changed.
- **No data over the stream**: the stream carries **event names only**. The page then loads what it shows through the
  routes it already uses, with their owner checks. The stream adds no new way to read records.

Not in scope:
- IMAP IDLE (the mail server pushing new mail to twinbox): server side, planned in `docs/specs/SPEC_sources.md`,
  independent of this spec.
- Progress of the automation test run in the draft dialog: the request already waits for the result.
- More than one server process (section 9).

## 2. Today (what is polled or not refreshed)

| # | Where | How | Requests |
|---|---|---|---|
| 1 | `app/pages/dashboard.vue` | every 10 s | `/api/v0.1/app/status/system`, `/api/v0.1/app/status/activity` |
| 2 | `app/components/dashboard/row.vue` | every 10 s | automations, sources, two event searches (warn/error of automations and of sources) |
| 3 | `app/components/user_events.vue` (base, the bell) | every 60 s | events, one search per summary line |
| 4 | "Run now" on a source (`app/pages/sources.vue`) | not at all | the snackbar says "started", then nothing |
| 5 | `app/pages/repositories.vue` (emails), `app/pages/artifacts.vue`, `app/pages/storage.vue` | not at all | reload by hand |

The system figures of 1 are computed every 30 s (`server/cron/system_metrics.ts`); polling them every 10 s returns the
same values two times out of three.

## 3. Decisions

| # | Decision | Choice | Why |
|---|---|---|---|
| D1 | What the stream carries | an event name, nothing else: no ids, no counts, no text | the page loads through its existing routes with their owner checks; nothing can leak through the stream, and there is no second representation of a record to keep in sync |
| D2 | Granularity of events | one event per **kind of thing that changed** (section 4), not per action | a page refetches its list anyway; "emails changed" is all it needs. Fewer names, fewer emit points to forget |
| D3 | Streams per user | one stream per browser tab, for all events (`/api/user/stream`) | one connection instead of one per component; components subscribe to names client-side |
| D4 | Missed events (stream dropped) | no replay (`Last-Event-ID` not used); on every (re)connect the page refetches everything it shows | names without data can't be replayed meaningfully; a refetch on reconnect is simpler and always correct |
| D5 | Bursts (an IMAP run storing 200 emails) | coalesced per connection: a name is sent at most once per second | 200 `emails` events would mean 200 refetches |
| D6 | Where it lives | stream, notifier and client composable in the **base** (the bell is there); twinbox only calls `notifyUser` with its own names | no twinbox names or code in the base: the base accepts any name matching `^[a-z_]+$` |
| D7 | Authentication | session cookie only, no API tokens | `EventSource` can't send an `Authorization` header; API clients use the routes |
| D8 | When the stream is unavailable | **no polling**: the page shows what it loaded last and keeps trying to reconnect; every reconnect reloads (D4) | one way to stay current instead of two; no polling code left to maintain |
| D9 | Message bus | in memory, in the server process | one process today (the job queue is in memory too); section 9 |

## 4. Events

Every event means "reload what you show of this kind". Sent to the **owner** of what changed, except `system`.

| # | Event | Sent when | Sent from | Who reloads what |
|---|---|---|---|---|
| E1 | `events` | a user event is stored, or the user deletes events | base: `server/utils/telemetry/event.ts` (after the insert of a USER event with `owner_id`); `server/api/user/event/index.delete.ts` | the bell (`app/components/user_events.vue`, base): events and summaries. Dashboard events panel (`app/components/dashboard/events.vue`). Dashboard cards (`app/components/dashboard/row.vue`): issue state |
| E2 | `jobs` | a job of the user is queued, starts (leaves the queue), or ends (also when it fails) | `server/queue/core.ts`: `enqueue` (accepted), worker start, worker `finally` | dashboard activity (`/api/v0.1/app/status/activity`, "My Queue") |
| E3 | `sources` | a source is created, changed, deleted or imported; a source was polled | `server/services/app/sources.ts` (create, update, delete, import); `server/jobs/automations/record.ts` (`recordPoll`) | `app/pages/sources.vue`; dashboard cards: last poll, next poll |
| E4 | `automations` | an automation is created, changed, deleted or imported; it ran; it had an issue | the automation service (create, update, delete, import, add from template); `server/jobs/automations/record.ts` (`recordRun`, `recordIssue`) | `app/pages/automations.vue`; dashboard cards: last run, issue |
| E5 | `emails` | emails are stored, deleted, pruned, imported, staged / unstaged, or their attachments removed | `server/services/app/email.ts` (`store`, used by `createFromBuilt` and `import`; `deleteMany`, used by `delete`; `removeAttachments`; `setStaging`); `server/jobs/sources/types/email/prune.ts` | `app/pages/repositories.vue`; `app/pages/storage.vue`; dashboard activity (ingested mails) |
| E6 | `artifacts` | an artifact is created or deleted (by the user or by retention) | `server/services/app/artifacts.ts` (`create`, `delete`; `applyRetention` deletes through `delete`) | `app/pages/artifacts.vue`; `app/pages/storage.vue`; dashboard activity (artifacts) |
| E7 | `system` | the system figures were recomputed (every 30 s) | `server/cron/system_metrics.ts`, after `updateSystemMetrics` | dashboard: `/api/v0.1/app/status/system`. Sent to **every** open stream: the route is open to every signed-in user and the figures are the same for all |

E1 is the only event the base sends itself. E2–E7 are twinbox's.

Not events, on purpose:
- Account and preference changes, notification channels: they change only through the user's own action in the open
  tab, which already reloads.
- Admin tables: an admin looking at all users' data reloads by hand; streaming other users' changes to an admin would
  break "only the owner's events" for little gain.

## 5. Wire format

```
retry: 5000

data: emails

data: jobs

: ping
```

- `Content-Type: text/event-stream`, `Cache-Control: no-cache, no-transform`, `X-Accel-Buffering: no`.
- Each message is one `data:` line holding the event name, so the client needs one `onmessage` handler (no
  `event:` field, no per-name listeners).
- `: ping` (a comment) every 25 s keeps proxies from closing an idle connection; the client ignores it.
- `retry: 5000`: the browser reconnects 5 s after a drop.
- No `id:` (D4).

## 6. Server

### 6a. Base: notifier and route

- `server/utils/user_stream.ts` (base):
  - `notifyUser(ownerId: string, name: string)`: hands the name to every open stream of that owner. Never throws,
    never waits: a slow or dead connection must not slow down a run.
  - `notifyAll(name: string)`: every open stream (for E7).
  - Names are checked against `^[a-z_]+$`; anything else is dropped with a SYSTEM warning.
  - Per connection: a set of pending names, flushed once per second (D5). The same name twice within a second is sent
    once.
- `server/api/user/stream.get.ts` (base): `createEventStream` from h3.
  - Requires a session (`requireUserSession`); the owner id comes from the session only, never from the query.
  - Registers the connection under the owner id, removes it on close.
  - At most `limits.stream.max_per_user` open streams per user (default 10); the oldest one is closed when a new
    one would exceed it, so a user with many tabs isn't locked out by stale ones.
  - Closes every stream of a user on sign-out, and of an account when it is disabled or deleted.

### 6b. Twinbox: emit points

The calls in section 4, through `notifyUser` re-exported from `server/jobs/sources/deps.ts` and
`server/jobs/automations/deps.ts` like `emitTelemetryEvent`. Emitted **after** the change is committed, so a page
reloading at once sees it.

### 6c. Running state (dropped)

No queued / running state per source (decided 2026-11-12): the results of a run arrive through their own events
(`sources` when it polled, `emails`, `artifacts`, `events`, `automations`), and `jobs` only reloads the dashboard's
"My Queue". The queue sends `jobs` when a job is queued, starts and ends (`server/queue/core.ts`).

### 6d. Tables (base)

The pages built on the base table (`app/pages/sources.vue`, `automations.vue`, `repositories.vue`, `artifacts.vue`)
load once on mount. The table gets a generic option in its meta, with no twinbox names in the base:
- `meta.live: string[]`: event names; the table subscribes with `useUserStream(meta.live, loadData)` and reloads its
  rows when one arrives (and on every reconnect). Twinbox's schemas set e.g. `live: ['sources', 'jobs']`.
- Rows are matched by id across a reload (`item-value="id"`), so a selection survives it; rows that are gone drop
  out of the selection.
- An open edit form or delete confirmation is not touched: the form edits its own copy of the row.

## 7. Client

- `app/composables/useUserStream.ts` (base): one `EventSource` per tab, opened on first use, shared by all
  components.
  - `useUserStream(names: string[], reload: () => void)`: calls `reload` when one of the names arrives, and once
    on every (re)connect (D4). Unsubscribes on unmount.
  - Debounces `reload` by 300 ms per subscriber, so `emails` and `artifacts` arriving together reload the storage
    page once.
  - No polling (D8): while the stream is down the browser reconnects (`retry: 5000`); the reconnect reloads (D4).
  - Connection state for the UI: `useUserStreamState()` returns `'open' | 'connecting' | 'down'`. `down` after 3
    failed attempts in a row (about 15 s), or when `EventSource` is missing; back to `open` on the next successful
    connect. Closing the stream for a hidden tab (below) is not `down`.
  - The bell (`app/components/user_events.vue`, base) shows `down`: the bell turns `error` coloured and its list
    holds a single message, "Can't connect for live updates" (i18n), instead of the events (they may be stale). On
    `open` it reloads and shows the events again.
  - Hidden tab: the stream is closed when the tab has been hidden for 5 minutes (`visibilitychange`). The components
    stay mounted and keep their subscriptions; nothing reaches them while it is closed. When the tab is shown again
    the stream reopens, and the open itself calls every subscriber's `reload` (the same path as any reconnect, D4).
    Subscribers are the components mounted in the tab: the current page's (other pages are unmounted by the router)
    and the layout's (the bell). A mounted but hidden part of the page (a closed panel) reloads too; tracking actual
    visibility isn't worth its code for one reload per tab switch.
    The reload is the frontend's: the server can't push data (D1). Saves connections for forgotten tabs.
- The polling code is removed: the `setInterval` in `app/pages/dashboard.vue`, `app/components/dashboard/row.vue`
  and `app/components/user_events.vue` (base).
- `app/components/dashboard/row.vue`: four lists, each reloaded on its own event (`automations`, `sources`, and
  `events` for the two problem searches); the cards are built from all four.

## 8. Security

| # | Risk | Measure |
|---|---|---|
| S1 | A user receives another user's events | the owner id is taken from the session only; `notifyUser` addresses connections by owner id; test (section 10). And by D1 there is no data in an event even if one were misrouted |
| S2 | Learning about other users through `system` | E7 is a name only; the figures behind it come from `/api/v0.1/app/status/system`, which every signed-in user can already read |
| S3 | Exhausting the server with connections | at most 10 streams per user (oldest closed); sessions only, so no anonymous streams; heartbeats find dead connections, which are removed on write failure |
| S4 | A stream outliving its session | closed on sign-out and on account disable/delete; otherwise checked at every heartbeat: a stream whose session has expired is closed |
| S5 | CSRF / cross-origin reading | `EventSource` follows the same-origin rules; no CORS headers are set on the route. The session cookie is `SameSite=Lax`, so another site can't open a stream with it |
| S6 | Event name injection into the stream format | names are checked against `^[a-z_]+$` before writing (no newlines can reach the wire) |

## 9. Limits

- **One server process.** The notifier is in memory. With several processes, an event raised in one would not reach
  streams held by another. The job queue is in memory as well, so twinbox is single-process anyway; when that
  changes, both move to a shared bus (Redis pub/sub or similar) behind the same `notifyUser`.
- **Reverse proxies** must not buffer the route. `X-Accel-Buffering: no` covers nginx; other proxies need it in
  their configuration (documented in `docs/architecture.md`).
- **HTTP/1.1**: browsers allow 6 connections per host; one stream per tab uses one of them. Behind HTTP/2 this limit
  does not apply.

## 10. Tests

- Fast (unit, base notifier): coalescing (the same name twice in a second is sent once), name check, `notifyUser`
  reaches only that owner's connections, a failing connection is removed and doesn't throw.
- Slow (API):
  - two users with a stream each; storing an email for A sends `emails` to A only; B receives nothing.
  - anonymous request to `/api/user/stream`: 401. API token without session: 401.
  - the 11th stream of one user closes the first.
  - a source run via `POST /api/v0.1/app/sources/:id/run`: `jobs`, then `sources` (polled), `emails`, `jobs`, in
    that order.
  - every message on the wire matches `^data: [a-z_]+$` or is a comment (no data, D1).
- Isolation sweep (`tests/helpers/routes.ts`): the new route is included.

## 11. Steps

1. Base: notifier, route, composable, E1, the table's `meta.live` (6d); the bell uses the stream (removes the 60 s poll).
2. Twinbox: E2, E3, E4; dashboard cards and activity on the stream; sources and automations tables `live`.
3. Twinbox: E7; the dashboard's 10 s poll removed (done together with step 2: the page polled both).
4. Twinbox: E5, E6; emails, artifacts and storage pages refresh live.

Each step works on its own; a page not yet converted keeps its current behaviour until its step.

## 12. Decisions on the former open questions (2026-11-12)

1. Hidden tab: close the stream after 5 minutes hidden; on show it reopens and the frontend reloads (section 7).
2. No polling fallback at all (D8); the polling code is removed.
3. Queued and running were to be shown apart; then dropped altogether (section 6c).
