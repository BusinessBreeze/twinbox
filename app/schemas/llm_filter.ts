import { zod_rules } from '#shared/rules/app/llm_filter'
import { getRules } from '#b/shared/rules/getRules'

const rules = getRules(zod_rules);

const getHeaders = (t: any) => [
    { title: 'table.llm_filter.name', key: 'name', get_type: "string", set_type: "string_line", rules: rules.name },
    { title: 'table.llm_filter.description', key: 'description', get_type: "string", set_type: "string_area", rules: rules.description },
    { title: 'table.llm_filter.prompt', key: 'prompt', get_type: "string", set_type: "string_area", rules: rules.prompt },
    { title: 'table.common.actions', key: 'actions', sortable: false },
];

export default function (t: any) {
    return {
        title: 'table.llm_filter.title',
        headers: getHeaders(t),
        path_base: '/api/v0.1/app/llm_filter',
        features: ['create', 'update', 'delete', 'deleteMany'],
        readOnMount: true
    }
}
