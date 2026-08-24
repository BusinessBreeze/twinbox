# Email Platform

Find all API docs at http://localhost:3000/_swagger or http://localhost:3000/_openapi.json

# Goals
- E-Mail selection: IMAP Search, LLM Filtering
- Task Options: Work on emails singly or concatenated, mark read
- Tasks: TTS, LLM content analysis, Web Scraping (future), IMAP Metric analysis (future) 

## Note: Currently, previously downloaded emails are skipped. The effect is that all tasks will only process new emails.
## TTS: Currently, hardcoded as English.

- Web Scraping Examples:
  - Get RAM prices weekly and notify if price drops.
- IMAP Metric Examples:
  - top From:
  - Top reponded to / read

## Frontend (Future)

### UI General
- [ ] tooltips: all icons and buttons
- [ ] add to service pulldown "- no attachments"

### Enhancements
- [ ] support streaming imap socket: use abortsignal timeouts to avoid leaks
- [ ] test on mobile
- [ ] tanstack caching 
- [ ] forms: my getRules and llm's getRules - refactor
- [ ] add limits subsystem. Per plan: (cron, llm, tts, notifications, etc.)
- [ ] CHLOE: traefik style most specific action takes priority (executed first)
- [ ] oauth app/imap login
- [ ] Automations Table: add active/disabled boolean.
- [ ] Table Delete:  Redo "are you sure?" popup.
- [ ] clean up email text before persisting
- [ ] Rate limiting: allow automations to only read X emails per poll. Define app wide max policy. Max email size
- [-] IMAP CONNECTIONS: add IMAP folder manager
- [ ] Table - optional cols / search
- [ ] TTS: ffmpeg speed control (is a bit fast currently)
- [ ] Tasks == Plugins.  Support arbitrary integrations.
- [ ] Make task header booleans => on/off icons
- [ ] Potential feature: Intersect UIDs from multiple searches to support repeated AND criteria.
- [ ] Ephemeral / one-time tasks
- [ ] Automations: multiple notification channels.
- [ ] Websock for "events" to avoid polling

### Bugs
- [ ] Chatterbox docker bloat
- [ ] ADMIN: red top label is wrong if reloaded.

## Current

UX:
- [ ] wizard w predefined templates: freeze sus emails, overview, create drafts for specific ppl, put thematic emails (newsletters) in folders
- [ ] LLM Wizard:  Create documentation for whole process and data structures and have llm create whole pipeline.
- [ ] LLM Create Filter/Artifact - add "restate my request"
- [ ] TASK: make a literal artifact : ex:  "attached are all the items."
- [ ] TASK: make merge texts artifact.

UI:
- [ ] TASK: set order chips/mime_types manually
- [ ] mk prefs like admin 1/2-1/2 core/user

Infrastructure:
- [ ] docker container
- [ ]   yaml/env overrides
- [ ] CONF_OPTS: registration on/off, task length max, email tbl length max, 
- [ ] implement or remove auth/verify

Housekeeping:
- [ ] intro blog post
- [ ] rename llm_create_artifact => table name: tasks
- [ ] rename "NOTIFICATIONS_channels" => dest?
- [ ] user documentation
- [ ] Tamara: redress word: task.multiple, maybe just move to icons with hovers?
- [ ] upstream user schema changes to admin
- [ ] FORMS: add opts:{} for get/set specific keys

## Review
- [ ] review all zod rules, tighten
- [ ]   no zod rules for notifications.
- [ ] remove extraneous console.log messages
- [ ] all routes return i18n-able messages (one is printing in blue/info)
- [ ] all UI/Route messages exist in both locales
- [ ] Create every vitest imaginable to stress and break everything.
- [ ] full code review: middleware, route permissions
- [ ] remediate all browser console warnings.
- [ ] perf tests of other models
- [ ] review where i18n messages were placed in de/en


## LARGER: consider other input sources and compartmentializing IMAP.  Make sources plug-in-able == different containers, web components


- [ ] AI IMAP filter suggestions
- [ ] add "test" to imap/search form
- [ ] Automations: run now button