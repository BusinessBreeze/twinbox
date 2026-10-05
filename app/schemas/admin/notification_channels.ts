import hasPerm from '#ba/utils/hasPerm'
import type { SchemaCallbacks } from '#ba/types/schema_callbacks'

const getHeaders = (t: any) => [
    { title: 'table.common.owner', key: 'owner_id', get_type: "string", set_type: "string_line", rules: [(v: string) => !!v || 'rules.invalid_field'] },
    { title: 'table.notification_channels.type', key: 'type', get_type: 'string' },
    // { title: 'table.notification_channels.is_default', key: 'is_default', get_type: 'string' },
    { title: 'table.notification_channels.created_at', key: 'createdAt', get_type: 'short_date' },
    { title: 'table.common.actions', key: 'actions', align: 'end', sortable: false }
];

export default function (t: any, callbacks?: SchemaCallbacks) {
    const features: string[] = []
    // if (hasPerm(['notification_channel.crud.create'])) features.push('create')
    if (hasPerm(['notification_channel.crud.update'])) features.push('update')
    if (hasPerm(['notification_channel.crud.delete'])) {
        features.push('delete')
        features.push('deleteMany')
    }

    return {
        title: 'table.notification_channels.title',
        headers: getHeaders(t),
        path_base: '/api/admin/app/notification_channels',
        features,
        readOnMount: true,
        customAdd: [
            // { icon: 'mdi-whatsapp', tooltip: t('table.notification_channels.add_whatsapp') as string, onClick: callbacks?.onAddWhatsapp }
        ],
        // customActions: [
        //   { icon: 'mdi-star-box', tooltip: t('table.notification_channels.set_default') as string, onClick: callbacks?.onSetDefault }
        // ]
    }
}
