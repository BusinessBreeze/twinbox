# WhatsApp (deprecated prototype)

**This is not a working plugin.** It is prototype code that was abandoned once it was clear that WhatsApp may ban
the accounts of people who connect through unofficial clients like Baileys (`@whiskeysockets/baileys`). It is kept here
for reference only: nothing in the app imports it, it isn't type-checked or built, and it is left out of the Docker
image (`.dockerignore`).

WhatsApp is still reachable as a notification channel through Apprise, which uses Meta's official WhatsApp Cloud API.

## What it did

- `server/services/app/notification_channels/whatsapp.ts`: `WhatsappChannel`, a Baileys client whose login session
  was kept in the channel's config. `authorize(eventStream)` streamed the pairing QR code to the browser;
  `sendMessage(text)` and `sendAudio(data)` sent to the paired account.
- `app/components/notification_channels/whatsapp.vue`: the pairing dialog. It opened
  `/api/v0.1/app/notification_channels/whatsapp/create` (server-sent events; that route no longer exists) and showed
  the QR code to scan with the phone.

The files keep the paths they had in the app.

## How it was wired (removed from the app)

- An "Add WhatsApp" button in `customAdd` of the notification channel tables (base app
  `app/schemas/notification_channels.ts` and `app/schemas/admin/notifications.ts`), calling `onAddWhatsapp`, with the
  i18n key `table.notification_channels.add_whatsapp`.
- In the base app's `app/components/notifications.vue`, below the table:

  ```vue
  <v-row class="mt-6" v-if="showWhatsapp">
    <v-col cols="12" md="6" lg="5">
      <NotificationChannelsWhatsapp @cancel="showWhatsapp = false" />
    </v-col>
  </v-row>
  ```

## Packages it needed

Still listed in `package.json` (twinbox and the base app), used by nothing else:

| Package | Version | Used for |
|---|---|---|
| `@whiskeysockets/baileys` | ^7.0.0-rc12 | the WhatsApp client |
| `pino` | ^10.3.1 | Baileys' logger |
| `qrcode.vue` | ^3.9.1 | the QR code in the pairing dialog |
| `qrcode-terminal` | ^0.12.0 | QR code in the terminal (earlier experiments) |
| `whatsapp-web.js` | ^1.34.7 | an earlier attempt (browser automation) |
