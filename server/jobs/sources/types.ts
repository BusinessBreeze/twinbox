// Source layer types. What the app shares lives in shared/types/sources.ts.
import type { AnyZodObject, ZodTypeAny } from 'zod';
import type { SourceKeyOption, SourceType } from '#shared/types/sources';
import type { TaskItem } from '../automations/tasks';

export type { SourceKeyOption, TaskItem };

/**
 * A source type as the server uses it (the class's `static definition`): the shared type (facts, config rules) plus
 * what only the server checks. The forms are the app's (app/schemas/source_types/).
 */
export type SourceDefinition = SourceType & {
    settingsSchema: ZodTypeAny;                     // validates (and fills defaults of) the non-secret saved data
    optionsSchema: AnyZodObject;                    // the type's own automation option keys (engine options are separate)
};

/** A source row with its config decrypted. */
export interface SourceRecord {
    id: string;
    owner_id: string;
    name: string;
    type: string;
    type_version: number;
    config: Record<string, any>;
    settings: Record<string, any>;
    poll_seconds: number;
    max_items_per_fetch: number;
    retention_days: number;                         // pruning; 0 = no limit of its own
    max_items: number;
    max_size_mb: number;
    last_successful_poll: Date | null;              // last fetch without error (the engine writes it)
}

/** After the filter, per automation: its options and the sourceRefs of the items that passed. */
export type FilterResults = Array<{ options: Record<string, any>; refs: string[] }>;

/** What a source run hands back per subscribed key: the items for the automations. */
export type FetchResult = Map<string, TaskItem[]>;
