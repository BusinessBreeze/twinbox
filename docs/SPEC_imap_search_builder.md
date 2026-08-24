# Specification: IMAP Search Builder Component (`imap_search.vue` & `imap_search_node.vue`)

## 1. Overview

The `ImapSearchBuilder` (`app/components/imap_search/imap_search.vue` and `app/components/imap_search/imap_search_node.vue`) is a recursive visual rule tree component registered in the Nuxt application for constructing structured IMAP search query objects (`SearchObject`). It enables users to visually construct, nest, invert, and serialize complex search filters (such as headers, date ranges, subject matches, and logical AND/OR groups) for IMAP email polling connections.

---

## 2. Data Contract & Serialized Output Schema

### 2.1 Model Value Contract (`v-model`)

The component accepts and emits an object, array, or serialized JSON string representing standard ImapFlow / IMAP search criteria:

```json
{
  "subject": "Hailo",
  "seen": false,
  "header": {
    "X-Priority": "1"
  },
  "or": [
    { "from": "alerts@company.com" },
    { "_since_days": 7 }
  ],
  "not": {
    "flagged": true
  }
}
```

### 2.2 Serialization Architecture

- **`parseSearchObject`**: Translates incoming IMAP search criteria objects into an internal recursive node tree (`{ type: 'group' | 'rule', operator?: 'and' | 'or', field?: string, value?: any, not?: boolean, children?: any[] }`).
- **`serializeTree`**: Translates internal node tree state back into clean IMAP search JSON criteria objects.

---

## 3. Supported Search Fields & Input Types

| Field Key | i18n Label / Category | Data Type | UI Input Control |
| :--- | :--- | :--- | :--- |
| `from`, `to`, `cc`, `bcc` | Address filters | `text` | `v-text-field` |
| `subject`, `body`, `text` | Content filters | `text` | `v-text-field` |
| `seq`, `uid` | Sequence / UID filters | `text` | `v-text-field` |
| `seen`, `flagged`, `answered`, `deleted`, `draft`, `recent` | IMAP Flags | `boolean` | `v-btn-toggle` (`Yes` / `No`) |
| `since`, `before`, `on`, `sentSince`, `sentBefore`, `sentOn` | Absolute Dates | `date` | `DatePicker.vue` |
| `_since_days`, `_before_days`, `_on_days`, `_sentSince_days`, `_sentBefore_days`, `_sentOn_days` | Relative Date Offsets (Days) | `number` | `v-text-field` (`type="number"`) |
| `larger`, `smaller` | Size Limits (Bytes) | `number` | `v-text-field` (`type="number"`) |
| `header` | Custom Email Header | `header` | Twin `v-text-field` (`name`, `value`) |

---

## 4. Tree Component Structure & Logical Operators

### 4.1 Recursive Grouping Nodes (`group`)

1. **`AND` Operator Group**:
   - Rules inside an `AND` group are serialized as top-level key-value properties in the resulting object.
   - Rules with `not: true` are grouped under a top-level `not` object.
2. **`OR` Operator Group**:
   - Rules inside an `OR` group are serialized into an `or` array of criteria objects.
3. **Visual Depth Nesting**:
   - Group borders dynamically change translucent theme color indicators (`primary`, `secondary`, `info`) based on nesting `depth`.
   - Child rules and sub-groups render along a dashed vertical tree guide (`border-left-dashed`).

### 4.2 Field Disabling & Conflict Prevention Rules

- Under `AND` operator groups, selecting a search field disables that field (and its corresponding relative/absolute date pair, e.g., `since` and `_since_days`) in sibling dropdowns within the same positive or negative rule scope (`getSearchFieldsForChild`).
- This prevents users from adding conflicting or duplicate criteria within the same logical AND block.

---

## 5. UI Features, Controls & Dual View Modes

### 5.1 Dual View Modes
- **GUI Visual Builder Mode**: Interactive tree editor with field selectors, rule action buttons, and operator chips.
- **JSON View Mode**: Read-only pretty-printed JSON code snippet (`<pre>`) toggled via header action button (`mdi-code-json` / `mdi-email-search`).

### 5.2 Rule Actions & Operator Controls
- **Add Rule (`mdi-plus` elevated button)**: Appends a new search rule to the active group, defaulting to an unused field.
- **Add AND Group (`mdi-plus` tonal button)**: Appends a nested `AND` logical group.
- **Add OR Group (`mdi-plus` tonal button)**: Appends a nested `OR` logical group.
- **Negation Toggle (`≠` / `=`)**: Toggles rule `not` boolean flag (`not: true`).
- **Delete Group (`mdi-close`)**: Removes sub-group and all descendant children.
- **Remove Rule (`mdi-close`)**: Removes individual search rule.

### 5.3 Input Validation Rules
- All text, number, date, and header inputs enforce `valueRequiredRule` (prevents empty strings, `null`, or `undefined` values).
