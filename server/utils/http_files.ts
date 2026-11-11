// Helpers for routes that send files: the owner of the request, and a safe Content-Disposition header.
import type { H3Event } from 'h3';

/** The signed-in user (session or API token); 401 without one. File and artifact services need it explicitly. */
export const requireOwner = async (event: H3Event): Promise<string> => {
    const ownerId = await resolveServiceContext(event);
    if (!ownerId) throw createError({ statusCode: 401, statusMessage: 'error auth.not_authenticated' });
    return ownerId;
};

/**
 * Content-Disposition for a file name the sender chose (RFC 6266): control characters (CR/LF: header injection)
 * removed, an ASCII fallback with quotes and backslashes replaced, and the full name percent-encoded in filename*.
 */
export const contentDisposition = (type: 'inline' | 'attachment', filename?: string | null): string => {
    const name = (filename || 'file').replace(/[\x00-\x1f\x7f]/g, '').trim() || 'file';
    const ascii = name.normalize('NFKD').replace(/[^\x20-\x7e]/g, '').replace(/["\\]/g, '_') || 'file';
    const encoded = encodeURIComponent(name).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
    return `${type}; filename="${ascii}"; filename*=UTF-8''${encoded}`;
};
