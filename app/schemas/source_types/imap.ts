import { getRules } from '#b/shared/rules/getRules'
import { imapType } from '#shared/source_types/imap'
import { limits } from '#shared/limits'
import type { SourceForm } from './index'

const rules = getRules(imapType.configSchema.shape)

const imapForm: SourceForm = {
    // On edit the stored password is kept when its field stays empty (it is never sent to the browser)
    config: (isNew) => [
        { key: 'host', title: 'sources.types.imap.config.host', set_type: 'string_line', rules: rules.host },
        { key: 'port', title: 'sources.types.imap.config.port', set_type: 'integer', default: 993, opts: { min: 1, max: 65535 }, rules: rules.port },
        { key: 'use_ssl', title: 'sources.types.imap.config.use_ssl', set_type: 'boolean', default: true },
        { key: 'username', title: 'sources.types.imap.config.username', set_type: 'string_line', rules: rules.username },
        { key: 'credential', title: 'sources.types.imap.config.credential', set_type: 'string_secret', rules: isNew ? rules.credential : [] },
    ],
    settings: () => [
        // New searches are stored with a fixed since date (the server's normalizeSettings); the note says so
        { key: 'searches_note', title: '', set_type: 'note', opts: { text: ['sources.types.imap.settings.searches_note', { days: limits.sources.new_search_since_days }], color: 'primary' } },
        { key: 'searches', title: 'sources.types.imap.settings.searches', set_type: 'imap_searches' },
        // Off by default; the server must allow attachments too (limits.attachments.enabled), else it can't be switched on
        {
            key: 'download_attachments', title: '', set_type: 'checkbox',
            opts: {
                label: 'sources.types.imap.settings.download_attachments',
                disabled: !limits.attachments.enabled,
                hint: limits.attachments.enabled ? 'sources.types.imap.settings.download_attachments_hint' : 'sources.types.imap.settings.attachments_disabled',
            },
        },
    ],
    automationOptions: () => [
        { key: 'mark_read', title: 'table.automation.options.mark_read', set_type: 'boolean', default: false },
        { key: 'mark_important', title: 'table.automation.options.mark_important', set_type: 'boolean', default: false },
        { key: 'add_source_links', title: 'table.automation.options.add_source_links', set_type: 'boolean', default: false },
    ],
}

export default imapForm
