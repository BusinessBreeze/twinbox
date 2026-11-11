// html-to-text ships no types; the one function server/services/app/email_builder.ts uses.
declare module 'html-to-text' {
    export function convert(html: string, options?: Record<string, unknown>): string;
}
