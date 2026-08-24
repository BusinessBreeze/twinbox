import crypto from "node:crypto";

function getKey(): Buffer {
    const secret = process.env.SECRET_ENCRYPTION_KEY;
    if (!secret) {
        throw new Error('SECRET_ENCRYPTION_KEY environment variable is not set');
    }
    return crypto.createHash('sha256').update(secret).digest();
}

export function encryptValue(val: any): any {
    if (val === undefined || val === null || val === '') return val;
    const key = getKey();
    const str = String(val);
    if (str.startsWith('enc:')) return str; // add the preface in case we switch encryption schemes - we never know!

    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    let encrypted = cipher.update(str, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const tag = cipher.getAuthTag().toString('hex');

    return `enc:${iv.toString('hex')}:${tag}:${encrypted}`;
}

export function decryptValue(val: any): any {
    if (val === undefined || val === null || val === '') return val;
    if (typeof val !== 'string' || !val.startsWith('enc:')) {
        throw new Error('Value is not encrypted');
    }
    const key = getKey();
    const parts = val.slice(4).split(':');
    if (parts.length !== 3) {
        throw new Error('Malformed encrypted payload');
    }
    const [ivHex, tagHex, encryptedHex] = parts;
    const iv = Buffer.from(ivHex, 'hex');
    const tag = Buffer.from(tagHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    if (/^\d+$/.test(decrypted)) {
        return Number(decrypted);
    }
    return decrypted;
}

export function encryptObject(obj: any, keys: readonly string[]): any {
    if (!obj || typeof obj !== 'object') return obj;
    const encrypted = { ...obj };
    for (const k of keys) {
        if (k in encrypted && encrypted[k] !== undefined && encrypted[k] !== null) {
            encrypted[k] = encryptValue(encrypted[k]);
        }
    }
    return encrypted;
}

export function decryptObject(obj: any, keys: readonly string[]): any {
    if (!obj || typeof obj !== 'object') return obj;
    const decrypted = { ...obj };
    for (const k of keys) {
        if (k in decrypted && decrypted[k] !== undefined && decrypted[k] !== null) {
            decrypted[k] = decryptValue(decrypted[k]);
        }
    }
    return decrypted;
}
