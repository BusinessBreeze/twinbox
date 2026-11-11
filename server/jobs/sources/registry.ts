// Source type registry: type → class, filled by static imports (complete as soon as anything imports it).
// Adding a source type = its shared definition (shared/source_types/) + new folder under types/ + one line below.
import ImapSource from './types/imap';
import StagingSource from './types/staging';
import { encryptValue, decryptValue } from './deps';
import type { SourceClass, BaseSource } from './base_source';
import type { SourceRecord } from './types';

const registry = new Map<string, SourceClass>();

for (const SourceCls of [ImapSource, StagingSource] as unknown as SourceClass[]) {
    const type = SourceCls.definition?.type;
    if (!type) throw new Error(`Source class ${SourceCls.name} has no static definition`);
    if (registry.has(type)) throw new Error(`Duplicate source type registered: ${type}`);
    registry.set(type, SourceCls);
}

export const getSourceClass = (type: string): SourceClass | undefined => registry.get(type);

/** Keys of a type's secret config fields (never sent back to the browser). */
export const secretKeys = (type: string): string[] => registry.get(type)?.definition.secretKeys ?? [];

// The whole config is stored as one encrypted JSON string.
export const encryptConfig = (config: Record<string, any>): string => encryptValue(JSON.stringify(config || {}));
export const decryptConfig = (stored: unknown): Record<string, any> => {
    if (!stored) return {};
    try {
        return JSON.parse(String(decryptValue(stored)));
    } catch {
        return {};
    }
};

/** Live instance for one source row (config decrypted); undefined for an unregistered type. */
export const createSourceInstance = (row: any): BaseSource | undefined => {
    const SourceCls = registry.get(row?.type);
    if (!SourceCls) return undefined;
    const record: SourceRecord = {
        id: row.id,
        owner_id: row.owner_id,
        name: row.name,
        type: row.type,
        type_version: row.type_version ?? 1,
        config: decryptConfig(row.config),
        settings: row.settings && typeof row.settings === 'object' ? row.settings : {},
        poll_seconds: Number(row.poll_seconds ?? 3600),
        max_items_per_fetch: Number(row.max_items_per_fetch ?? 50),
        retention_days: Number(row.retention_days ?? 0),
        max_items: Number(row.max_items ?? 0),
        max_size_mb: Number(row.max_size_mb ?? 0),
        last_successful_poll: row.last_successful_poll ? new Date(row.last_successful_poll) : null,
    };
    return new SourceCls(record);
};
