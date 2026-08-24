import { zod_rules } from "#b/shared/rules/account"

export default (t: any) => {
  return {
    headers: [
      {
        key: 'user',
        title: 'frontend.auth.email',
        set_type: 'string_line',
        type: 'email',
        rules: [
          (v: string) => !!v || 'rules.invalid_field',
          (v: string) => zod_rules.user.safeParse(v).success || 'account.user.invalid_email'
        ]
      },
      {
        key: 'password',
        title: 'frontend.auth.password',
        set_type: 'password_confirm',
        rules: [
          (v: string) => !!v || 'rules.password.required',
          (v: string) => zod_rules.password.safeParse(v).success || 'account.password.too_short'
        ]
      }
    ]
  }
}
