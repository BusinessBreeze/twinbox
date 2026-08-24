# Guide: Adding an Arbitrary Table Schema & CRUD Infrastructure

This guide details the steps to add a new database resource (referred to as `my_resource` / `myResources`) to the application and register its complete CRUD API infrastructure.

---

## 1. Database Schema Definition
Define the SQLite table structure using Drizzle ORM.

* **File:** `server/db/schema.ts`
* **Action:** Export a new `sqliteTable` definition. Ensure consistent timestamp tracking (`createdAt`, `updatedAt`).

```typescript
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const myResources = sqliteTable('my_resource', {
    id: text('id').primaryKey(),
    owner_id: text('owner_id').notNull(), // Links resource to a specific user
    name: text('name').notNull(),
    config: text('config', { mode: 'json' }).$type<{ some_setting?: string }>(),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
});
```

---

## 2. Validation Rules & Zod Schema
Define frontend/backend shared validation schemas.

* **File:** `shared/rules/app/my_resource.ts`
* **Action:** Export Zod schemas representing validation rules.

```typescript
import { z } from 'zod';

export const zod_rules = {
  name: z.string({
    errorMap: () => ({ message: "rules.my_resource.name.invalid" })
  }).min(1, "rules.my_resource.name.min").max(100, "rules.my_resource.name.max"),

  config: z.object({
    some_setting: z.string().optional()
  }).optional().default({})
};
```

---

## 3. Database Validator Mapping
Map the Drizzle table schemas to Zod validators so the ORM wrapper knows how to handle inserts/updates.

* **File:** `server/db/validator/validator_app.ts`
* **Action:** Import the table and export the validator block under the resource key. Omit timestamps (`createdAt`, `updatedAt`) to prevent string-to-date type mismatches during form submission.

```typescript
import { createInsertSchema, createSelectSchema, createUpdateSchema } from 'drizzle-zod';

const sv_my_resource = {
    insert: createInsertSchema(myResources).omit({ createdAt: true, updatedAt: true }),
    select: createSelectSchema(myResources),
    update: createUpdateSchema(myResources).omit({ createdAt: true, updatedAt: true }),
    prep: { json: ['config'] }
}

// In the default export object, map the resource key:
export default {
    // ...
    my_resource: sv_my_resource
};
```

---

## 4. Backend Service Layer
Create a service class that inherits from `genericService` to provide standard CRUD.

* **File:** `server/services/app/my_resource.ts`
* **Action:** Override CRUD methods if normalization is required (e.g., initializing nullable JSON fields as empty objects `{}` to avoid reactivity errors).

```typescript
import { db } from "hub:db";
import { myResources } from "#server/db/schema";
import { zod_rules } from "#shared/rules/app/my_resource";
import { genericService } from "#layers/nuxt-base-app/server/services/generic";

class MyResourceService extends genericService {
    private normalize(res: any) {
        if (!res) return res;
        const norm = (item: any) => {
            if (item && !item.config) {
                item.config = {};
            }
            return item;
        };
        if (Array.isArray(res)) {
            return res.map(norm);
        }
        return norm(res);
    }

    async read(id?: string) {
        return this.normalize(await super.read(id));
    }

    async create(body: any, hooks?: any) {
        return this.normalize(await super.create(body, hooks));
    }

    async update(id: string, body: any, hooks?: any) {
        return this.normalize(await super.update(id, body, hooks));
    }
}

export const getService = async (event: any) => {
    const session = await getUserSession(event);
    return new MyResourceService(db, myResources, zod_rules, session.user?.id || '');
}

export const getAdminService = () => {
    return new MyResourceService(db, myResources, zod_rules);
}
```

---

## 5. Security & Permissions
Register administrative permissions.

### A. Define Permission Structure
* **File:** `server/metadata/permissions_app.json`
* **Action:** Append the resource CRUD nodes.

```json
  {
    "name": "my_resource",
    "children": [
      {
        "name": "crud",
        "children": [
          { "name": "create" },
          { "name": "read" },
          { "name": "update" },
          { "name": "delete" }
        ]
      }
    ]
  }
```

### B. Assign Default Role Permissions
* **File:** `server/metadata/app_defaults.json`
* **Action:** Add wildcard permission under roles (e.g., `admin`).

```json
  "admin": [
    // ...
    "my_resource:*"
  ]
```

---

## 6. API Routing (CRUD Endpoints)

### A. User Space (`server/api/v0.1/app/my_resource/`)
Access is implicitly gated by the authenticated user's ID resolved by `getService(event)`.
Create the following files:

* `index.get.ts`: Get list of user's resources.
* `index.post.ts`: Create a new resource.
* `[id].get.ts`: Fetch a single resource by ID.
* `[id].patch.ts`: Update a resource.
* `[id].delete.ts`: Delete a resource.

### B. Administrative Space (`server/api/admin/app/my_resource/`)
Endpoints must check administrative permissions using `checkRoutePermissions(event, ['my_resource.crud.[action]'])`.
Create identical files in this directory mapping to `getAdminService()`. Example for `index.get.ts`:

```typescript
import { getAdminService } from '#server/services/app/my_resource';

export default defineEventHandler(async (event) => {
  await checkRoutePermissions(event, ['my_resource.crud.read']);
  const service = getAdminService();
  return {
    data: await service.read(),
    statusMessage: 'success my_resource.read.success',
  };
});
```

---

## 7. Essential Database & Nuxt Commands

After defining or modifying database schemas, you must apply them to your database using the following commands:

### Step 1: Generate SQL Migration Files
Compiles changes from `schema.ts` into SQL migration scripts.
```bash
npx nuxt db generate
```

### Step 2: Apply Migrations
Applies the generated SQL scripts to the local SQLite database.
```bash
npx nuxt db migrate
```

### Step 3: Regenerate Nuxt Types (Best Practice)
Ensures Nuxt/Nitro is aware of all new API endpoints, layouts, and components with up-to-date IDE type definitions.
```bash
npx nuxi prepare
```
