<p align="center">
  <img src="public/images/TwinBox.png" alt="TwinBox Logo" width="280"/>
</p>

<h1 align="center">TwinBox</h1>
<p align="center">
  <strong>An AI-powered, privacy-first email parsing, synthesis, and multi-channel notification engine.</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/status-alpha-orange.svg" alt="Project Status"/>
  <img src="https://img.shields.io/badge/license-MIT-green.svg" alt="License"/>
  <img src="https://img.shields.io/badge/stack-Nuxt--Hub--Drizzle-blue.svg" alt="Stack"/>
</p>

---

## Overview

**TwinBox** (also referred to as the Email Reporter) is an intelligent assistant designed to summarize incoming emails and push high-fidelity, actionable reports to your preferred notification channels. 

## Key Capabilities

- **Email Ingestion**: Supports direct SMTP ingestion (listening on port `2525`). Native IMAP polling.
- **AI Summarization & Action Extraction**: Integrates with local LLM APIs via LangChain and Ollama.
- **Text-to-Speech (TTS) Reports**: Synthesizes the generated digest into high-quality audio reports.
- **Multi-Channel Dispatch**: Integrates with **Apprise**, supporting over 150+ notification services (e.g., Discord, Slack, Telegram, Matrix, Pushbullet, ntfy, etc.) plus custom Email and WhatsApp endpoints.

---

# Architecture
---

## Project Status

Currently in **Alpha**.

## Flow

1. **Configure Accounts**: Set up your incoming IMAP mail accounts and destination notification channels.
2. **Define Structure**: Establish your target email folders (e.g., Important, Information, AI Spam, Dangerous).
3. **Target Content**: Set up custom IMAP searches and local LLM filters to isolate specific incoming messages.

## Automation

The application ingests your emails locally and automatically triggers processing jobs based on your rules:

*   **Twinbox Generation**: Creates a mirrored, custom view of your inbox populated with AI-generated overviews, thread contexts, and extracted facts.
*   **Smart Routing**: Moves incoming emails to specific, topic-defined folders automatically.
*   **Report Generation**: Writes detailed explanations for filtered emails (e.g., why a message was marked "Suspicious" or "AI Spam").
*   **Digest Creation**: Consolidates multiple related emails or newsletters into unified data summaries.
*   **TTS Overviews**: Converts written email summaries into Text-to-Speech audio overviews.

## Results

*   **Delivery**: All processed summaries, digests, and safety reports are sent directly back to your email inbox or designated notification channels.


---

## ⚠️ SMTP Forwarding Troubleshooting

If your email provider rejects forwarding directly to your local instance (due to IP reputation, residential IP blocks, or missing SPF/DKIM alignments), you can pull and forward mail spools locally using utilities like `fdm` and `msmtp`.

#### Configuration Example

Create a file named `fetch.conf`:
```ini
account "test" imaps server "mail.mycompany.com" user "[EMAIL_ADDRESS]" pass "[PASSWORD]" new-only keep

action "forward" pipe "msmtp --host=localhost --port=2525 -t --from=[EMAIL_ADDRESS]"

match account "test" action "forward"
```

Run the fetch command:
```bash
fdm -f fetch.conf fetch
```
*Note: This workaround can be automated via cron and will be deprecated once native IMAP polling is implemented directly in TwinBox.*

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).
