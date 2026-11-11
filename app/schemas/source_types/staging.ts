import type { SourceForm } from './index'

// Built in, no config or settings; staged emails are not on a mail server, so there is nothing to mark
const stagingForm: SourceForm = {
    config: () => [],
    settings: () => [],
    automationOptions: () => [
        { key: 'add_source_links', title: 'table.automation.options.add_source_links', set_type: 'boolean', default: false },
    ],
}

export default stagingForm
