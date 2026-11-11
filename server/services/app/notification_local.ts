// Local channel: delivers notification items as artifacts of the channel's owner (file store + artifacts table)
// instead of sending them anywhere. Test runs deliver here too. Registered as provider 'local'
// (server/plugins/app_notification_registration.ts); moved from the base app's services/core/notification_local.ts.
import { getExtensionFromMime } from '#bs/utils/get_extensions_from_mime_type';
import { reportNotificationFailure } from '#bs/utils/telemetry/event';
import { artifactService } from './artifacts';

type LocalItem = { content: any; mime_type?: string; filename?: string; name?: string; metadata?: any };

/** Item content as bytes: Buffers as they are, objects as JSON, base64 strings of binary types decoded. */
const toBytes = (content: any, mime: string): Buffer => {
    if (Buffer.isBuffer(content)) return content;
    if (content && typeof content === 'object') return Buffer.from(JSON.stringify(content, null, 2));
    const text = content === undefined || content === null ? '' : String(content);
    const type = mime.toLowerCase();
    const binary = !type.startsWith('text/') && !type.includes('json') && !type.includes('javascript') && !type.includes('xml');
    if (binary && /^[A-Za-z0-9+/=]+$/.test(text.trim()) && text.trim().length % 4 === 0) return Buffer.from(text.trim(), 'base64');
    return Buffer.from(text);
};

/** File name of an item: its own (no folders), else the title with a timestamp and, for several, an index. */
const nameOf = (item: LocalItem, title: string, index: number, count: number, stamp: string, mime: string) => {
    const own = item.filename || item.name || item.metadata?.filename || item.metadata?.name;
    const base = own
        ? String(own).split(/[/\\]/).pop()!
        : `${(title || 'artifact').trim().replace(/[/\\?%*:|"<>]/g, '_').replace(/\s+/g, '_').slice(0, 80)}${count > 1 ? `_${index + 1}` : ''}_${stamp}`;
    return base.includes('.') ? base : `${base}.${getExtensionFromMime(mime)}`;
};

export class Local {
    static async getSchemas(): Promise<any[]> {
        return [{ service_name: 'disk', details: { templates: ['file://'], tokens: {} } }];
    }

    /**
     * Provider entry point: stores the items as artifacts and never throws; failures (e.g. the storage quota) go to the
     * owner's event log. options.automation_id links the artifacts to the automation that made them.
     */
    static async sendItems(
        title: string,
        items: LocalItem[] | LocalItem | string,
        options: { channel?: Record<string, any>; user_id?: string; owner_id?: string; automation_id?: string; [key: string]: any },
    ): Promise<{ ok: boolean; artifacts?: string[] }> {
        const ownerId = options?.channel?.owner_id || options?.owner_id || options?.user_id;
        try {
            if (!ownerId) throw new Error('No owner for the local channel');
            const list = (Array.isArray(items) ? items : [items])
                .map((it) => (typeof it === 'string' ? { content: it, mime_type: 'text/markdown' } : it))
                .filter((it): it is LocalItem => !!it && typeof it === 'object');
            const stamp = new Date().toISOString().replace(/[:.]/g, '-');

            const ids: string[] = [];
            for (const [i, item] of list.entries()) {
                const mime = item.mime_type || 'text/markdown';
                const artifact = await artifactService.create(ownerId, {
                    bytes: toBytes(item.content, mime),
                    mime,
                    filename: nameOf(item, title, i, list.length, stamp, mime),
                    label: title,
                    automationId: options?.automation_id,
                });
                ids.push(artifact.id);
            }
            return { ok: true, artifacts: ids };
        } catch (err: any) {
            await reportNotificationFailure(ownerId, options?.channel?.name || 'Local', err?.message || 'Storing the artifact failed');
            return { ok: false };
        }
    }
}
