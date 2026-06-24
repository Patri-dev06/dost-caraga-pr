# DOST Caraga - Procurement System

A formal, government-style internal web app with sidebar navigation, light-blue/white theme, and dedicated routes for every module. This is a UI/design build — pages will be wired with realistic mock data so the entire flow is clickable and demoable. Authentication, database, and approval logic can be layered on later.

## Design system

- **Palette** (mapped to Tailwind tokens in `src/styles.css`):
  - Primary `#0072BC`, Primary-foreground `#FFFFFF`
  - Background `#F8FCFF`, Card `#FFFFFF`
  - Foreground / Dark navy text `#003B66`, strong text `#000000`
  - Border (soft blue) `#9AD8FF`, Muted surface `#DDF3FF`
- **Typography**: Inter (sans-serif). Bold headings, regular body, `uppercase tracking-wider text-xs` for section labels and badges.
- **Surfaces**: white cards, 1px `#9AD8FF` borders, `rounded-2xl`, subtle shadow, generous padding.
- **Hero blocks**: soft light-blue gradient (`#DDF3FF` → `#F8FCFF`).
- **Badges**: rounded-full pill badges in blue / navy / neutral — no reds/greens beyond a single subtle accent for Failed/Returned states.
- No dark mode, no flashy gradients, no playful icons. Lucide icons only, thin stroke.

## Layout shell

- Persistent **sidebar** (collapsible to icon rail) with DOST identity area at top (logo placeholder + "DOST Caraga" / "Procurement System").
- **Top bar**: sidebar trigger, breadcrumb / page title, search, notifications bell, user profile dropdown.
- Main content area on `#F8FCFF`.
- Login page renders outside the shell.

## Navigation (sidebar groups)

- **Overview**: Dashboard
- **Procurement**: Purchase Requests, Create Purchase Request, Validation, Approval Inbox
- **References**: PPMP, APP-CSE, APP-Non-CSE, Budget Allocations
- **Administration**: Reports, User Management, Audit Logs, Settings

## Routes

```text
src/routes/
  __root.tsx                       layout shell + providers
  login.tsx                        /login (outside shell)
  index.tsx                        / Dashboard
  purchase-requests.tsx            /purchase-requests   list + tracking
  purchase-requests.new.tsx        /purchase-requests/new   creation form
  purchase-requests.$prId.tsx      /purchase-requests/:prId   tracking detail + audit timeline
  validation.tsx                   /validation   item pre-validation
  approval-inbox.tsx               /approval-inbox
  references.ppmp.tsx              /references/ppmp
  references.app-cse.tsx           /references/app-cse
  references.app-non-cse.tsx       /references/app-non-cse
  references.budget.tsx            /references/budget
  reports.tsx                      /reports
  users.tsx                        /users   user & role management
  audit-logs.tsx                   /audit-logs
  settings.tsx                     /settings
```

Each route gets its own `head()` metadata (title + description).

## Page-by-page

### 1. Login (`/login`)
Centered white card on light-blue gradient. DOST seal placeholder, "DOST Caraga - Procurement System" title, "Procurement Management and Pre-Validation Platform" subtitle. Username + password fields, "Sign in" primary button, small footer note. No real auth yet — submit routes to `/`.

### 2. Dashboard (`/`)
- Hero band: system title, subtitle, current date/office.
- **6 summary cards**: Total PRs, Pending Validation, For Recommendation, For Approval, Approved, Returned. Each card: uppercase label, large number, small delta line, thin blue border.
- **Quick actions** row (4 buttons): Create Purchase Request, Validate Items, View Approval Inbox, Manage Procurement References.
- **Recent Purchase Requests** table: PR No., Office, Fund Source, Amount, Status badge, Date — clicking a row opens the tracking detail.

### 3. Purchase Request Creation (`/purchase-requests/new`)
Multi-section form, each section = white card with uppercase section label:
1. **Request Information** — PR No. (auto), date, requesting office, requested by, mode of procurement.
2. **Fund Source** — fund cluster, source of funds, account code, available balance display.
3. **Project Information** — project title, PAP code, location, beneficiary.
4. **Item Details** — table input rows: Item Name, Description, UoM, Qty, Unit Cost, Total Cost (auto). Add/remove row controls. Running grand total.
5. **Purpose** — textarea.
6. **Validation Results** — empty state until "Validate Items" is clicked; then per-item results panel (see below).
Footer actions: Save Draft, Validate Items, Submit for Recommendation (disabled if any Failed).

### 4. Item Pre-Validation (`/validation`)
Standalone validator. Pick a draft PR or paste/select items. Runs four checks per item with status indicators **Passed / Failed / Warning / Not Applicable**:
- PPMP — "Item is included in PPMP."
- Line-Item Budget / Budget Allocation — "Item is within approved budget."
- APP-CSE — match check
- APP-Non-CSE — match check
Results render as a per-item card with 4 check rows, icon + status pill + formal message. Summary banner at top: green-tinted "Ready to proceed" or neutral "Request cannot proceed until validation issues are resolved."

### 5. Procurement References
Four sibling pages, identical shell, different data:
- **PPMP** (`/references/ppmp`)
- **APP-CSE** (`/references/app-cse`)
- **APP-Non-CSE** (`/references/app-non-cse`)
- **Budget Allocations** (`/references/budget`)
Each: header with year selector + "Import" / "Add Entry" buttons, searchable/filterable table, row actions (view, edit, archive). Modal dialog for add/edit.

### 6. Approval Inbox (`/approval-inbox`)
Filter bar: status, fund type, office, date range, search.
Table columns: PR No., Requesting Office, Fund Type, Total Amount, Date Submitted, Current Stage, Status badge, Actions.
Row actions open a **Review modal** showing PR summary, item list, validation snapshot, and approval buttons: **Review, Recommend, Approve, Return, Reject** (Return/Reject require a remarks textarea).

### 7. Purchase Request Tracking
- List view at `/purchase-requests` — same table style, filters by status/office/fund, export button.
- Detail view at `/purchase-requests/:prId` — header with PR No. + status pill, tabs: **Overview / Items / Validation / Approval Trail / Attachments**. Approval Trail uses a vertical **audit timeline** (avatar dot, actor, action, timestamp, remarks).

### 8. User & Role Management (`/users`)
Two-tab layout: **Users** and **Roles**.
- Users tab: table with name, email, office, role(s), status, last login, actions (edit, deactivate, reset password). "Invite User" button opens modal.
- Roles tab: list of roles (Requester, Validator, Recommender, Approver, Admin) with permission matrix card per role.

### 9. Audit Logs (`/audit-logs`)
Filter bar (actor, module, action, date range). Table: Timestamp, Actor, Role, Module, Action, Target (PR No. / record), IP. Row click opens a side drawer with full JSON-like detail.

### Supporting pages
- **Reports** (`/reports`) — grid of report cards (PRs by status, by office, by fund source, by month) each with mini chart placeholder + "Generate" button.
- **Settings** (`/settings`) — basic profile, notifications, system preferences (kept simple).

## Components to add (under `src/components/`)

- `app-sidebar.tsx` — grouped sidebar with active-route highlighting
- `app-topbar.tsx` — breadcrumbs, search, notifications, user menu
- `page-header.tsx` — title + subtitle + actions slot
- `stat-card.tsx` — dashboard summary card
- `status-badge.tsx` — typed pill (Draft, Pending Validation, For Recommendation, For Approval, Approved, Returned, Rejected, Passed, Failed, Warning, N/A)
- `pr-table.tsx` — reusable PR list table
- `validation-result-panel.tsx` — per-item validation display
- `item-details-table.tsx` — editable line-item input
- `approval-review-dialog.tsx`
- `audit-timeline.tsx`
- `mock-data.ts` — shared seed data for PRs, items, users, references, audit entries

Existing shadcn primitives (button, card, table, dialog, badge, input, select, tabs, sidebar, etc.) are already in the project and will be reused.

## Out of scope for this pass

- Real authentication, RBAC enforcement, and database persistence
- Real PPMP/APP/Budget integrations
- File uploads / attachment storage
- Email notifications

These can be layered on later (Lovable Cloud + a `user_roles` table following the standard pattern) once the UI is approved.
