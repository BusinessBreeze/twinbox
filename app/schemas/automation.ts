import { zod_rules } from '#shared/rules/app/automation'
import { getRules } from '#b/shared/rules/getRules'
import { apiGet } from '#ba/util/fetch/wrappers'

const rules = getRules(zod_rules);

export default async function (t: any) {
    let imapConnections: { title: string; value: string }[] = []
    let imapSearches: { title: string; value: string }[] = []
    let llmFilters: { title: string; value: string }[] = []
    let conns: any[] = []

    try {
        const [connRes, searchRes, filterRes] = await Promise.all([
            apiGet('/api/v0.1/app/connections_imap'),
            apiGet('/api/v0.1/app/imap_search'),
            apiGet('/api/v0.1/app/llm_filter')
        ])

        conns = Array.isArray(connRes) ? connRes : (connRes?.data || [])
        const searches = Array.isArray(searchRes) ? searchRes : (searchRes?.data || [])
        const filters = Array.isArray(filterRes) ? filterRes : (filterRes?.data || [])

        imapConnections = conns.map((item: any) => ({
            title: item.name,
            value: item.id
        }))
        const noneLabel = t('table.common.none') as string;
        imapSearches = [
            { title: noneLabel, value: null as any },
            ...searches.map((item: any) => ({
                title: item.name,
                value: item.id
            }))
        ]
        llmFilters = [
            { title: noneLabel, value: null as any },
            ...filters.map((item: any) => ({
                title: item.name,
                value: item.id
            }))
        ]
    } catch (e) {
        console.error("Failed to load automation dropdown values", e)
    }

    return {
        title: 'table.automation.title',
        headers: [
            { title: 'table.automation.name', key: 'name', get_type: "string", set_type: "string_line", rules: rules.name },
            { title: 'table.automation.active', key: 'active', get_type: "boolean", set_type: "boolean", set_as_number: true, default: 1 },
            { title: 'table.automation.imap_connection', key: 'imap_connection_id', get_type: "enum", set_type: "enum", enum_values: imapConnections, rules: rules.imap_connection_id },
            {
                title: 'table.automation.imap_folder',
                key: 'imap_folder',
                get_type: "string",
                set_type: "enum",
                enum_values: async (header: any, formData: any) => {
                    const connId = formData?.imap_connection_id;
                    if (!connId) return [];
                    const conn = conns.find((c: any) => c.id === connId);
                    if (!conn || !conn.folders) return [];
                    return conn.folders.map((folder: string) => ({
                        title: folder,
                        value: folder
                    }));
                },
                rules: rules.imap_folder
            },
            { title: 'table.automation.search', key: 'search_id', get_type: "enum", set_type: "enum", enum_values: imapSearches, rules: rules.search_id },
            { title: 'table.automation.llm_filter', key: 'llm_filter_id', get_type: "enum", set_type: "enum", enum_values: llmFilters, rules: rules.llm_filter_id },
            { title: 'table.automation.poll_seconds', key: 'poll_seconds', get_type: "string", set_type: "integer", rules: rules.poll_seconds, default: 3600 },
            { title: 'table.automation.tasks', key: 'tasks', set_type: "automation_task_chooser", rules: rules.tasks, default: { multiple: false, tasks: [] } },
            { title: 'table.common.actions', key: 'actions', sortable: false },
        ],
        path_base: '/api/v0.1/app/automation',
        features: ['create', 'update', 'delete', 'deleteMany'],
        readOnMount: true
    }
}
