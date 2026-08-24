import { zod_rules } from '#shared/rules/app/imap_search'
import { getRules } from '#b/shared/rules/getRules'

const rules = getRules(zod_rules);

const getHeaders = (t: any) => [
    { title: 'table.imap_search.name', key: 'name', get_type: "string", set_type: "string_line", rules: rules.name },
    { title: 'table.imap_search.search', key: 'search', get_type: "string", set_type: "imap_search_builder", rules: rules.search },
    { title: 'table.common.actions', key: 'actions', sortable: false },
];

export default function (t: any) {
    return {
        title: 'table.imap_search.title',
        headers: getHeaders(t),
        path_base: '/api/v0.1/app/imap_search',
        features: ['create', 'update', 'delete', 'deleteMany'],
        readOnMount: true
    }
}
