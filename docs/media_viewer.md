# Media Viewer (`MediaViewer`)

`app/components/media_viewer/media_viewer.vue` (twinbox) shows content of a given mime type in a modal, with Close and Download. What it can show is decided by the renderer classes in `app/components/media_viewer/renderers/`.

---

## 1. Usage

```vue
<MediaViewer v-model="open" :mime="MESSAGE_RECORD_MIME" :data="JSON.stringify(record)" :title="record.subject" :download-url="`/api/v0.1/app/email/${record.id}?format=eml`" />
<MediaViewer v-model="open" mime="text/markdown" :data="blob" title="report.md" />
```

| Prop | Type | Meaning |
|---|---|---|
| `v-model` | `boolean` | Open or closed |
| `mime` | `string` | Mime type of `data` (`text/html`, `text/markdown`, `audio/mpeg`, ...) |
| `data` | `string \| Blob \| null` | The content; `null` while it loads |
| `title` | `string` | Heading |
| `filename` | `string` | Name of the downloaded file; default: the title plus the type's extension |
| `loading` | `boolean` | Spinner instead of the content |
| `download-url` | `string` | Download from here instead of the data (an email's server-built `.eml`) |

Under the title the viewer shows the mime type and the data's size (`text/html · 48 KB`), the same for every type.

The content is sanitized once each time it changes, then rendered. The download is the data as given (not the sanitized version). A type no renderer handles shows a message; it can still be downloaded.

For content that comes as a file name, `mimeFromName(name)` from `renderers/index.ts` gives the mime type by extension.

---

## 2. Renderers

Each renderer extends `MediaRenderer` (`renderers/renderer.ts`):

| Member | Purpose |
|---|---|
| `get mimeTypes(): string[]` | Types it shows; `type/*` matches a family (`audio/*`) |
| `get icon(): string` | Icon in the viewer's header (mdi name); default `mdi-file-outline` |
| `sanitize(data, mime)` | Makes the data safe to show; may be async; throws for data it refuses |
| `render(safe): VNode` | The sanitized content, inside the viewer's body |
| `extension(mime)` | Extension of a download, without the dot |
| `release(safe)` | Frees what `sanitize` allocated (object URLs) |
| `handles(mime)` | Matches `mime` against `mimeTypes` (inherited) |

Built in:

| Renderer | Types | Sanitizing / rendering |
|---|---|---|
| `MessageRenderer` | `application/vnd.twinbox.message+json` | A stored email record (section 3) |
| `EmailRenderer` | `message/rfc822` | Parsed with `postal-mime`; all headers as rows, then one chip per body part that is in the message (`text/html · 48 KB`, `text/plain · 3 KB`) switching the body, HTML first; each part sanitized and rendered by `HtmlRenderer` / `TextRenderer` |
| `HtmlRenderer` | `text/html`, `application/xhtml+xml` | DOMPurify (whole document, no forms or form fields); shown in an iframe sandboxed without scripts; its CSP blocks everything remote (tracking pixels, images, fonts, stylesheets), only embedded `data:` images show; links open in a new tab, height fitted to the content |
| `MarkdownRenderer` | `text/markdown` | `marked`, then DOMPurify; `.markdown-body` styles in the viewer |
| `TextRenderer` | `text/plain`, `text/csv`, `application/json` | Control characters dropped; shown escaped, line breaks kept |
| `AudioRenderer` | `audio/*` | Data must be a Blob; played from an object URL that is released on close |

An app adds its own types with `registerRenderer(new MyRenderer())` (from `renderers/index.ts`); renderers registered this way are asked before the built-in ones.

The `renderers/` folder is excluded from component auto-registration in `nuxt.config.ts`, since its files are classes.

---

## 3. Emails

The email page gives the viewer the stored record (`GET /api/v0.1/app/email/:id`) as JSON, mime
`application/vnd.twinbox.message+json` (`MESSAGE_RECORD_MIME` in `shared/types/email.ts`), shown by `MessageRenderer`:

- the headers of the envelope as rows;
- chips, first one selected: **Automation text** (the record's `text`, what the filter and tasks read; a marker shows
  where `limits.llm.max_input_chars` cuts it), then each rendition (`text/html`, `text/plain`; the text/plain one is
  left out when it says the same as the automation text), each forwarded message ("Forwarded: subject": its own
  headers, renditions and attachments), each attachment;
- a stored attachment is fetched from `/api/v0.1/app/files/:id` when chosen and shown by its type's renderer, or
  offered as a download ("no preview"); one not stored is shown disabled, with the reason below the chips;
- "Remove attachments" (with a confirmation) when the email has stored attachments: the email stays.

Download is the server's `.eml` (`?format=eml`, the `download-url` prop), with the stored attachments and forwarded
messages; it opens in any mail program. `EmailRenderer` still shows `.eml` files opened as files (e.g. an artifact).
See `docs/specs/SPEC_attachments.md`.
