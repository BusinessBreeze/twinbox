import { zod_rules } from '#shared/rules/app/automation'
import { getRules } from '#b/shared/rules/getRules'
import hasPerm from '#ba/util/hasPerm'

const rules = getRules(zod_rules);

const getHeaders = (t: any) => [
    { title: 'table.common.owner', key: 'owner_id', get_type: "string", set_type: "string_line", rules: [(v: string) => !!v || 'rules.invalid_field'] },
    { title: 'table.automation.name', key: 'name', get_type: "string", set_type: "string_line", rules: rules.name },
    { title: 'table.automation.imap_connection_id', key: 'imap_connection_id', get_type: "string", set_type: "string_line", rules: rules.imap_connection_id },
    { title: 'table.automation.search_id', key: 'search_id', get_type: "string", set_type: "string_line", rules: rules.search_id },
    { title: 'table.automation.llm_filter_id', key: 'llm_filter_id', get_type: "string", set_type: "string_line", rules: rules.llm_filter_id },
    { title: 'table.automation.poll_seconds', key: 'poll_seconds', get_type: "string", set_type: "integer", rules: rules.poll_seconds, default: 3600 },
    { title: 'table.common.actions', key: 'actions', sortable: false },
];

export default function (t: any) {
    const features: string[] = []
    if (hasPerm(['automation.crud.create'])) features.push('create')
    if (hasPerm(['automation.crud.update'])) features.push('update')
    if (hasPerm(['automation.crud.delete'])) {
        features.push('delete')
        features.push('deleteMany')
    }

    return {
        title: 'table.automation.title',
        headers: getHeaders(t),
        path_base: '/api/admin/app/automation',
        features,
        readOnMount: true
    }
}
