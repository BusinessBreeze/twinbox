import hasPerm from '#ba/utils/hasPerm'

const getHeaders = (t: any) => [
    { title: 'table.common.owner', key: 'owner_id', get_type: "string", set_type: "string_line", rules: [(v: string) => !!v || 'rules.invalid_field'] },
    { title: 'table.email.date', key: 'date', get_type: "short_date" },
    { title: 'table.email.from', key: 'from', get_type: "string" },
    { title: 'table.email.subject', key: 'subject', get_type: "string" },
    { title: 'table.common.actions', key: 'actions', sortable: false },
];

export default function (t: any) {
    const features: string[] = []
    // if (hasPerm(['email.crud.create'])) features.push('create')
    if (hasPerm(['email.crud.update'])) features.push('update')
    if (hasPerm(['email.crud.delete'])) {
        features.push('delete')
        features.push('deleteMany')
    }

    return {
        title: 'table.email.title',
        headers: getHeaders(t),
        path_base: '/api/admin/app/email',
        features,
        readOnMount: true
    }
}
