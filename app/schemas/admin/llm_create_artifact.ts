import { zod_rules } from '#shared/rules/app/llm_create_artifact'
import { getRules } from '#b/shared/rules/getRules'
import hasPerm from '#ba/utils/hasPerm'

const rules = getRules(zod_rules);

const getHeaders = (t: any) => [
    { title: 'table.common.owner', key: 'owner_id', get_type: "string", set_type: "string_line", rules: [(v: string) => !!v || 'rules.invalid_field'] },
    { title: 'table.llm_create_artifact.name', key: 'name', get_type: "string", set_type: "string_line", rules: rules.name },
    { title: 'table.llm_create_artifact.description', key: 'description', get_type: "string", set_type: "string_area", rules: rules.description },
    { title: 'table.llm_create_artifact.prompt', key: 'prompt', get_type: "string", set_type: "string_area", rules: rules.prompt },
    { title: 'table.common.actions', key: 'actions', sortable: false },
];

export default function (t: any) {
    const features: string[] = []
    if (hasPerm(['llm_create_artifact.crud.create'])) features.push('create')
    if (hasPerm(['llm_create_artifact.crud.update'])) features.push('update')
    if (hasPerm(['llm_create_artifact.crud.delete'])) {
        features.push('delete')
        features.push('deleteMany')
    }

    return {
        title: 'table.llm_create_artifact.title',
        headers: getHeaders(t),
        path_base: '/api/admin/app/llm_create_artifact',
        features,
        readOnMount: true
    }
}
