# Getting absolutely all of your Gmail into another account

Gmail's forwarding sends on **new incoming** email only. "Absolutely everything" has more to it: email you already
have, email you send, and spam. This guide shows what each way covers and how to set it up. You need a **computer**
with a web browser.

---

## What each way covers

| | New incoming email | Spam | Email you send | Email you already have |
|---|---|---|---|---|
| **A. Forwarding** | yes | no | no | no |
| **B. Letting the other system read your Gmail** (IMAP, app password) | yes | yes | yes | yes |
| **C. Export once** (Google Takeout) | (until the export) | yes | yes | yes |

- If the other system can sign in to a mailbox itself (twinbox can, as can mail programs like Thunderbird or
  Outlook): use **B**. It is the only way that keeps up with everything, including what you send.
- If the other side is just an email address: use **A** for everything new, plus **C** once for everything old.
  Email you send and spam then stay in Gmail only.

---

## A. Forwarding new incoming email

Follow [Forwarding all your Gmail to another address](gmail_forward.md). It takes about 5 minutes.

What it does not include:
- **Spam**: Gmail never forwards email it put into Spam. Look into your Spam folder from time to time.
- **Email you send**: forwarding only covers what arrives. To have a copy of something you send, add the other
  address in **Bcc** when you write it.
- **Email from before** you switched forwarding on.

---

## B. Letting the other system read your Gmail (everything, kept up to date)

The other system signs in to your Gmail like a mail program does and reads every folder: Inbox, Sent, Spam,
your labels. Nothing is copied by Gmail; the other system fetches it.

### 1. Switch on 2-Step Verification

Google only gives out app passwords to accounts with 2-Step Verification.

1. Go to [myaccount.google.com/security](https://myaccount.google.com/security).
2. Under **How you sign in to Google**, click **2-Step Verification** and follow the steps (usually: your phone
   number, then a code by text message).

### 2. Create an app password

An app password is a separate password for one program. It doesn't change your normal password, and you can delete
it at any time.

1. Go to [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords) (sign in again if asked).
2. Type a name you'll recognize, e.g. **twinbox**, and click **Create**.
3. Google shows a 16-letter password **once**. Copy it straight into the other system (next step). Don't keep it
   anywhere else.

If the page says app passwords aren't available: 2-Step Verification isn't on yet, or you have a work or school
account whose administrator switched them off.

### 3. Enter the connection in the other system

| Setting | Value |
|---|---|
| Server (IMAP) | `imap.gmail.com` |
| Port | `993` |
| Encryption | SSL/TLS (on) |
| User name | your full Gmail address |
| Password | the app password from step 2 |

In twinbox: **Sources → +**, type **IMAP**, the values above, then **Test** and **Save**. Choose which folders
your automations read: Gmail's sent email is in **[Gmail]/Sent Mail**, spam in **[Gmail]/Spam**, everything in
**[Gmail]/All Mail**.

IMAP is always on for Gmail; there is no setting to switch on in Gmail itself.

### Switching it off again

Delete the app password at [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords). The other
system can't sign in from that moment on.

---

## C. Exporting everything once (Google Takeout)

A complete copy of your mailbox as it is today, as a file.

1. Go to [takeout.google.com](https://takeout.google.com).
2. Click **Deselect all**, then tick only **Mail**. (Under **All Mail data included** you can limit it to some
   labels.)
3. Click **Next step**, keep **Send download link via email** and **Export once**, choose **.zip**, and click
   **Create export**.
4. Google emails you a link when the export is ready: minutes for a small mailbox, up to a few days for a large one.
   Download the file within a week.

The download holds one `.mbox` file with all your email (sent and spam included). A mail program such as
Thunderbird can open it (with the add-on *ImportExportTools NG*) and move the email into the other account.

---

## Good to know

- **Work or school accounts** (an address not ending in @gmail.com): the administrator may have switched off
  forwarding, IMAP access or app passwords. If an option is missing or greyed out, ask them.
- **Labels** in Gmail are folders in IMAP; an email with two labels appears in both folders, and every email is in
  **[Gmail]/All Mail**.
- None of these ways deletes anything in Gmail.
