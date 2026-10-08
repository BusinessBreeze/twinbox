# Email Platform

API contract: http://localhost:3000/_swagger or http://localhost:3000/_scalar

# Future Sources
- E-Mail metrics: topFrom, top recipients
- Local Document Repository
- Searches, News, SubScriptions

## TTS: Currently, hardcoded as English.

## Frontend (Future)

### UI General
- [ ] tooltips: all icons and buttons
- [ ] add to service pulldown "- no attachments" if relevant

### Enhancements
- [ ] support streaming imap socket: use abortsignal timeouts to avoid leaks
- [ ] test on mobile
- [ ] tanstack caching 
- [ ] forms: my getRules and llm's getRules - refactor
- [ ] add limits subsystem. Per plan: (cron, llm, tts, notifications, etc.)
- [ ] CHLOE: traefik style most specific action takes priority (executed first)
- [ ] Automations Table: add active/disabled boolean.
- [ ] Table Delete:  Redo "are you sure?" popup.
- [ ] clean up email text before persisting
- [-] IMAP CONNECTIONS: add IMAP folder manager
- [ ] Table - optional cols / search
- [ ] TTS: ffmpeg speed control (is a bit fast currently)
- [ ] Tasks == Plugins.  Support arbitrary integrations.
- [ ] Make task header booleans => on/off icons
- [ ] Potential feature: Intersect UIDs from multiple searches to support repeated AND criteria.
- [ ] Automations: multiple notification channels.
- [ ] Websock for "events" to avoid polling

### Bugs
- [ ] Chatterbox docker bloat

## Current

UX:
- [ ] LLM Wizard:  Create documentation for whole process and data structures and have llm create whole pipeline.
- [ ] TASK: make a literal artifact : ex:  "attached are all the items."
- [ ] TASK: make merge texts artifact.

UI:
- [ ] TASK: set order chips/mime_types manually

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
- [ ] Create every vitest imaginable to stress and break everything.
- [ ] full code review: middleware, route permissions
- [ ] perf tests of other models
- [ ] review where i18n messages were placed in de/en
- [ ] Verify all ts types are correct and exhaustive.


## LARGER: consider other input sources and compartmentializing IMAP.  
## Make sources plug-in-able == different containers, web components


- [ ] build and deploy via docker, 
- [ ] image creation on github

### Near Term
- [ ] Chat History
- [ ] oauth app/imap login
- [ ] Ephemeral / one-time tasks
- [ ] Automation: start at latest UID instead of newest


- [ ] AI IMAP filter suggestions
- [ ] AI: add restate my request to prompts

- [ ] add "test" to imap/search form
- [ ] Automations: run now button
- [ ] Imap action: mark as important

- [ ] Automation: set imap uid to latest
- [ ] Use websockets instead of poll
- [ ] only new exists in imap search, not needed in automations.
- [ ] don't delete Ex: filter if used in automation.

- Add Badges to pages not yet explored.  When Explored, show explanitory modal.