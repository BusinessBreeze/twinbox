import { zod_rules } from "#b/shared/rules/account"
import { getRules } from '#b/shared/rules/getRules'

const rules = getRules(zod_rules)

export default (t: any) => {
  return {
    headers: [
      {
        key: 'user',
        title: 'frontend.auth.username',
        set_type: 'string_line',
        rules: [
          (v: string) => !!v || 'table.account.rules.user.required',
          rules.user
        ]
      },
      {
        key: 'password',
        title: 'frontend.auth.password',
        set_type: 'password_confirm',
        rules: [
          (v: string) => !!v || 'rules.password.required',
          rules.password
        ]
      }
    ]
  }
}
