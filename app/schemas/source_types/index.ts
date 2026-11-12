// The form parts of each source type (headers like any other schema); the facts and the config rules are shared
// (shared/source_types/). Read by the sources schema, the settings editor and the automation schema.
import imap from './imap'
import staging from './staging'

export interface SourceForm {
    config: (isNew: boolean) => any[]              // headers of the nested config form
    settings: () => any[]                          // fields of source_settings_editor ('note' or a widget's set_type)
    // "Source options" block of the automation form; folders: those of the selected source (IMAP, listed live)
    automationOptions: (ctx: { folders: string[]; t: (key: string) => string }) => any[]
}

const forms: Record<string, SourceForm> = { imap, staging }

export const sourceForm = (type?: string | null): SourceForm | undefined => forms[type ?? '']
