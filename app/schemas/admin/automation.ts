import { zod_rules } from '#shared/rules/app/automation'
import { getRules } from '#b/shared/rules/getRules'
import hasPerm from '#ba/utils/hasPerm'

const rules = getRules(zod_rules);

const getHeaders = (t: any) => [
    { title: 'table.common.owner', key: 'owner_id', get_type: "string", set_type: "string_line", rules: [(v: string) => !!v || 'rules.invalid_field'] },
    { title: 'table.automation.name', key: 'name', get_type: "string", set_type: "string_line", rules: rules.name },
    { title: 'table.automation.active', key: 'active', get_type: "boolean", set_type: "boolean", opts: { set_as_number: true }, default: 1, rules: rules.active },
    { title: 'table.automation.source', key: 'source_key', get_type: "string", set_type: "string_line", rules: rules.source_key },
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
