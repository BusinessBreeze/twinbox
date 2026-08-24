import { zod_rules } from '#shared/rules/app/llm_filter'
import { getRules } from '#b/shared/rules/getRules'
import hasPerm from '#ba/util/hasPerm'

const rules = getRules(zod_rules);

const getHeaders = (t: any) => [
    { title: 'table.common.owner', key: 'owner_id', get_type: "string", set_type: "string_line", rules: [(v: string) => !!v || 'rules.invalid_field'] },
    { title: 'table.llm_filter.name', key: 'name', get_type: "string", set_type: "string_line", rules: rules.name },
    { title: 'table.llm_filter.description', key: 'description', get_type: "string", set_type: "string_area", rules: rules.description },
    { title: 'table.llm_filter.prompt', key: 'prompt', get_type: "string", set_type: "string_area", rules: rules.prompt },
    { title: 'table.common.actions', key: 'actions', sortable: false },
];

export default function (t: any) {
    const features: string[] = []
    if (hasPerm(['llm_filter.crud.create'])) features.push('create')
    if (hasPerm(['llm_filter.crud.update'])) features.push('update')
    if (hasPerm(['llm_filter.crud.delete'])) {
        features.push('delete')
        features.push('deleteMany')
    }

    return {
        title: 'table.llm_filter.title',
        headers: getHeaders(t),
        path_base: '/api/admin/app/llm_filter',
        features,
        readOnMount: true
    }
}
