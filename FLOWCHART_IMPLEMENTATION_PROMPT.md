# Prompt: Make the procurement system follow the Procurement System Flowchart exactly

You are working in the DOST Caraga Procurement System repo (`/home/talinoserver2/Documents/dost-caraga-pr`).
Your job is to finish every flowchart step that is **partial** or **not built yet**, and to change the
**routing** (the order of steps, who acts at each step, and where each Yes/No branch leads) so it
matches the Procurement System Flowchart exactly. Section 2 describes the flowchart in text. If the
flowchart image is attached, the image wins wherever the two disagree.

Most of the flow already works. Read the existing code before changing it, and extend it rather than
rewriting it.

---

## 0. Before you start (read this first)

- **This working tree is the live app.** systemd serves `pr_backend` with `php artisan serve` and
  `pr_frontend` with the Vite dev server, straight from this directory, at `pr.dostcaraga.ph`. Any
  edit here goes live immediately. **Do the work on a new branch in a separate git worktree**
  (e.g. `git worktree add ../dost-caraga-pr-flowchart -b feature/flowchart-routing`). Give the
  worktree its own `vendor/` and `node_modules/` (`composer install`, `npm install`) and its own
  `.env`. Leave `main` in this directory alone.
- **Do not run migrations or seeders against the real database** (the `DB_*` values in
  `pr_backend/.env`). Tests use the separate Postgres database `dost_caraga_pr_test`, configured in
  `phpunit.xml`. If you need a dev database, create a new one and say so.
- Do not install systemd units, change cron, or edit `/etc`. Write any unit files into the repo and
  list the install commands in your final report.
- Commit at the end of each phase on the feature branch. Do not push and do not merge into `main`.

## 1. Stack and conventions (match them)

- **Backend:** Laravel 13 / PHP 8.3 / PostgreSQL. API routes are in `pr_backend/routes/api.php`
  (`/api/v1`, `auth.token` middleware). Controllers are in `pr_backend/app/Http/Controllers/Api/`:
  `ProcurementController` (PR, validation, approvals, planning, references), `RfqController`,
  `AbstractOfCanvasController`, `PurchaseOrderController`. Shared helpers are in
  `app/Http/Controllers/Concerns/HasProcurementHelpers.php`. Use them instead of writing new ones:
  - `guardModule()` for module access checks.
  - `requireSignature()` wherever the flowchart says "Digital Sign" or "E-Sign".
  - `recordAction()` for the polymorphic approval trail.
  - `audit()` for the audit log.
  - `notify()`, which creates an in-app notification and sends a best-effort email.
  - `designated*()`. Each signatory (Budget Officer, RD, BAC Chair/Vice-Chair, Supply Officer,
    Accounting Officer, TWG Lead) is a user ID stored in system preferences and picked in Settings.
    Add new signatories the same way.
- **State machines** are string `status` and `stage` columns, changed with `forceFill()` and guarded
  with `abort_unless($x->status === ..., 422, '...')`. Only the designated user or a `superadmin` may
  act at each stage. Keep that pattern.
- **Lists are always paginated or capped.** Never add an unbounded `get()` of a whole table.
- **Frontend:** React 19, TanStack Router (file routes in `pr_frontend/src/routes/`, generated
  `routeTree.gen.ts`), TanStack Query, shadcn/ui. API calls go in `pr_frontend/src/lib/api.ts`.
  Module visibility is set in `src/lib/modules.ts`. The auth redirect is in `src/routes/__root.tsx`.
- **Existing tests** are in `pr_backend/tests/Feature/` (`ProcurementApiTest`, `RfqApiTest`,
  `AbstractOfCanvasTest`, `PurchaseOrderApiTest`, `MonitoringSheetTest`, …). Update the ones whose
  expectations change, and add tests for every new branch.
- **Fund types:** `fund_sources.fund_type` is `'GAA'` (regular fund) or `'Trust'` (non-regular). This
  is how "Regular fund?" gets decided.

## 2. The target flow (source of truth)

### Blue: Module 1, Approved PR
1. **START → Account login**, which sends an **email notification to the account owner**.
2. User starts a PR → **Input PR details**.
3. **Regular fund?** (the PR's fund source has fund_type `GAA`)
   - **Yes** → **Items in APP-CSE?**
     - Yes → Proceed to Create PR
     - No → **Items in APP-Non-CSE?** Yes → Proceed to Create PR. No → **Error: "Items is not in APP-Non-CSE & APP-CSE"** → END
   - **No** → **Identify Project** (a project is required) → **Items in PPMP?**
     - No → **Error: "Item not in PPMP"** → END
     - Yes → **Items within Budget (LIB)?** No → **Error: "Item not within budget (LIB)"** → END.
       Yes → **Items in APP-Non-CSE?** (this path does not check APP-CSE).
       Yes → Proceed to Create PR. No → **Error: "Items is not in APP-Non-CSE & APP-CSE"** → END
4. **Proceed to Create PR** → **Supervisor/Recommending Approval** signs digitally (email) →
   **RD** signs digitally (email) → **Approved PR** (email to the requester) → Green.

### Green: PR / Request for Quotation
1. **Generate RFQ** from the Approved PR.
2. → **Supply Officer** counter-signs digitally.
3. → **BAC Chair *or* BAC Vice-Chair** signs digitally. **One signature from either of them** completes this step.
4. → **Filter suppliers by category (Goods, Services)** from the supplier directory.
5. → **Choose 3 suppliers.**
6. → **Send the RFQ** with complete details and specifications to the 3 selected suppliers.
7. → **Supplier receives the RFQ in the Supplier Portal.**
8. **Did the supplier reply?**
   - **No, after 7 calendar days** → **Cancel the RFQ sent to that supplier** → **Choose n suppliers**
     (n = number of suppliers cancelled) → back to step 6 for them.
   - **Yes** → **Supplier sends back a signed quotation** → **Procurement category check**.
9. **Procurement category check:**
   - **Goods** → **Generate AOC** → BAC Review.
   - **Equipment** → **TWG specification evaluation** → **Check each equipment item with each
     supplier** → **Fail?**
     - **No** → **Generate AOC** (from the suppliers that passed) → BAC Review.
     - **Yes** → **Did all suppliers fail?**
       - **Yes** → **Choose n suppliers needed** → back to step 6 (re-canvass).
       - **No** → keep checking the remaining suppliers. Once every supplier has been checked, the
         ones that passed go on to Generate AOC.
   - **List of Venue** → **Generate AOC** → **Individual rating of each venue** (to find the winning
     supplier) → **Summary of rating** → BAC Review.

### Orange: BAC review
1. **BAC Review** (digital sign) → **Fail?**
   - **Yes** → **Committee adds remarks** → **Notify TWG, end-user and Supply** → **TWG addresses
     BAC remarks** → **BAC satisfied?**
     - **Yes** → back to **BAC Review** (a new signed pass/fail review).
     - **No** → **Cancel PR** → **Notify end-user to Re-PR** → END.
   - **No** → Yellow.

### Yellow: Purchase Order
1. **AOC returned to Supply to note the lowest bidder.**
2. → **Create PO** → **Budget** signs for obligation → **Accounting** signs → **RD** gives final
   approval (e-sign).
3. → **Generate PO with complete digital signatures.**
4. → **Forward the signed PO to the Supplier Portal**, which notifies the supplier and the end-user
   of the winning bidder.
5. → **Did the supplier waive delivery?**
   - **Yes** → **Cancel PR** → **Notify end-user to Re-PR** → END.
   - **No** → END (delivery goes ahead).

**Open question on the flowchart. Do not resolve it yourself:** *"Need to clarify to budgeting and
accounting if they can disapprove goods being procured."* Keep the existing PO `reject` endpoint
unchanged, and do not build any path after a rejection. List this in your final report as still open.

---

## 3. Work to do

For each item below: build the backend, the frontend UI, notifications, the audit and approval trail,
and tests. Items marked **[ROUTING]** change the order or branches of an existing flow.

### Phase 1: Email delivery, login email, PR routing (Blue)

**1.1 Real email delivery (partial → done)**
- `notify()` already calls `Mail::raw`, but `.env` has `MAIL_MAILER=log`, so nothing is actually sent.
  Make SMTP work through `.env` only (`MAIL_MAILER=smtp`, host, port, username, password,
  encryption, from address/name). Update `.env.example` with placeholders. **Never commit real
  credentials.**
- Send mail through the queue so a slow SMTP server can't hold up an approval. Use the `database`
  queue driver (add the jobs table migration if it's missing). Tests still run with
  `QUEUE_CONNECTION=sync` and `MAIL_MAILER=array`.
- Write `scripts/systemd/dost-caraga-pr-queue.service` (runs `php artisan queue:work`, same
  `User=`/`WorkingDirectory` style as the existing backend unit). Do not install it.
- The existing `email_notifications_enabled` preference must still turn all email off.

**1.2 Login email to the account owner (not built → done)**
- After a successful `POST /auth/login`, queue an email to the user: "New sign-in to your DOST Caraga
  Procurement account", with the date and time (Asia/Manila), IP address, and browser/user agent.
- Only send it on success. Don't send it for token refresh. Respect `email_notifications_enabled`.

**1.3 Regular-fund branching in PR validation [ROUTING] (partial → done)**
- Rewrite `checksFor()` / `runValidationChecks()` in `ProcurementController` so the checks follow
  the Blue lane exactly:
  - **Regular (GAA):** check APP-CSE, then APP-Non-CSE only if CSE failed. **No PPMP or LIB check.**
  - **Non-regular (anything else):** project required, then PPMP, then LIB budget, then **APP-Non-CSE
    only**.
- Make the fund types that count as "regular" a system preference (default `["GAA"]`), editable in
  Settings, so it isn't hard-coded.
- Use the flowchart's exact error messages (listed in Section 2).
- **A missing PPMP item must now be a `Failed` result that blocks submission, not a `Warning`**
  (today `ppmpCheck()` returns `Warning`).
- **Fix the budget check:** compare the **PR's total** for that project and budget line against the
  available balance, instead of checking each item on its own. At the moment, two items that each
  fit but together go over budget both pass.
- **Frontend (`purchase-requests.new.tsx`):** when a non-regular fund source is picked, show and
  require the **Identify Project** field. When a regular fund is picked, hide it or make it optional.
  The validation panel and the standalone Validation page should only show the checks that apply to
  that path.

**1.4 PR approval routing (check it, fix it if needed)**
- Submit → Supervisor/Recommending Approval (digital sign + email) → RD (digital sign + email) →
  Approved (email to the requester). This mostly exists already. Confirm that every step sends an
  email as well as an in-app notification, now that 1.1 is working.

### Phase 2: Supplier directory, RFQ signing order, 7-day timeout (Green)

**2.1 RFQ signing order [ROUTING] (fix)**
- The current order is BAC Chair → BAC Vice-Chair → Supply Officer (three signatures). Change it to
  match the flowchart:
  **Draft → Supply Officer counter-sign → BAC Chair *or* Vice-Chair (one signature) → Ready to Send.**
- Replace the endpoints with `POST /rfqs/{rfq}/sign/supply-officer` and `POST /rfqs/{rfq}/sign/bac`.
  The `bac` endpoint accepts whichever of the two designated BAC users is calling. Record which of
  them signed.
- Write a data migration for RFQs that are already partway through signing. **Keep any signatures
  already collected.** Document the old-status → new-status mapping in the migration's comment.
- Update notifications (Supply Officer first, then both BAC Chair and Vice-Chair), the
  `rfq.$rfqId.tsx` signing UI, and `RfqApiTest`.

**2.2 Supplier directory and category filter (not built → done)**
- The `suppliers` table already exists, with a `category` column, but nothing uses it. Add an `email`
  column (required for suppliers you want to reach through the portal).
- Add paginated CRUD at `/api/v1/suppliers`, available to the `rfq` module, plus a **Suppliers**
  page (list/search/add/edit/deactivate). Category values: **Goods** and **Services**.
- On the RFQ, **"Filter supplier based on category"**: the supplier picker lists only active
  directory suppliers whose category matches the RFQ. Goods and Equipment RFQs show Goods suppliers;
  Venue RFQs show Services suppliers. Suppliers already on this RFQ are excluded.
  Replace the current free-text supplier name field with this picker. Keep an inline "Add new
  supplier" option that creates the directory entry first.
- Keep the rule of exactly 3 suppliers before sending.

**2.3 7-day no-reply timeout (partial → done)**
- Add a scheduled Artisan command (e.g. `rfq:expire-unanswered`), registered in
  `routes/console.php` and run hourly. It finds `rfq_suppliers` with `status = 'Sent'` and
  `reply_due_at < now()` and:
  - marks them `TimedOut` ("Cancel sent RFQ of non-responding supplier");
  - revokes their portal link (see 2.4);
  - emails the supplier that the RFQ to them was cancelled;
  - notifies the Supply Officer and the canvasser to **choose n replacement suppliers** (n = how
    many timed out).
- Replace the one-at-a-time manual Replace button with a **"Choose n suppliers"** action. It uses the
  same category-filtered picker and sends to the replacements straight away, each with a fresh 7-day
  window. Keep a manual "Mark as timed out" action for staff, for when a supplier declines early.
- Write `scripts/systemd/dost-caraga-pr-scheduler.service` (runs `php artisan schedule:work`). Do
  not install it.

### Phase 3: Supplier Portal (not built → done)

**2.4 Supplier Portal: RFQ side**
- Suppliers get **no user account**. When an RFQ is sent, each `rfq_supplier` gets its own
  unguessable portal link. Store only a **hash** of the token, plus an expiry equal to
  `reply_due_at`. Email the link to the supplier. The link opens a public page at
  `/portal/rfq/{token}`, built from `APP_URL` (the live URL is `https://pr.dostcaraga.ph`).
- On the portal page the supplier:
  - sees the RFQ header, items, quantities, unit of measure and specifications, and the deadline;
  - enters a **unit price for each item**;
  - **uploads the signed quotation** (PDF, JPG or PNG, max 10 MB, stored on a private disk);
  - submits. Their `rfq_supplier` becomes `Replied`, the portal becomes read-only for them, and the
    Supply Officer and canvasser are notified.
- Public portal API routes go under `/api/v1/portal/...`, outside `auth.token`, and are
  rate-limited. Each token gives access to **only its own** RFQ and supplier row. It stops working
  once the supplier replies, times out, is replaced, or the RFQ is cancelled. Staff can re-send the
  link.
- **Staff fallback:** keep the current `recordQuote` endpoint for suppliers who hand-deliver a
  quotation, but it must now require an uploaded scan of the signed quotation too.
- Staff can view or download the uploaded quotation from the RFQ and AOC pages.
- Frontend: add `/portal/...` routes with no app sidebar or header. **Exclude `/portal` from the
  login redirect** in `__root.tsx` (the inline `authRedirectScript` and any route guards).

**2.5 Supplier Portal: PO side** (built here, used in Phase 5)
- `/portal/po/{token}` shows the fully signed PO (read-only, downloadable) and has two buttons:
  **Acknowledge & Deliver** and **Waive Delivery** (a reason is required).

### Phase 4: Equipment and Venue evaluation (Green)

**2.6 Equipment: TWG check of each item with each supplier (partial → done)**
- Once every supplier has replied or timed out, an **Equipment** RFQ moves to
  `TWG Evaluation` instead of allowing AOC generation straight away.
- **TWG specification evaluation:** the TWG Lead records overall evaluation notes (the existing
  `twg_evaluation_notes`).
- **Check each equipment item with each supplier:** for every replied supplier and every RFQ item,
  TWG records **Complies / Does not comply** plus remarks. Store this per quote item, in a new table
  or new columns on `rfq_quote_items`. A supplier **fails** if any item does not comply.
- Branches:
  - Every replied supplier checked and **at least one passed** → **Generate AOC** using **only the
    passing suppliers**. The winner is the lowest total among them.
  - **All suppliers failed** → mark them `Failed TWG`, notify Supply, and let Supply **choose n
    suppliers needed** (the picker from 2.2). The RFQ goes back to `Canvassing` with those suppliers.
    Repeat until someone passes.
- Only the designated TWG Lead or a superadmin may record checks. Show the check matrix
  (suppliers × items) on the RFQ and on the AOC page.

**2.7 Venue: rating each venue and a summary of ratings (not built → done)**
- Remove the `"Venue procurement is not yet supported."` guard in
  `AbstractOfCanvasController::generate`.
- Venue flow: **Generate AOC** (status `For Venue Rating`) → each **rater** gives each venue a
  **score per criterion** → the **Summary of rating** is worked out automatically (average per venue
  and per criterion, overall rank). The winner is the **highest overall score**, not the lowest
  price, with the lowest price as the tie-breaker. Save the summary on the AOC, then allow Submit
  for BAC Review.
- Default **criteria**, stored in system preferences and editable in Settings: Price, Location /
  Accessibility, Capacity, Facilities & Equipment, Food & Services. Scale 1–5, equal weights.
- Default **raters**: the TWG Lead, the end-user (PR requester) and the Supply Officer. The summary
  can be generated only after all raters have submitted.
  *(These are defaults. Say so in your report so the office can confirm them.)*
- Show the individual ratings and the summary table on the AOC page and in the BAC review view.

### Phase 5: BAC review routing, cancelling the PR, Supply noting, forwarding the PO (Orange/Yellow)

**3.1 BAC "satisfied?" step [ROUTING] (fix)**
- New AOC routing:
  `Pending BAC Review` → *fail with remarks* → `BAC Returned` (TWG, end-user and Supply notified,
  as now) → TWG responds → **`Pending BAC Satisfaction`** → BAC decides:
  - **Satisfied** → `Pending BAC Review` (another signed pass/fail review, per the flowchart loop).
  - **Not satisfied** → **Cancel PR** (3.2).
- **Cancelling is only allowed from the "Not satisfied" decision.** Remove the option to cancel
  directly from `BAC Returned`. Only the BAC Chair or Vice-Chair decide, and the decision needs a
  digital signature.

**3.2 Cancel PR and Re-PR (partial → done)**
- Add a PR status **`Cancelled`**, with the cancel reason and a link to what caused it (the AOC or
  the PO).
- When a PR is cancelled, cancel its open RFQ, AOC and PO too. Revoke any portal links. **Leave
  cancelled PRs out of budget/PPMP usage** (`purchaseRequestUsage` currently only excludes
  `Rejected` and `Returned`) so their amounts become available again. A cancelled PR can't start an
  RFQ.
- **Notify the end-user to Re-PR** (in-app and email) with a link that opens
  **`POST /purchase-requests/{id}/re-pr`**. That endpoint copies the cancelled PR into a new `Draft`
  owned by the same requester, keeping the items, fund source, project and purpose. The requester
  checks it and submits it normally.
- Both "Cancel PR" boxes on the flowchart (BAC not satisfied, and supplier waived delivery) use this
  one code path.

**3.3 AOC returned to Supply to note the lowest bidder [ROUTING] (fix)**
- When BAC passes the AOC it goes to **`For Supply Noting`**, not straight to `Approved`. The Supply
  Officer confirms the lowest bidder (the auto-picked winner, or the top-rated venue) with a digital
  signature, and it becomes **`Lowest Bidder Noted`**.
- **Create PO** (`generateFromRfq`) is only allowed from `Lowest Bidder Noted`.

**3.4 Generate the fully signed PO and forward it to the Supplier Portal [ROUTING] (not built → done)**
- When the RD gives final approval, the PO document (screen view and export) must show **all three
  signatures** (Budget, Accounting, RD) with names and dates.
- Then, automatically, **Forward signed PO to Supplier Portal**:
  - status becomes `Forwarded to Supplier`;
  - a PO portal link (2.5) is emailed to the winning supplier;
  - the **end-user is notified of the winning bidder and the PO** (in-app and email). Today nobody
    is notified after RD approval.

**3.5 Did the supplier waive delivery? (partial → done)**
- The answer comes from the supplier on the PO portal. Supply staff can also record it on the
  supplier's behalf (the existing `deliver` endpoint, now allowed from `Forwarded to Supplier`).
  - **Waived** → PO becomes `Delivery Waived` → **Cancel PR** through 3.2 → end-user told to Re-PR.
  - **Acknowledged / Accepted** → PO becomes `Delivery Accepted` → END.

### Phase 6: Update the rest of the app for the new statuses
- **Monitoring sheet** (`lib/monitoring-columns.ts`, `purchaseRequestMonitoring`, `MonitoringSheetTest`):
  handle the new statuses and dates (Cancelled, TWG Evaluation, venue rating, supply noting,
  forwarded to supplier, delivery accepted or waived).
- Dashboard "Needs Your Action" and the Approval Inbox: include the new actions (TWG checks, venue
  ratings, BAC satisfaction decision, supply noting, choosing replacement suppliers).
- Status badges, filters, and the Excel exports (`pr-excel`, `rfq-excel`, `po-excel`,
  `monitoring-excel`).
- Update `RFQ_PO_WORKFLOW_FLOWCHART.md`: correct the order of the RFQ signing steps and replace its
  out-of-date "How this compares to the current implementation" table with the final state.

---

## 4. Done means

- Every box and every Yes/No arrow in Section 2 maps to code. **Include a table in your final report
  that lists each flowchart step next to the endpoint, status value and screen that implements it.**
- Every branch has a feature test. That includes the error messages, the 7-day timeout, both TWG
  outcomes, venue ranking, BAC satisfied / not satisfied, Cancel PR with Re-PR, portal token scoping
  and expiry, and supplier waiver.
- These all pass on the feature branch:
  `npm run test:backend`, `npm run lint`, `npm run build`.
- Nothing ran against the live database, and nothing was installed on the server.

## 5. Final report

Keep it short:
1. What was built, phase by phase, with commit hashes.
2. The flowchart step → implementation table.
3. Migrations to run and in what order, including the data migration from 2.1.
4. Deployment steps for the user: the SMTP `.env` values to fill in, `APP_URL`, and the commands to
   install and enable the queue and scheduler systemd units.
5. Defaults you chose that the office should confirm: regular fund types, venue criteria and raters,
   and the Goods/Services category mapping.
6. Still open: whether Budget/Accounting may disapprove a PO, and what happens after they do.
