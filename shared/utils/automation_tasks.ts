// Automation constants and helpers shared by the app (task chooser) and the server (automation engine).

/** Reserved input id: the items the source fetched (emails today, anything later). */
export const SOURCE_INPUT = 'source';

/** Parsed email objects are tagged with this mime type to keep them distinct from plain text. */
export const EMAIL_MIME = 'message/rfc822';

/** Matches a mime type against patterns like 'text/*', 'message/rfc822' or '*'. */
export const mimeMatches = (mime: string, accepts: string[]): boolean => {
    const m = mime.toLowerCase();
    return accepts.some((pattern) => {
        const p = pattern.toLowerCase();
        if (p === '*' || p === '*/*') return true;
        if (p.endsWith('/*')) return m.startsWith(p.slice(0, -1));
        return m === p;
    });
};
