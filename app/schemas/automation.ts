import { zod_rules, automationOptionsSchema } from '#shared/rules/app/automation'
import { getRules } from '#b/shared/rules/getRules'
import { limits } from '#shared/limits'
import { apiGet, apiPost } from '#ba/utils/fetch/wrappers'
import type { SourceKeyList } from '#shared/types/sources'
import { getSourceType } from '#shared/source_types'
import { sourceForm } from './source_types'

const rules = getRules(zod_rules);

// For every source type: how long the artifacts this automation delivers to the local channel are kept (0: all)
const retentionOptions = [
    { key: 'artifact_keep_days', title: 'table.automation.options.artifact_keep_days', set_type: 'integer', default: 0, opts: { min: 0 } },
    { key: 'artifact_keep_last', title: 'table.automation.options.artifact_keep_last', set_type: 'integer', default: 0, opts: { min: 0 } },
]

export default async function (t: any) {
    // What automations can subscribe to right now (IMAP folders are listed live) and the user's sources (their types:
    // each type has its own automation options and item mime)
    let keyList: SourceKeyList = { keys: [], unavailable: [] }
    let userSources: any[] = []
    try {
        const [keys, sources] = await Promise.all([
            apiGet<any>('/api/v0.1/app/sources/keys'),
            apiGet<any>('/api/v0.1/app/sources'),
        ])
        keyList = keys?.data || keyList
        userSources = Array.isArray(sources) ? sources : (sources?.data || [])
    } catch (e) {
        console.error("Failed to load sources for the automation form", e)
    }

    const sourceIdOf = (key: string) => (key || '').split(':')[0]
    const typeOfKey = (key: string) => userSources.find((src: any) => src.id === sourceIdOf(key))?.type as string | undefined
    // A source whose server can't be reached right now: its stored keys are kept as they are
    const unavailable = (key: string) => keyList.unavailable.some((u) => u.source_id === sourceIdOf(key))
    const options = keyList.keys.map((k) => ({ title: k.label, value: k.key }))
    // The folders of a key's source: its keys without a search ('<sourceId>:<folder>:')
    const foldersOf = (key: string) => {
        const id = sourceIdOf(key) ?? ''
        return keyList.keys.filter((k) => k.source_id === id && k.key.endsWith(':') && k.key.startsWith(`${id}:`))
            .map((k) => k.key.slice(id.length + 1, -1))
    }

    // A stored key that isn't offered any more (source, folder or search gone): shown with its saved label and a red note
    const withStored = (formData: any) => {
        const key = formData?.source_key
        return key && !options.some((o) => o.value === key) ? [...options, { title: formData?.source_label || key, value: key }] : options
    }

    return {
        title: 'table.automation.title',
        headers: [
            { title: 'table.automation.name', key: 'name', get_type: "string", set_type: "string_line", rules: rules.name },
            { title: 'table.automation.active', key: 'active', get_type: "boolean", set_type: "boolean", opts: { set_as_number: true }, default: 1, rules: rules.active },
            // Table column: readable key from the server; the form uses the dropdown below
            { title: 'table.automation.source', key: 'source_label', get_type: "string" },
            {
                title: 'table.automation.source', key: 'source_key', set_type: "enum",
                opts: { enum_values: async (header: any, formData: any) => withStored(formData) },
                rules: [
                    (v: any) => !!v || t('table.automation.rules.source_key.required'),
                    (v: any) => !v || options.some((o) => o.value === v) || unavailable(v) || t('table.automation.rules.source_key.deleted'),
                ]
            },
            {
                // Settings of the selected source's type (IMAP: mark read / important, links), stored in options
                title: 'table.automation.options.title',
                key: 'options',
                set_type: 'form',
                opts: {
                    nested_headers: (header: any, formData: any) => [
                        ...(sourceForm(typeOfKey(formData?.source_key))?.automationOptions({ folders: foldersOf(formData?.source_key), t }) ?? []),
                        ...retentionOptions,
                    ],
                },
            },
            {
                title: 'table.automation.filter_prompt.title', key: 'filter_prompt', set_type: 'string_area', default: '',
                opts: {
                    placeholder: t('table.automation.filter_prompt.placeholder'), max_chars: limits.llm.max_prompt_chars,
                    // ✨ drafts the criteria from the staged emails (improves what is already written)
                    action: {
                        icon: 'mdi-creation', tooltip: t('automation_draft.suggest_filter'),
                        run: async (current: string) => (await apiPost<any>('/api/v0.1/app/automation/draft', { target: 'filter_prompt', current }))?.data?.text || undefined,
                    },
                },
                rules: (v: any) => automationOptionsSchema.shape.filter_prompt.safeParse(v).error?.issues[0]?.message || true,
            },
            {
                title: 'table.automation.tasks', key: 'tasks', set_type: "automation_task_chooser", rules: rules.tasks, default: [],
                // The chooser checks task inputs against what the selected source produces
                opts: { sourceMime: (formData: any) => getSourceType(typeOfKey(formData?.source_key))?.itemMime ?? null },
            },
            { title: 'table.common.actions', key: 'actions', sortable: false },
        ],
        path_base: '/api/v0.1/app/automation',
        features: ['create', 'update', 'delete', 'deleteMany'],
        readOnMount: true,
        live: ['automations'],          // live updates: created, changed, ran, had an issue
    }
}
