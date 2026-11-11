// Admins may read and delete other users' records (docs/specs/SPEC_attachments.md 11); each such access is written to
// the affected user's event log: who, what, which records. Listing metadata in the admin tables is not logged.
import type { H3Event } from 'h3';
import { emitTelemetryEvent, EventScope, EventLevel } from '#bs/utils/telemetry/event';

export type AdminAction = 'read' | 'changed' | 'deleted';

/** One event per affected owner (an admin acting on their own records is not logged). */
export const auditAdminAccess = async (event: H3Event, action: AdminAction, type: string, rows: Array<{ id: string; owner_id?: string | null }>) => {
    const session = await getAuthSession(event).catch(() => null);
    const admin = session?.user?.id ?? null;
    const byOwner = new Map<string, string[]>();
    for (const row of rows) {
        if (!row?.owner_id || row.owner_id === admin) continue;
        byOwner.set(row.owner_id, [...(byOwner.get(row.owner_id) ?? []), row.id]);
    }
    for (const [owner, ids] of byOwner) {
        await emitTelemetryEvent({
            scope: EventScope.USER,
            owner_id: owner,
            level: EventLevel.INFO,
            category: 'admin',
            message: `events.user.info_admin_${action}`,
            metadata: { admin_id: admin, admin_user: session?.user?.user ?? session?.user?.name ?? null, type, ids },
        });
    }
};
