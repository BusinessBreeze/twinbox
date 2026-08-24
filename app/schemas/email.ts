const getHeaders = (t: any) => [
    { title: 'table.email.date', key: 'date', get_type: "short_date" },
    { title: 'table.email.from', key: 'from', get_type: "string" },
    { title: 'table.email.subject', key: 'subject', get_type: "string" },
    { title: 'table.common.actions', key: 'actions', sortable: false },
];

export default function (t: any, callbacks?: { onViewEmail?: (item: any) => void }) {
    return {
        title: 'table.email.title',
        headers: getHeaders(t),
        path_base: '/api/v0.1/app/email',
        features: [],
        readOnMount: true,
        customActions: [
            {
                icon: 'mdi-eye-outline',
                tooltip: t('table.common.view') || 'View Email',
                onActionClick: callbacks?.onViewEmail
            }
        ]
    }
}
