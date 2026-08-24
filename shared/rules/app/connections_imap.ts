import { z } from 'zod';

export const zod_rules = {
  name: z.string({
    errorMap: () => ({ message: "rules.connections_imap.name.invalid" })
  }).min(1, "rules.connections_imap.name.min").max(100, "rules.connections_imap.name.max"),

  host: z.string({
    errorMap: () => ({ message: "rules.connections_imap.host.invalid" })
  }).min(1, "rules.connections_imap.host.min").max(255, "rules.connections_imap.host.max"),

  port: z.union([
    z.number().int(),
    z.string().regex(/^\d+$/, "rules.connections_imap.port.invalid")
  ]).transform((val) => Number(val))
    .pipe(
      z.number().int().min(1, "rules.connections_imap.port.range").max(65535, "rules.connections_imap.port.range")
    ),

  use_ssl: z.union([z.boolean(), z.number()]).transform((val) => {
    if (typeof val === 'boolean') {
      return val ? 1 : 0;
    }
    return val === 1 ? 1 : 0;
  }).default(1),

  auth_type: z.enum(['oauth', 'login']).default('oauth'),

  username: z.string({
    errorMap: () => ({ message: "rules.connections_imap.username.invalid" })
  }).min(1, "rules.connections_imap.username.min").max(255, "rules.connections_imap.username.max"),

  config: z.object({
    credential: z.string().optional().nullable(),
    oauth_refresh_token: z.string().optional().nullable(),
    oauth_token_expiry: z.union([
      z.number(),
      z.string().transform((val) => {
        if (!val || val.trim() === '') return undefined;
        const num = Number(val);
        return isNaN(num) ? undefined : num;
      })
    ]).optional().nullable()
  }).optional().nullable()
};
