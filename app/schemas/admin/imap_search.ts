import { zod_rules } from '#shared/rules/app/imap_search'
import { getRules } from '#b/shared/rules/getRules'
import hasPerm from '#ba/utils/hasPerm'

const rules = getRules(zod_rules);

const getHeaders = (t: any) => [
    { title: 'table.common.owner', key: 'owner_id', get_type: "string", set_type: "string_line", rules: [(v: string) => !!v || 'rules.invalid_field'] },
    { title: 'table.imap_search.name', key: 'name', get_type: "string", set_type: "string_line", rules: rules.name },
    { title: 'table.imap_search.search', key: 'search', get_type: "json", set_type: "imap_search_builder", rules: rules.search },
    { title: 'table.common.actions', key: 'actions', sortable: false },
];

export default function (t: any) {
    const features: string[] = []
    if (hasPerm(['imap_search.crud.create'])) features.push('create')
    if (hasPerm(['imap_search.crud.update'])) features.push('update')
    if (hasPerm(['imap_search.crud.delete'])) {
        features.push('delete')
        features.push('deleteMany')
    }

    return {
        title: 'table.imap_search.title',
        headers: getHeaders(t),
        path_base: '/api/admin/app/imap_search',
        features,
        readOnMount: true
    }
}
