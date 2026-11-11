# Tests

```
tests/
  .env              secrets (not committed); copy .env.example
  fixtures/         emails.json (made-up emails), sources.json, channels.json (no secrets)
  helpers/          test server setup, API client, stub LLM/TTS
  fast/             pure functions; no server, no network          npm run test:fast   (every commit)
  slow/             API and staging runs on a throwaway server    npm run test:slow   (on push / CI)
  local/            real mail server and services                 npm run test:local  (by hand)
```

`npm run hooks:install` once per clone makes git run the fast tests before every commit
(`git commit --no-verify` skips them).

## Slow tests

`tests/helpers/global_setup.ts` starts one Nuxt dev server (`@nuxt/test-utils`, random port) for the whole run:

- its own data dir `tests/.tmp/run-*/` (database via `APP_DATA_DIR` / `LIBSQL_URL`, stored files in `<APP_DATA_DIR>/files`;
  `LOCAL_ARTIFACTS_DIR` points at an empty folder so the developer's `./Artifacts` is never imported), removed
  afterwards; `KEEP_TEST_DATA=1` keeps it for debugging
- the admin from `tests/.env` (`ADMIN_USER` / `ADMIN_PASSWORD`; like any first admin it has no password of its own and
  signs in with `ADMIN_PASSWORD`), with the API token `TEST_API_TOKEN` (its hash is written to the admin's account
  after boot). Tests call the API with that token (`adminClient()`, `Authorization:
  Bearer`); only what a token may not do (managing tokens, login) uses a session (`adminSessionClient()`)
- a stub LLM/TTS (`helpers/stub_services.ts`): the filter matches the criteria's quoted phrase, other prompts answer
  `STUB SUMMARY: ...`, TTS fails for texts containing `TTSFAILMARKER`

It runs next to a normal `npm run dev` without touching its database, files or build folder. Sources are only
staging and records that are never connected; notifications go to the local channel.

Test files run one after another on the shared server and clean up their automations.

## Local suite (by hand)

`npm run test:local` starts the same throwaway server, but without stubs: the LLM, TTS and Apprise are the ones in the
developer's `.env`. `local/imap_to_ntfy.test.ts` reads the two emails in the folder "Test" of the test mailbox
(`fixtures/sources.json`, `TEST_IMAP_PASSWORD`), summarizes each, reads the summary aloud, and delivers both to the
artifacts and to ntfy (`fixtures/channels.json`, `TEST_NTFY_TOPIC`); it checks the emails, the artifacts and the
messages on the ntfy topic. Each run leaves two messages on that topic.

## CI (later)

fast needs nothing. slow needs `ADMIN_USER`, `ADMIN_PASSWORD`, `SECRET_ENCRYPTION_KEY`, `NUXT_SESSION_PASSWORD` as
repository secrets and the base layer from GitHub instead of the local checkout (`nuxt.config.ts` `extends`,
`vitest.config.ts` `#base`).
