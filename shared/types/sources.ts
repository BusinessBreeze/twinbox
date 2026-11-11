// Source contract shared by the app (sources page, automation form) and the server (source layer).
// See docs/specs/SPEC_sources.md.

import type { AnyZodObject } from 'zod';

/** A source type as the app and the server both know it (shared/source_types/). */
export interface SourceType {
    type: string;
    version: number;                                // for config/settings upgrades
    title: string;                                  // i18n key
    pollable: boolean;                              // sources of this type have poll_seconds and are polled
    builtin: boolean;                               // one per user, created by the system (staging), not offered for creation
    defaultName?: string;                           // name of the built-in source
    itemMime: string;                               // what the source's items are (task inputs are checked against it)
    secretKeys: string[];                           // config fields never sent back to the browser
    configSchema: AnyZodObject;                     // the connection fields; the form's rules come from it
}

/**
 * Something an automation can subscribe to. The key is decoded by the source's class:
 * staging "<sourceId>", IMAP "<sourceId>:<folder>:<searchId>" (searchId empty without a search).
 */
export interface SourceKeyOption {
    key: string;
    label: string;                                  // e.g. "Work mailbox › INBOX › Newsletters"
    source_id: string;
}

/** GET /api/v0.1/app/sources/keys: the current keys of all sources; sources that couldn't be listed separately. */
export interface SourceKeyList {
    keys: SourceKeyOption[];
    unavailable: Array<{ source_id: string; name: string; reason: string }>;
}

/** Something a source offers, e.g. an IMAP folder. */
export interface SourceResource {
    value: string;
    title: string;
}
