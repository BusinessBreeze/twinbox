// Source types as the app and the server both know them (docs/specs/SPEC_sources.md section 4): the facts and the
// field rules the form shows while typing. The server adds its class (server/jobs/sources/registry.ts), the app its
// form (app/schemas/source_types/). Checks that need more than one field or the database live in the server class.
// Adding a source type = a file here + its class + its form.
import { imapType } from './imap';
import { stagingType } from './staging';
import type { SourceType } from '../types/sources';

export const sourceTypes: SourceType[] = [imapType, stagingType];

export const getSourceType = (type?: string | null): SourceType | undefined => sourceTypes.find((t) => t.type === type);
