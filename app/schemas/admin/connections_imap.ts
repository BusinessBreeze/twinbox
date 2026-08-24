import { zod_rules } from '#shared/rules/app/connections_imap'
import { getRules } from '#b/shared/rules/getRules'
import hasPerm from '#ba/util/hasPerm'
import { z } from 'zod'

const rules = getRules(zod_rules);

const credentialRule = (v: any) => {
  const schema = z.string().min(1, "rules.connections_imap.config.credential.required");
  const res = schema.safeParse(v);
  return res.success || res.error?.issues?.[0]?.message || "Invalid input";
};

const oauthRefreshTokenRule = (v: any) => {
  const schema = z.string().min(1, "rules.connections_imap.config.oauth_refresh_token.required");
  const res = schema.safeParse(v);
  return res.success || res.error?.issues?.[0]?.message || "Invalid input";
};

const oauthTokenExpiryRule = (v: any) => {
  const schema = z.union([
    z.number(),
    z.string().regex(/^\d+$/, "rules.connections_imap.config.oauth_token_expiry.invalid")
  ]).transform(val => Number(val)).pipe(z.number().int().min(0));
  const res = schema.safeParse(v);
  return res.success || res.error?.issues?.[0]?.message || "Invalid input";
};

const getHeaders = (t: any) => [
  { title: 'table.common.owner', key: 'owner_id', get_type: "string", set_type: "string_line", rules: [(v: string) => !!v || 'rules.invalid_field'] },
  { title: 'table.connections_imap.tag', key: 'tag', get_type: "string", set_type: "string_line", rules: rules.tag },
  { title: 'table.connections_imap.host', key: 'host', get_type: "string", set_type: "string_line", rules: rules.host },
  { title: 'table.connections_imap.port', key: 'port', get_type: "number", set_type: "string_line", rules: rules.port },
  { title: 'table.connections_imap.use_ssl', key: 'use_ssl', get_type: "boolean", set_type: "boolean", set_as_number: true, default: 1 },
  { title: 'table.connections_imap.auth_type', key: 'auth_type', get_type: "enum", set_type: "enum", enum_values: ['oauth', 'login'], select_type: "single", rules: rules.auth_type, default: 'oauth' },
  { title: 'table.connections_imap.username', key: 'username', get_type: "string", set_type: "string_line", rules: rules.username },
  {
    title: 'table.connections_imap.config',
    key: 'config',
    set_type: 'form',
    value: (header: any, row: any) => {
      const auth_type = row?.auth_type || 'oauth';
      if (auth_type === 'login') {
        return [
          { title: 'table.connections_imap.credential', key: 'credential', get_type: 'string', set_type: 'string_line', rules: [credentialRule] }
        ];
      } else {
        return [
          { title: 'table.connections_imap.oauth_refresh_token', key: 'oauth_refresh_token', get_type: 'string', set_type: 'string_line', rules: [oauthRefreshTokenRule] },
          { title: 'table.connections_imap.oauth_token_expiry', key: 'oauth_token_expiry', get_type: 'number', set_type: 'string_line', rules: [oauthTokenExpiryRule] }
        ];
      }
    }
  },
  { title: 'table.common.actions', key: 'actions', sortable: false },
];

export default function (t: any) {
  const features: string[] = []
  if (hasPerm(['connections_imap.crud.create'])) features.push('create')
  if (hasPerm(['connections_imap.crud.update'])) features.push('update')
  if (hasPerm(['connections_imap.crud.delete'])) {
    features.push('delete')
    features.push('deleteMany')
  }

  return {
    title: 'table.connections_imap.title',
    headers: getHeaders(t),
    path_base: '/api/admin/app/connections_imap',
    features,
    readOnMount: true
  }
}
