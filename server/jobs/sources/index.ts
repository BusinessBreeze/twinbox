// Public API of the source layer. Code outside jobs/sources imports only from here.
export { BaseSource, setSourceHooks, type SourceHooks, type SourceClass } from './base_source';
export { getSourceClass, secretKeys, encryptConfig, decryptConfig, createSourceInstance } from './registry';
// Type-specific helpers for other parts of the app, grouped by type (the IMAP notification channel uses imap.*)
export * as imap from './types/imap/public';
export { systemMaxItemsPerFetch } from './deps';
export { PRUNE_LIMIT_KEYS, systemPruneLimits, effectivePruneLimits, limitAboveCap, type PruneLimits } from './limits';
export type { SourceDefinition, SourceRecord, FilterResults, FetchResult, SourceKeyOption } from './types';
