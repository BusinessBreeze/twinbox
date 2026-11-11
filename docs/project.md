# Email Platform

API contract: http://localhost:3000/_swagger or http://localhost:3000/_scalar

# Future Sources
- Source: E-Mail metrics - topFrom, top recipients
- Source: Web / maybe w splitter?
- Task: splitter?
- Local Document Repository
- Searches, News, SubScriptions
- add more info to event logs to allow retry / filtering of errors.
- add GreenMail test imap server.
- TASK: would rfc822 only tasks be useful: mark read, flag?
- [ ] TASK: make a literal artifact : ex:  "attached are all the items." ?
- configure "submit" text on form 
- [ ] imap poller - add move


## TTS: Currently, hardcoded as English.

## Frontend (Future)

### Milestones
- [ ] add library + integrations (RAG? - research best practice)
- [ ] support optional attachment saving to lib ( ex: invoices )
- [ ] support streaming imap socket: use abortsignal timeouts to avoid leaks
- [ ] test on mobile
- [ ] tanstack caching 
- [ ] CHLOE: traefik style most specific action takes priority (executed first)
- [ ] Table - optional cols / search / pagination + respective routes
- [ ] Potential feature: Intersect UIDs from multiple searches to support repeated AND criteria.
- [ ] LLM Wizard:  Create documentation for whole process and data structures and have llm create whole pipeline.
- [ ] plugins: (later) web components
        serialize zod schemas?
        Tasks, Sources, templates are plugins.
- [ ] split event/task logs? - better pruning flow. - 
- [ ] events also need pagination / searching / load more - currently restricted to the last 100
- [ ] duplicate automation button?
- [ ] tables store in localstorage the last context and restore.
- [ ] make every existing task into an MCP tool call.
- [ ] add sitewide templates
- [ ] media viewer rfc822 - load images button?
- [ ] a store integration just for rfc822 that would get thread as context.

## Current

## Housekeeping
- [ ] intro blog post
- [ ] user documentation

## Review
- [ ] claude fable: try to break in or misuse resources.
        make a prompt for, given the description of this system, what a complete test covers. add to testing notes.
- [ ] make a prompt to exhaustively judge good architecture, simplicity, generality, best practice patterns. no antipatterns.
- [ ] review all zod rules, tighten
- [ ] full code review: middleware, route permissions
- [ ] perf tests of other models
- [ ] clean up email text before persisting
- [ ] review where i18n messages were placed in de/en
- [ ] Verify all ts types are correct and exhaustive. no dupes. minimum "any".
- [ ] convert all to camelcase
- [ ] Create every vitest imaginable to stress and break everything.
        even knowing id a user can NEVER create any data that uses the resources of a different user.
- [ ] Create UI tests
- [ ] remove extraneous console.log messages

### Near Term
events and artifacts could each get a small service - anything else?
on sources imap - checkbox to keep attachments / type filter
Expand on ai drafter
        describe whole pipeline in a guided chat.
        set source, search, notifications, dont open a new friggin window to view artifacts. artifact default names == bad.
- [ ] show only task types for which you have mime sources
- [ ] implement remove account. (account currently has delete on it.) and ALL RESOURCES attached to it.

sse for events
        badge increment for emails and artifacts
- refactor db wrappers

setup 
        tamara : make issue.
        tailscale, add new pwd locally. connect to pi3g machine, see tamara in console.