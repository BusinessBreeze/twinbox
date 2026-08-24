# Guide: Adding Frontend Views & CRUD Tables for a Resource

This guide outlines the steps required to build and integrate frontend views for any arbitrary database resource (referred to as `my_resource`). This includes setting up user schemas, admin schemas, custom form inputs, routing, header integration, and translations.

---

## 1. Schema Definitions

The datatable framework renders fields and form inputs automatically based on metadata schemas. You must define both a user-space schema and an admin-space schema.

### A. User Schema
* **File:** `app/schemas/my_resource.ts`
* **Action:** Define headers specifying title keys, field types, input types, and rules.

```typescript
import { zod_rules } from '#shared/rules/app/my_resource'
import { getRules } from '#b/shared/rules/getRules'

const rules = getRules(zod_rules);

const getHeaders = (t: any) => [
    { title: t('table.my_resource.name') as string, key: 'name', get_type: "string", set_type: "string_line", rules: rules.name },
    { title: t('table.my_resource.description') as string, key: 'description', get_type: "string", set_type: "string_area", rules: rules.description },
    { title: t('table.common.actions'), key: 'actions', sortable: false },
];

export default function (t: any) {
    return {
        title: t('table.my_resource.title') as string,
        headers: getHeaders(t),
        path_base: '/api/v0.1/app/my_resource',
        features: ['create', 'update', 'delete', 'deleteMany'],
        readOnMount: true
    }
}
```

### B. Admin Schema
* **File:** `app/schemas/admin/my_resource.ts`
* **Action:** Define the administrative headers (typically including the resource `owner_id`) and gate permissions.

```typescript
import { zod_rules } from '#shared/rules/app/my_resource'
import { getRules } from '#b/shared/rules/getRules'
import hasPerm from '#ba/util/hasPerm'

const rules = getRules(zod_rules);

const getHeaders = (t: any) => [
    { title: t('table.common.owner') as string, key: 'owner_id', get_type: "string", set_type: "string_line", rules: [(v: string) => !!v || t('rules.invalid_field')] },
    { title: t('table.my_resource.name') as string, key: 'name', get_type: "string", set_type: "string_line", rules: rules.name },
    { title: t('table.my_resource.description') as string, key: 'description', get_type: "string", set_type: "string_area", rules: rules.description },
    { title: t('table.common.actions'), key: 'actions', sortable: false },
];

export default function (t: any) {
    const features: string[] = []
    if (hasPerm(['my_resource.crud.create'])) features.push('create')
    if (hasPerm(['my_resource.crud.update'])) features.push('update')
    if (hasPerm(['my_resource.crud.delete'])) {
        features.push('delete')
        features.push('deleteMany')
    }

    return {
        title: t('table.my_resource.title') as string,
        headers: getHeaders(t),
        path_base: '/api/admin/app/my_resource',
        features,
        readOnMount: true
    }
}
```

---

## 2. Registering Administrative Section

Add the administrative resource view to the admin dashboard component.

* **File:** `app/components/admin_app.vue`
* **Action:** Import the admin schema and append it to the on-mounted `admin_app` ref list.

```typescript
import myResourceMetaFcn from '~/schemas/admin/my_resource'

// Inside onMounted list:
admin_app.value = [
  {
    name: 'app_management',
    items: [
      // ...
      { name: 'my_resource', data: myResourceMetaFcn(i18n.t), type: 'table', permissions: ['my_resource.crud.read'], icon: 'mdi-table-cog' }
    ]
  }
]
```

---

## 3. Creating User-Space Pages

Create the route page file where the datatable list view is displayed to authenticated users.

* **File:** `app/pages/my_resources.vue`
* **Action:** Import the user schema and pass it to the reusable `<Table>` component.

```vue
<template>
  <v-container class="d-flex flex-column align-center ga-5">
    <Table :meta="myResourceMeta" class="mb-6" />
  </v-container>
</template>

<script setup lang="ts">
import myResourceMetaFcn from '~/schemas/my_resource'

const t = useI18n().t;
const myResourceMeta = myResourceMetaFcn(t);
</script>
```

---

## 4. Header & Navigation Integration

Configure the main header navigation menu to include the new page link.

* **File:** `app/metadata/header.json`
* **Action:** Append the new page under `pages` or under a specific parent's `children` array with a descriptive icon.

```json
{
  "name": "my_resource",
  "icon": "mdi-bulletin-board",
  "path": "/my_resources"
}
```

---

## 5. Locales & Translations

Ensure both translation locales (German & English) are populated.

* **Files:** `i18n/locales/en.json` and `i18n/locales/de.json`
* **Action:** Add localization entries for pages, validation rules, table headers, and server response messages.

```json
{
  "pages": {
    "my_resources": "My Resources"
  },
  "rules": {
    "my_resource": {
      "name": {
        "invalid": "Name must be a string",
        "min": "Name is too short"
      }
    }
  },
  "table": {
    "my_resource": {
      "title": "My Resources",
      "name": "Name",
      "description": "Description"
    }
  },
  "my_resource": {
    "read": {
      "success": "Resources loaded successfully"
    },
    "create": {
      "success": "Resource created successfully",
      "failed": "Failed to create resource"
    },
    "update": {
      "success": "Resource updated successfully",
      "failed": "Failed to update resource"
    },
    "delete": {
      "success": "Resource deleted successfully",
      "failed": "Failed to delete resource"
    },
    "bad_payload": "Invalid data format"
  }
}
```
