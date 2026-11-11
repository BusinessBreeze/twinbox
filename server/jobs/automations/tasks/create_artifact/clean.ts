// The model's answer goes out to notification channels (HTML email, chat apps), where images load and links get
// clicked. An email that slipped instructions past the prompt could make it carry data out (an image URL with the
// summary in it loads when the notification is opened) or add a phishing link. So, whatever the prompt said:
// no images, no raw HTML, no data: URIs, and only links whose URL was in the input; any other URL becomes plain text.

const URL_PATTERN = /\bhttps?:\/\/[^\s<>()"'`\]]+/gi;

/** Trailing punctuation is not part of a URL in running text. */
const trimUrl = (url: string) => url.replace(/[.,;:!?]+$/, '');

export const cleanOutput = (markdown: string, input: string): string => {
    const known = new Set((input.match(URL_PATTERN) ?? []).map(trimUrl));
    const allowed = (url: string) => known.has(trimUrl(url));
    const REMOVED = '[link removed]';

    return markdown
        // Images, inline and by reference, and reference definitions (their URLs are checked like links below)
        .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
        .replace(/!\[([^\]]*)\]\[[^\]]*\]/g, '$1')
        .replace(/^\s*\[[^\]]+\]:\s*\S+.*$/gm, '')
        // Links: kept when their URL was in the input, else only their text
        .replace(/\[([^\]]*)\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g, (_m, text: string, url: string) => (allowed(url) ? `[${text}](${url})` : text))
        // Autolinks (<https://…>), before raw HTML goes
        .replace(/<(https?:\/\/[^>\s]+)>/gi, (_m, url: string) => (allowed(url) ? url : REMOVED))
        // Raw HTML: comments and tags
        .replace(/<!--[\s\S]*?-->/g, '')
        .replace(/<\/?[a-zA-Z][^>]*>/g, '')
        .replace(/\bdata:[a-z]+\/[a-z0-9.+-]+;base64,[a-z0-9+/=]+/gi, '')
        // Bare URLs that weren't in the input (many apps make them clickable)
        .replace(URL_PATTERN, (url) => (allowed(url) ? url : `${REMOVED}${url.slice(trimUrl(url).length)}`))
        .replace(/\n{3,}/g, '\n\n')
        .trim();
};
