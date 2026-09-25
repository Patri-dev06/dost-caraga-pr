# Procurement workflow — flowchart to implementation

The Procurement System Flowchart has four lanes: **Module 1 / Approved PR** (blue), **PR / Request for
Quotation** (green), **BAC review** (orange), and **Purchase Order** (yellow). This document maps every
box and Yes/No arrow to the status, endpoint and screen that implement it. All API paths are under
`/api/v1`.

Signatories are chosen in **Settings** (system preferences): Budget Officer, Regional Director, BAC
Chairman, BAC Vice-Chairman, Supply Officer, Accounting Officer, TWG Lead. Every "digital sign" step
needs the signer's uploaded e-signature. Each routing step creates an in-app notification and sends a
queued email that links back into the app (`FRONTEND_URL`).

**Suppliers do not use the system.** The Supply team contacts each supplier, delivers the RFQ and the
signed PO in person or by their usual channel, and records what comes back (the signed quotation, the
supplier's delivery answer). The system never emails a supplier.

## Blue — Module 1: Approved PR

| Flowchart | Implementation |
|---|---|
| Account login → email to account owner | `POST /auth/login` queues a "New sign-in" email (time, IP, browser). Off when *Email Notifications* is off. |
| User initiates PR, inputs details | `POST /purchase-requests`; screen `/purchase-requests/new`. "Charged to" sends the planning PPMP (`ppmp_client_uid` → `purchase_requests.ppmp_document_id`). |
| **Regular fund?** | `PurchaseRequestChecks::isRegularFund`: a PR charged to a **Regular** PPMP is regular, and one charged to a **Project** PPMP is not. Otherwise the fund type decides, per the *Regular Fund Types* setting (default `GAA`). |
| Yes → Items in APP-CSE? → No → Items in APP-Non-CSE? → No → error | Validation rows `APP-CSE` then `APP-Non-CSE`; error text *"Items is not in APP-Non-CSE & APP-CSE"*. An item counts as "in" an APP when an APP row exists for it, or an approved PPMP line with the same CSE / Non-CSE classification does (the APP is consolidated from those lines). |
| No → Identify Project | Row `Project`: the LIB behind the charged Project PPMP (or the PR's own project). Fails if none. |
| → Items in PPMP? → error *"Item not in PPMP"* | Row `PPMP`: the item must be a line of the charged PPMP (older PRs: the project's PPMP). This now **blocks** submission; it used to be only a warning. |
| → Items within Budget (LIB)? → error *"Item not within budget (LIB)"* | Row `Line-Item Budget`: all of this PR's rows for the item, plus what other live PRs charged to the same PPMP already drew, must fit that item's PPMP budget. Older project PRs compare the **PR total** with the project's available allocation. |
| → Items in APP-Non-CSE? | Row `APP-Non-CSE` (this path never checks APP-CSE, as drawn). |
| Proceed to Create PR → Supervisor/Recommending Approval → RD → Approved PR (email each) | `POST /purchase-requests/{id}/submit` (runs the checks; a failure returns the PR as **Returned**) → `POST /approvals/{id}/recommend` → `POST /approvals/{id}/approve`. |

## Green — PR / Request for Quotation

| Flowchart | Implementation |
|---|---|
| Generate RFQ | `POST /rfqs` from an Approved PR; the Supply Officer is notified. Status `Draft`. Screen `/rfq/{id}`. |
| Forward to Supply Officer for counter digital sign | `POST /rfqs/{id}/sign/supply-officer` → `Pending BAC Signature`. |
| Forward to BAC Chair / BAC Vice-chair for digital sign | `POST /rfqs/{id}/sign/bac`: **one** signature from either → `Ready to Send`. |
| Filter supplier based on category (Goods, Services) | Supplier directory `GET/POST/PUT/DELETE /suppliers`, screen `/suppliers`. Goods and Equipment RFQs take **Goods** suppliers; Venue RFQs take **Services** suppliers. `POST /rfqs/{id}/suppliers` accepts a directory supplier, or a new one that is first added to the directory. |
| Choose 3 suppliers → Send RFQ with complete details | `POST /rfqs/{id}/send` (exactly 3) → `Canvassing`. This marks the RFQ as sent and starts each supplier's 7-day reply window; the Supply team delivers the RFQ to the suppliers themselves. |
| Supplier receives RFQ | Outside the system: the Supply team contacts each supplier (contact number, email and address are on the supplier's directory entry). |
| Does supplier reply? **Yes** → sends back signed quotation | The Supply team records it: `POST /rfqs/{id}/suppliers/{s}/quote`, a price for every item plus the scan of the signed quotation (PDF/JPG/PNG, max 10 MB, required) → supplier `Replied`. |
| **No** (after 7 calendar days) → Cancel sent RFQ of non-responding supplier | `php artisan rfq:expire-unanswered`, hourly via the scheduler → supplier `TimedOut`, and Supply is told to choose a replacement. Staff can cancel early: `POST /rfqs/{id}/suppliers/{s}/cancel`. |
| Choose n of supplier | `POST /rfqs/{id}/suppliers/choose`: up to n replacements (n = open slots), marked as sent right away with a fresh 7-day window. |
| Procurement category check → **If goods** | `POST /rfqs/{id}/aoc` once every supplier has replied or been cancelled; the lowest total wins. |
| **If equipment** → TWG specification evaluation → Check each equipment with supplier → Fail? | With all quotes in, the RFQ moves to `TWG Evaluation`. The TWG Lead saves notes (`PUT /rfqs/{id}/twg/notes`) and marks each item Complies / Does not (`POST /rfqs/{id}/suppliers/{s}/twg-check`); any failed item fails the supplier. |
| Did all supplier fail? **Yes** → Choose n of supplier needed | Every supplier's status becomes `Failed TWG`; the RFQ goes back to `Canvassing` and Supply chooses n new suppliers (same endpoint as above). |
| Did all supplier fail? **No** → keep checking → Generate AOC | Once every supplier is checked, the AOC is built from the suppliers that **passed**; the lowest of them wins. |
| **If list of venue** → Generate AOC → Individual rating of list of venue → Summary of rating | AOC status `For Venue Rating`. The raters (TWG Lead, end-user / PR requester, Supply Officer; one person holding several roles rates once) score each venue 1–5 on each *Venue Rating Criteria* setting (`POST /aoc/{id}/venue-ratings`). When the last rater submits, the summary is saved; the highest average wins and the lower quote breaks a tie. The AOC returns to `Draft`. |

## Orange — BAC review

| Flowchart | Implementation |
|---|---|
| BAC Review (digital sign) | `POST /aoc/{id}/submit-for-bac-review` → `Pending BAC Review`; `POST /aoc/{id}/bac-review` by the BAC Chairman or Vice-Chairman. Screen `/aoc/{id}`; queue in Approval Inbox → BAC. |
| Fail? **Yes** → Committee add remarks → Notify TWG, End-user, Supply | `pass: false` with remarks → `BAC Returned`; notifies the TWG Lead, the requester, the Supply Officer and the preparer. |
| TWG address BAC remarks | `POST /aoc/{id}/twg-respond` (TWG Lead) → `Pending BAC Satisfaction`. |
| BAC satisfied? **Yes** → BAC Review | `POST /aoc/{id}/bac-satisfaction` `satisfied: true` → `Pending BAC Review` (a fresh signed review). |
| BAC satisfied? **No** → Cancel PR → Notify end-user to Re-PR | `satisfied: false` + reason → PR `Cancelled` (`cancelled_from = AOC`). Its RFQ, AOC and open PO are cancelled; the requester is asked to Re-PR. |
| Fail? **No** | `pass: true` → `For Supply Noting`. |

## Yellow — Purchase Order

| Flowchart | Implementation |
|---|---|
| AOC returned to supply to note lowest bidder | `POST /aoc/{id}/note-lowest-bidder` (Supply Officer, signed) → `Lowest Bidder Noted`. |
| Create PO | `POST /rfqs/{id}/generate-po`, allowed only from `Lowest Bidder Noted`. Screen `/po/{id}`. |
| Forwarded to Budget for Obligation → Accounting → RD final approval | `POST /purchase-orders/{id}/submit` → `approvals/po/{id}/obligate` → `/account` → `/final-approve`. |
| Generate PO (with complete digital signature) | The PO carries every signer's name, date and e-signature image; the Supply team prints it for the supplier. |
| Forward signed PO to supplier (notify supplier & end-user of winning bidder) | Automatic on RD approval → `Forwarded to Supplier`: the requester is told who won and the Supply team is told to bring the signed PO to the supplier. |
| Does supplier waive to deliver? **No** → END | Supply records the supplier's answer (`POST /purchase-orders/{id}/deliver`) → `Delivery Accepted` (fills *Date Conformed* on the monitoring sheet). |
| **Yes** → Cancel PR → Notify end-user to Re-PR | → `Delivery Waived`, then the same Cancel PR path (`cancelled_from = PO`). |
| Notify end-user to Re-PR | `POST /purchase-requests/{id}/re-pr` copies the cancelled PR (items, fund source, charged PPMP, purpose) into a new Draft, once per PR. The PR page shows the cancellation and a **Re-PR** button. |

## Procurement Monitoring Sheet

`/purchase-requests` shows every PR as one row of the Supply Unit's monitoring sheet
(`GET /purchase-requests/monitoring`). The system fills in each PR's trail from the PR, RFQ, AOC and PO. The
Supply team (Admin/Superadmin, the Supply Officer, and RFQ/PO module holders) keeps the other columns
(ORS/BURS, delivery, inspection & acceptance, issuance, payment) with the pencil on each row
(`PUT /purchase-requests/{id}/monitoring`; allowed keys and types in `App\Support\MonitoringFields`).
The sheet filters by PR No./purpose, status, and a day, month or year of the PR's date (Manila time), and
shows how many PRs match. Export writes the filtered rows to Excel.

## Still open

> "Need to clarify to budgeting and accounting if they can disapprove goods being procured."

Budget, Accounting and the RD can still **reject** a PO (`POST /approvals/po/{id}/reject`), as before,
but the flowchart does not say what happens next, so a rejected PO stops there. Decide the path
(revise and resubmit, re-canvass, or Cancel PR → Re-PR) before building it.

## Running it

- **Email:** set `MAIL_MAILER=smtp` and the SMTP account in `pr_backend/.env`, and `FRONTEND_URL` to the
  public address. Mail is queued, so run the queue worker (`scripts/systemd/dost-caraga-pr-queue.service`).
- **7-day sweep:** run the scheduler (`scripts/systemd/dost-caraga-pr-scheduler.service`).
- **Settings to review:** *Regular Fund Types*, *Venue Rating Criteria*, and the Supply Officer and TWG
  Lead accounts.
