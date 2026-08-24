# Specification: Automation Task Chooser Component (`automation_task_chooser.vue`)

## 1. Overview

The `AutomationTaskChooser` (`app/components/automation_task_chooser.vue`) is a specialized dynamic form control component registered in the Nuxt application for configuring email automation pipelines. It allows users to visually build, configure, sequence, and reorder automated operations (such as LLM artifact generation, text-to-speech, and multi-channel notifications) for IMAP email polling automations.

---

## 2. Data Contract & Payload Schema

### 2.1 Model Value Contract (`v-model`)

The component accepts and emits either a serialized JSON string or an object with top-level automation execution flags and a sequence of tasks:

```json
{
  "multiple": false,
  "imap_mark_read": true,
  "only_new": true,
  "source_links": true,
  "tasks": [
    {
      "name": "create_artifact",
      "arguments": {
        "name": "summary_text",
        "source": "email",
        "task_id": "51cad407-81b2-4a06-9f2a-6d17bd38a8bb"
      }
    },
    {
      "name": "send_items",
      "arguments": {
        "source": [
          { "name": "email", "mime_type": "text/plain" },
          { "name": "summary_text", "mime_type": "text/markdown" }
        ],
        "destination": "ba6ff1fd-0e57-493d-b663-b01846acb4ce",
        "keep_threadid": true
      }
    }
  ]
}
```

### 2.2 Top-Level Execution Flags

| Property | UI Control | Default | Description |
| :--- | :--- | :--- | :--- |
| `imap_mark_read` | `v-checkbox` (`Mark as Read`) | `false` | When enabled, fetched emails are marked as `\Seen` on the IMAP server. |
| `only_new` | `v-checkbox` (`Only New`) | `false` | When enabled, emails that have already been downloaded/persisted in the database are skipped. |
| `source_links` | `v-checkbox` (`Source Links`) | `false` | When enabled, appends absolute web application links in IMAP source message footers. |
| `multiple` | `v-checkbox` (`Multiple`) | `false` | Enables batch execution mode (processes all polled emails together vs individually). **Only visible when a `create_artifact` task exists in the pipeline.** |

---

## 3. Dynamic Task Argument Schemas & Input Controls

Task definitions and argument schemas are loaded asynchronously at mount time from `/api/v0.1/app/automation/tasks`:

| Argument Type | Rendered UI Control | Stored Data Type | Description / Data Source |
| :--- | :--- | :--- | :--- |
| `string` | `v-text-field` | `string` | Standard text input. Required validation enforced. |
| `boolean` | `v-checkbox` | `boolean` | Toggle checkbox (defaults to `false`). |
| `notification_channel_id` | `v-select` | `string` (UUID) | Notification target channel loaded from `/api/user/notification`. |
| `task_id` | `v-select` | `string` (UUID) | LLM prompt/artifact specification loaded from `/api/v0.1/app/llm_create_artifact`. |
| `artifact_name` | `v-select` | `string` | Single artifact selection. Options include default `'email'` plus preceding `create_artifact` output names. |
| `artifact_names` | `v-select` (multi + chips) | `Array<{ name: string, mime_type: string }>` | Multi-selection chips array. Options include default `'email'` plus preceding `create_artifact` output names and MIME types. Uses custom `:value-comparator`. |

---

## 4. Conditional Visibility & Business Rules

### 4.1 `multiple` Header Checkbox Visibility
- The top-level `multiple` checkbox is rendered in the header **only** if at least one `create_artifact` task is present in the pipeline (evaluated via `firstCreateArtifact` computed property).

### 4.2 `keep_threadid` Conditional Rule
- The `keep_threadid` argument is only visible for notification tasks (`send_message`, `send_attachment`, `send_items`) if the selected `destination` channel's provider is `'Email'` or `'IMAP'`.
- If the selected channel is a non-email provider (e.g. Discord, Slack, WhatsApp, Telegram), `keep_threadid` is hidden automatically.

### 4.3 Output Artifact Name Uniqueness
- Output artifact names (`argName === 'name'`) must be unique across all task instances within the automation pipeline. Duplicate artifact names trigger a validation error (`rules.unique_name`).

### 4.4 Upstream Artifact Reference Sanitization
- When an upstream `create_artifact` task is deleted or renamed, `sanitizeArtifactSelections` automatically scans downstream `artifact_name` and `artifact_names` references and prunes any selected artifact names that are no longer available in preceding options.

---

## 5. UI Architecture & Reordering Controls

### 5.1 Layout & Visual Design
- **Floating Outlined Label**: Form card features an anchored floating label (`Task Chooser`) styled with Vuetify surface theme tokens.
- **Empty State**: Displays a dashed placeholder container (`border: 2px dashed #ccc;`) with `mdi-robot-vacuum` when no tasks are added.
- **Micro-Animations**: Smooth entry, exit, and list reordering using `<transition-group name="task-list">` with 300ms CSS transitions.
- **Stable Element Binding**: Every task instance generates a stable internal `_id` key (`generateId()`) to prevent Vue DOM re-render glitches during reordering.

### 5.2 Task Operations
- **Add Task**: Opens a `v-menu` listing available task definitions from `tasksSchema`. Seeds default values for all arguments.
- **Move Up (`mdi-chevron-up`)**: Swaps position with preceding task. Disabled for the first item (`index === 0`).
- **Move Down (`mdi-chevron-down`)**: Swaps position with following task. Disabled for the last item (`index === length - 1`).
- **Delete Task (`mdi-close`)**: Removes task at index and triggers artifact sanitization.
- **Clear All (`mdi-close` header button)**: Resets all tasks (`localTasks = []`).

---

## 6. Lifecycle & Reactivity Implementation

1. **Prop Hydration & Legacy Migration**:
   - Parses incoming string or object `modelValue`.
   - Automatically migrates legacy tasks containing an `imap_mark_read` task into the top-level `imap_mark_read: true` header flag.
2. **Feedback Loop Prevention (`lastEmittedJson`)**:
   - Emitted payloads are stringified to `lastEmittedJson`. The `modelValue` watcher skips incoming prop updates matching `lastEmittedJson` to prevent infinite re-render loops.
3. **Async Schema Watcher**:
   - If task schemas finish loading after component mount, `tasksSchema` watcher re-evaluates and normalizes `localTasks` without losing user input.
