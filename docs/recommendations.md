# TwinBox UX & Information Architecture Audit & Strategic Recommendations

## 1. Executive Summary

**TwinBox** is an intelligent, automated email processing and AI synthesis platform. It connects to IMAP mail servers, polls configured folders, filters incoming messages using structured search criteria and LLM classification, generates structured markdown artifacts or summaries, and dispatches outputs via channels like Discord, Slack, WhatsApp, or Email.

While the underlying technical engine (`server/services/app/automation_tasks.ts`, `server/cron/get_due_imap_connections.ts`) is flexible and functional, the user interface currently operates as a thin, database-centric CRUD wrapper built over raw Drizzle schemas. 

The primary UX barrier is that **implementation details and database normalization are transferred directly onto the user**. To construct a single working automation pipeline, a user is currently forced to navigate between up to 6 separate screens (`/sources`, `/llm_filter`, `/llm_create_artifact`, `/preferences`, `/automations`) to manually create and link isolated records via dropdown foreign keys.

Furthermore, the application lacks operational **observability** (no run logs, execution metrics, or inline error reporting) and provides no **testing/iteration loop** (users cannot test LLM prompts or IMAP search trees against sample emails before deploying live).

This document outlines a blueprint for transforming TwinBox from a set of administrative data tables into a unified, high-confidence, workflow-driven product.

---

## 2. Current Product Mental Model

### 2.1 The Underlying System Model vs. Database Schema
Architecturally, TwinBox processes emails through a linear pipeline:

$$\text{Email Source (IMAP/Folder)} \longrightarrow \text{Search Filter (Criteria)} \longrightarrow \text{AI Classifier (LLM Filter)} \longrightarrow \text{Task Execution (Artifact / Action / Notification)}$$

However, the database model (`server/db/schema.ts`) decomposes this single continuous pipeline into 5 decoupled relational tables:
1. `connections_imap`: Server host, port, credentials, folder list.
2. `imap_searches`: Rule trees serialized as JSON (`imap_search_builder`).
3. `llm_filters`: Prompt classification strings (`llm_filter`).
4. `llm_create_artifacts`: Prompt synthesis/extraction templates (`llm_create_artifact`).
5. `notification_channels`: External webhook endpoints and OAuth/QR tokens.
6. `automations`: Junction table holding foreign keys (`imap_connection_id`, `search_id`, `llm_filter_id`) and a JSON task array.

### 2.2 How the User Experiences the Current Model
The current frontend (`app/pages/`) exposes these 5 normalized tables across separate sub-pages under two navigation headers (`Flows` and `Repositories`):

```
Nav: Flows
├── /sources            --> Table 1: Connections IMAP  &  Table 2: IMAP Searches
├── /llm_filter         --> Table 3: LLM Filters
├── /llm_create_artifact--> Table 4: LLM Create Artifacts
└── /automations        --> Table 5: Automations (Junction table with Task Chooser)

Nav: Repositories
└── /repositories       --> Table 6: Processed Emails list + Email Viewer modal

User Menu (Preferences)
└── /preferences        --> Account Settings  &  Table 7: Notification Channels
```

**The Core Disconnect**: The user mental model is *"I want to automatically process incoming support emails, summarize them with an LLM, and post the summary to Slack."* The current UI mental model is *"I must manage 5 independent relational database tables across 4 menu items, copy-paste prompt texts into isolated table forms, and bind foreign key IDs in a 6th dynamic table modal."*

---

## 3. Biggest UX Problems

### Problem 1: Fragmented Pipeline Configuration (The "6-Screen Setup Cycle")
To set up one email automation, a user must perform the following setup chain:
1. Go to `/sources` $\rightarrow$ Add IMAP Connection $\rightarrow$ Save.
2. Go to `/sources` $\rightarrow$ Add IMAP Search Rule $\rightarrow$ Save.
3. Go to `/llm_filter` $\rightarrow$ Add LLM Filter Prompt $\rightarrow$ Save.
4. Go to `/llm_create_artifact` $\rightarrow$ Add LLM Artifact Prompt $\rightarrow$ Save.
5. Go to User Menu $\rightarrow$ `/preferences` $\rightarrow$ Add Notification Channel (e.g. WhatsApp QR scan) $\rightarrow$ Save.
6. Go to `/automations` $\rightarrow$ Add Automation $\rightarrow$ Select Connection ID from dropdown $\rightarrow$ Wait for folder enum fetch $\rightarrow$ Select Folder $\rightarrow$ Select Search ID $\rightarrow$ Select Filter ID $\rightarrow$ Build Tasks array selecting Artifact ID & Channel ID $\rightarrow$ Save.

If an LLM filter prompt needs a minor adjustment, the user must navigate away from `/automations`, open `/llm_filter`, edit the prompt, save, and return to `/automations`.

### Problem 2: Zero Execution Observability & Silent Failures
Once an automation is created, it runs asynchronously via `server/cron/get_due_imap_connections.ts` (default: every 3600 seconds).
* **No Last Run Status**: The Automations table displays `last_poll` timestamp, but gives zero indication of whether the last run succeeded, failed, or processed 0 emails.
* **No Run Logs**: If an IMAP connection drops, an LLM service (e.g. Ollama/vLLM) times out, or a Slack webhook fails, error messages are swallowed server-side and logged to `stdout`. The user receives no UI notification, error badge, or execution log.
* **No Item Provenance**: In `/repositories`, downloaded emails are shown in a flat table, but there is no visual indicator showing which automation processed which email, what LLM filter decision was made, or what artifact was generated.

### Problem 3: Blind Prompt & Rule Development (No Sandbox/Test Loop)
When creating an `LLM Filter` or `LLM Artifact`, the user types a prompt into a plain text field inside a table popup dialog. 
* There is no mechanism to test the prompt against existing emails in `/repositories` or custom sample text.
* There is no preview of the LLM output, JSON structure, or token usage.
* Testing requires saving all entities, waiting for a cron poll or manual trigger, and inspecting external output channels.

### Problem 4: Over-reliance on Generic Table Dialogs for Complex Builders
Complex visual editors—specifically the **IMAP Search Rule Tree** (`app/components/imap_search/imap_search.vue`) and the **Automation Task Chooser** (`app/components/automation_task_chooser.vue`)—are constrained inside generic Vuetify dialog popups launched from `Table.vue`. 
* Modal dialogs restrict screen real estate, making deep tree structures or multi-step task chains cramped and difficult to inspect.
* Dialog cancellation discards all nested form state without confirmation.

---

## 4. Evaluation Against Product Rubrics

### 1. Mental Model
* **Current State**: Exposes database schema normalization directly. Entities are named after technical abstractions (`connections_imap`, `llm_filter`, `llm_create_artifact`).
* **Evaluation**: Fails to reflect the user's workflow model. Users think in terms of *Triggers, Conditions, Actions, and Delivery Outputs*, not relational database IDs.

### 2. Information Architecture
* **Current State**: Navigation splits pipeline components across `/sources`, `/llm_filter`, `/llm_create_artifact`, `/automations`, `/repositories`, and `/preferences`.
* **Evaluation**: Artificial page boundaries. Re-usable components (like prompts or filters) can exist, but the primary workspace should be a unified **Automations Builder** that supports inline component creation and contextual embedding.

### 3. Workflow vs. CRUD
* **Current State**: Entire UI is generated via `Table.vue` instances wrapped with Zod schemas (`app/schemas/`).
* **Evaluation**: Table CRUD is effective for flat lookup data (e.g., listing raw connection credentials or email logs), but completely inadequate for configuring, visualizing, and debugging active automated workflows.

### 4. Friction
* **Current State**: Extreme context-switching, modal dialogs inside modals, repetitive dropdown selections, and rigid saving cycles.
* **Evaluation**: High setup friction. Editing a single automation step requires navigating to a separate route if the component prompt is shared or saved independently.

### 5. Progressive Disclosure
* **Current State**: Raw technical parameters (e.g., `poll_seconds`, `use_ssl`, `auth_type`, `oauth_token_expiry`, `search` JSON) are presented with equal visual weight alongside fundamental fields like Name and Server.
* **Evaluation**: Transfers implementation complexity directly to the user. Standard options (e.g., standard IMAP ports, SSL defaults, default polling intervals) should be automatically inferred and expandable under an "Advanced Settings" fold.

### 6. Observability
* **Current State**: Displays basic timestamps (`createdAt`, `last_poll`). No execution status, run history, error counters, or logs.
* **Evaluation**: Operational black box. Users cannot answer *"Is my email pipeline currently working?"* or *"Why didn't my digest send this morning?"*

### 7. Testing and Iteration
* **Current State**: Zero testing capability in the UI.
* **Evaluation**: Shortening the change $\rightarrow$ test $\rightarrow$ inspect $\rightarrow$ adjust loop is non-existent. Users must test in production against live email boxes.

### 8. Error and Failure UX
* **Current State**: Form validation errors show basic Zod text messages. Server-side execution errors are completely invisible in the frontend.
* **Evaluation**: Critical deficit. Failures are neither contextual nor actionable.

### 9. Safety and Confidence
* **Current State**: Editing an automation task or search rule takes immediate live effect upon form submit. No dry-run option, versioning, or impact assessment.
* **Evaluation**: High risk of unintended actions (e.g., accidentally sending 500 test emails to a production Slack channel due to a misconfigured filter).

### 10. Defaults and Complexity
* **Current State**: Form fields require explicit manual input for technical values (e.g., IMAP SSL ports, poll timers).
* **Evaluation**: Sensible defaults (e.g. port 993 for SSL IMAP, default 1-hour polling, automatic folder discovery) should eliminate 70% of initial form inputs.

### 11. Consistency
* **Current State**: Inconsistent component registration patterns. Custom form components (`imap_search_builder`, `automation_task_chooser`) rely on dynamic formulation registry watchers (`watchEffect` / `watch`) inside table components.
* **Evaluation**: Fragile UI binding that occasionally results in un-rendered form fields during route transitions or cold reloads.

### 12. Visual Hierarchy
* **Current State**: Dense tabular lists dominated by raw IDs, technical strings, and uniform button rows.
* **Evaluation**: Looks like a generic Vuetify database browser. Lacks visual anchors, pipeline flow diagrams, status badges, and structural typography.

### 13. Scalability
* **Current State**: Dropdown selectors load all database items into flat memory arrays (`apiGet('/api/v0.1/app/connections_imap')`).
* **Evaluation**: Will degrade rapidly when users have dozens of connections, hundreds of filters, or thousands of processed emails.

### 14. Product Coherence
* **Current State**: Disjointed collection of administrative resource tools.
* **Evaluation**: Lacks a primary conceptual anchor. The application should feel like an **Automated Email Intelligence Studio**.

---

## 5. Architectural & UX Recommendations

### 5.1 Information Architecture & Navigation Restructuring

Consolidate the top-level navigation into 3 core functional domains:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ TwinBox Header Navigation                                                  │
├──────────────┬───────────────────────────────┬──────────────────────────────┤
│ ⚡ Automations│ 📁 Repositories               │ ⚙️ Settings                   │
│ (Main Studio)│ (Processed Data & Email Log)  │ (Sources, Channels, Account) │
└──────────────┴───────────────────────────────┴──────────────────────────────┘
```

#### Proposed Route Map:
1. **`/automations` (Primary Workspace)**
   - **List View**: Active pipelines with real-time status indicators (Active, Idle, Error), last run timestamp, processed message count, and quick toggle switches.
   - **Detail / Studio View (`/automations/[id]`)**: Full-screen node-based or step-by-step visual canvas/wizard to build and edit the entire pipeline in one place.
2. **`/repositories` (Data & Results Explorer)**
   - **Emails Tab**: Downloaded message repository with search, filter, and email preview drawer.
   - **Artifacts Tab**: Generated summaries, digests, and extracted markdown files with download/view options.
   - **Run History Tab**: Global execution log showing all pipeline runs, trigger times, processed items, and errors.
3. **`/settings` (Infrastructure & Preferences)**
   - **Sources Tab**: IMAP Connections & Folder management.
   - **Notification Channels Tab**: Webhook & Messaging integration management (Discord, Slack, WhatsApp, Email).
   - **AI Models Tab**: LLM endpoint configuration (Ollama, OpenAI, vLLM parameters).
   - **Account Tab**: User profile & security.

---

### 5.2 Core Workflow Recommendations: The "Unified Automation Studio"

Instead of creating separate database records across 5 screens, introduce a **Unified Canvas / Step Editor** for Automations (`/automations/[id]` or full-screen modal):

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ Automation Studio: "Daily Support Email Digest"            [ Test Run ] [ Save ]│
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│ 1. TRIGGER / SOURCE                                                         │
│    ┌──────────────────────────────────────────────────────────────────────┐ │
│    │ IMAP Account: Support Mail (mail.pi3g.com)  [Edit Connection]        │ │
│    │ Folder: INBOX                                                        │ │
│    │ Poll Schedule: Every 1 Hour                                          │ │
│    └──────────────────────────────────────────────────────────────────────┘ │
│                                   │                                         │
│                                   ▼                                         │
│ 2. MATCHING & FILTERING                                                     │
│    ┌──────────────────────────────────────────────────────────────────────┐ │
│    │ IMAP Criteria: [Subject contains "Support"] AND [Unseen]  [Edit Criteria]│
│    │ AI Classifier: "Identify urgent customer bug reports"  [Test Classifier]│
│    └──────────────────────────────────────────────────────────────────────┘ │
│                                   │                                         │
│                                   ▼                                         │
│ 3. AI SYNTHESIS & TASKS                                                     │
│    ┌──────────────────────────────────────────────────────────────────────┐ │
│    │ Action 1: Create Artifact (Markdown Summary)        [Test Prompt]    │ │
│    │ Action 2: Send Message -> Slack #support-alerts                      │ │
│    │ Action 3: Mark Email as Read                                         │ │
│    └──────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### Key Capabilities of the Unified Studio:
* **Inline Component Creation**: Users can select an existing prompt/filter library item OR choose *"Create New Prompt"* directly within Step 2/3 without leaving the page.
* **Inline Preset Libraries**: Frequently used prompts (e.g. *"Summarize email into bullet points"*, *"Detect spam/newsletter"*) are available as 1-click templates.

---

### 5.3 Observability & Operational Health

To make TwinBox transparent and reliable:

1. **Automation Health Badges**:
   - **Green (Active)**: Last poll completed successfully.
   - **Yellow (Degraded)**: Connection succeeded, but 0 items matched or partial task failure.
   - **Red (Error)**: Connection failed, auth expired, or LLM endpoint unreachable.
2. **Execution History Drawer / Tab**:
   - Every automation details page should include a **Run Log** table (`server/db/schema.ts` $\rightarrow$ add `automation_runs` table):
     - `timestamp`, `duration_ms`, `emails_fetched`, `matched_count`, `tasks_executed`, `status` (`SUCCESS` | `FAILED`), `error_log`.
3. **Traceability in Email Explorer**:
   - Clicking an email in `/repositories` shows a **Processing Audit Trail** in the detail view:
     - *"Matched Search Criteria 'Support Query' at 10:15:02"*
     - *"Passed LLM Filter 'Urgent Bug' (Confidence: 0.94) at 10:15:05"*
     - *"Generated Artifact 'Digest #102' and sent to WhatsApp at 10:15:08"*

---

### 5.4 Testing, Sandbox & Simulation Loop

Introduce an **Interactive Playground** inside the Automation Studio:

1. **"Test Run on Sample Email" Button**:
   - Located at the top of the Automation Studio.
   - Allows picking an existing email from `/repositories` or pasting sample email text.
2. **Step-by-Step Simulation Execution**:
   - **Step 1 (Search Match)**: Evaluates IMAP rules against sample headers $\rightarrow$ Displays `MATCH` or `NO MATCH`.
   - **Step 2 (LLM Classifier)**: Sends sample text to configured LLM $\rightarrow$ Displays raw LLM response & pass/fail boolean.
   - **Step 3 (Artifact Generation)**: Runs LLM prompt synthesis $\rightarrow$ Displays live rendered markdown preview of the resulting artifact.
   - **Step 4 (Delivery Guard)**: Runs in *Dry Run Mode* (logs output without actually sending WhatsApp/Slack message).

---

### 5.5 Visual Design & Design System Refinements

Transform the visual UI from a generic Vuetify admin table layout into a sleek, dark-mode-first developer tool:

1. **Card & Spatial Layout**:
   - Replace full-width data tables on high-level pages with structural **pipeline status cards**.
   - Use subtle visual connectors (lines/arrows) between pipeline steps to convey flow direction.
2. **Typography & Density**:
   - Use high-legibility sans-serif fonts (e.g., `Inter` or system sans) paired with a clean monospace font (`Fira Code` / `JetBrains Mono`) for JSON preview, code prompts, and IMAP rules.
   - Standardize table padding and text truncation (e.g., text overflow ellipses with hover tooltips for long prompts and message subjects).
3. **Status & Color Palette**:
   - Standardize status colors:
     - `Success`: Emerald / Green (`#10B981`)
     - `Warning / Pending`: Amber (`#F59E0B`)
     - `Error`: Rose / Red (`#EF4444`)
     - `Info / Neutral`: Slate / Zinc (`#64748B`)
   - Avoid solid loud colors; use dark translucent chips with subtle borders (`glassmorphism` style).

---

## 6. Quick Wins vs. Medium vs. Major Structural Changes

### Quick Wins (Low Effort / High Immediate Value)
1. **Add Status Badges & Last Run Timestamps**: Enhance `/automations` table to show relative last poll time (e.g., "5 mins ago") and status chips.
2. **Preset Prompts Library**: Add 3-5 pre-populated template strings for `LLM Filters` and `LLM Artifacts` (e.g. "Spam Detector", "Executive Summary Generator").
3. **Default Technical Form Fields**: Auto-populate port `993` and check `SSL` when creating IMAP connections; set default polling to `3600s`.
4. **Email Viewer Linkage**: Add a direct link from `/repositories` email list items to open the relevant automation detail view.

### Medium-Sized Structural Improvements
1. **Inline Filter & Artifact Creation**: Update `app/schemas/automation.ts` and `automation_task_chooser.vue` to allow creating/editing prompts directly inside a drawer without switching pages.
2. **Execution Run Logging System**: Create an `automation_runs` table in SQLite schema to log run events, errors, and processed email counts, exposed via a new "Run History" tab.
3. **Live LLM Prompt Preview**: Add a simple prompt testing drawer inside `llm_filter` and `llm_create_artifact` editors where users can input test text and run an instant test generation.

### Major Product/UX Architectural Changes
1. **Unified Automation Studio (`/automations/[id]`)**: Replace multi-page form configuration with a single-page visual step builder.
2. **Full Pipeline Dry-Run / Test Sandbox**: End-to-end simulation runner using real or synthetic emails.
3. **Unified Settings Hub (`/settings`)**: Merge `/sources`, notification channels, and global user preferences into a clean settings sub-system.

---

## 7. Prioritized Top 10 Changes

| # | Proposed Improvement | User Impact | Implementation Effort | Priority Rationale |
|---|---|---|---|---|
| **1** | **Consolidate Navigation & Navigation Labels** | High | Low | Re-aligns top-level navigation (`Automations`, `Repositories`, `Settings`) to eliminate navigation clutter and confusion. |
| **2** | **Add Execution Logging & Health Status** | Critical | Medium | Solves the primary observability void by displaying live execution success/failure status and run logs. |
| **3** | **Inline Prompt & Filter Editing in Automations** | High | Medium | Eliminates the 6-screen context-switching setup loop by letting users edit prompts inside the automation workflow. |
| **4** | **Prompt Test Sandbox / Playground** | High | Medium | Gives users confidence in LLM prompt quality before deploying automations against live email inboxes. |
| **5** | **Sensible Defaults for Connection & Automations** | Medium | Low | Reduces form entry friction by 50% for initial setup (ports, SSL defaults, polling intervals). |
| **6** | **Full-Screen / Side-Drawer Automation Editor** | High | Medium-High | Frees visual editors (IMAP tree builder & Task chooser) from constrained modal popups. |
| **7** | **Traceability: Link Emails to Automations & Artifacts** | Medium | Medium | Connects processed emails in `/repositories` to the exact automation run and generated outputs that produced them. |
| **8** | **Pre-Built Automation & Prompt Template Gallery** | Medium | Low | Provides immediate time-to-value for new users with 1-click starter templates. |
| **9** | **Refactor Formulate / Component Registration Logic** | Medium | Medium | Eliminates dynamic watcher race conditions in custom form components for bulletproof rendering. |
| **10** | **Dry-Run / Pipeline Simulation Mode** | High | High | Allows safe, end-to-end testing of complex workflows without mutating live IMAP state or spamming channels. |

---

## 8. Prioritized Implementation Roadmap

```
Phase 1: Foundation & Observability (Quick Wins & Health)
├── 1. Consolidate Navigation & Routes (/automations, /repositories, /settings)
├── 2. Implement execution run logging (schema + backend runner hooks)
├── 3. Add health status badges and execution history drawer to Automations
└── 4. Set sensible form defaults (IMAP port 993, SSL true, poll interval defaults)

Phase 2: Workflow Refinement & Friction Reduction
├── 5. Refactor visual editors (IMAP Search & Task Chooser) into side drawers / dedicated pages
├── 6. Support inline creation of LLM Filters and Artifacts within Automation setup
├── 7. Add LLM Prompt Testing Sandbox in Filter/Artifact editors
└── 8. Add starter template library for common email workflows

Phase 3: Deep System Integration & Intelligence
├── 9. Build full pipeline Dry-Run / Simulation Engine
└── 10. Implement end-to-end audit traceability (Email -> Automation -> Artifact -> Channel log)
```
