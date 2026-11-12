import { zod_rules } from '#shared/rules/app/sources'
import { getRules } from '#b/shared/rules/getRules'
import { apiPost } from '#ba/utils/fetch/wrappers'
import { sourceTypes, getSourceType } from '#shared/source_types'
import { limits } from '#shared/limits'
import { sourceForm } from './source_types'

const rules = getRules(zod_rules);

export default async function (t: any, callbacks?: { onRunNow?: (item: any) => void }) {
    // Built-in sources (staging) only let the user change the fetch and pruning limits
    const builtin = (formData: any) => !!getSourceType(formData?.type)?.builtin;
    const notPollable = (formData: any) => !getSourceType(formData?.type)?.pollable;
    const creatable = sourceTypes.filter((x) => !x.builtin).map((x) => ({ title: t(x.title), value: x.type }));

    return {
        title: 'table.sources.title',
        headers: [
            { title: 'table.sources.name', key: 'name', get_type: 'string', set_type: 'string_line', rules: rules.name, hidden: builtin },
            {
                title: 'table.sources.type', key: 'type', get_type: 'string', set_type: 'enum',
                opts: { enum_values: creatable }, default: creatable[0]?.value, rules: rules.type, hidden: builtin,
            },
            {
                title: 'table.sources.config',
                key: 'config',
                set_type: 'form',
                hidden: builtin,
                opts: { nested_headers: (header: any, formData: any) => sourceForm(formData?.type)?.config(!formData?.id) ?? [] },
            },
            { title: 'table.sources.poll_seconds', key: 'poll_seconds', get_type: 'string', set_type: 'integer', default: limits.sources.default_poll_seconds, rules: rules.poll_seconds, hidden: notPollable },
            { title: 'table.sources.max_items_per_fetch', key: 'max_items_per_fetch', get_type: 'string', set_type: 'integer', default: limits.automation.max_emails_per_fetch, rules: rules.max_items_per_fetch },
            // Pruning of what the source downloaded (0 = no limit of its own); also for built-in sources
            { key: 'limits_note', set_type: 'note', opts: { text: 'table.sources.limits_note', color: 'primary' } },
            { title: 'table.sources.retention_days', key: 'retention_days', get_type: 'string', set_type: 'integer', default: 0, rules: rules.retention_days },
            { title: 'table.sources.max_items', key: 'max_items', get_type: 'string', set_type: 'integer', default: 0, rules: rules.max_items },
            { title: 'table.sources.max_size_mb', key: 'max_size_mb', get_type: 'string', set_type: 'integer', default: 0, rules: rules.max_size_mb },
            {
                // The fields of the selected type (app/schemas/source_types/)
                title: 'table.sources.settings', key: 'settings', set_type: 'source_settings_editor', default: {}, hidden: builtin,
            },
            { title: 'table.common.actions', key: 'actions', sortable: false },
        ],
        path_base: '/api/v0.1/app/sources',
        features: ['create', 'update', 'delete', 'deleteMany'],
        readOnMount: true,
        live: ['sources'],              // live updates: created, changed, polled
        formActions: [
            {
                label: t('table.sources.test'),
                icon: 'mdi-connection',
                successLabel: t('table.sources.connected'),
                run: (data: any) => apiPost('/api/v0.1/app/sources/test', data),
            },
        ],
        customActions: [
            { icon: 'mdi-play-circle-outline', tooltip: t('table.sources.run_now'), onActionClick: callbacks?.onRunNow },
        ],
    }
}
