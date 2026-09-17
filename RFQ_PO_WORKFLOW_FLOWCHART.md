# RFQ → BAC → PO Workflow (from provided flowchart)

This documents my understanding of the flowchart shared on 2026-09-17, describing the target end-to-end procurement process from PR creation through Purchase Order delivery. It has two parts: **Module 1** (Purchase Request creation/approval, shaded blue on the diagram) and the unshaded flow that follows it (RFQ canvassing → Abstract of Canvas → BAC review → PO issuance → delivery).

## Module 1 — Purchase Request Creation & Approval

1. **Login** — account login triggers an email notification to the account owner.
2. **User initiates PR creation**, inputs PR details.
3. **Regular fund?**
   - **No** → Identify Project, then:
     - **Items in PPMP?**
       - No → error: *"Item not in PPMP" / "Item not within budget/(LIB)"*
       - Yes → **Items within Budget?**
         - No → same error as above
         - Yes → proceeds to the APP-CSE check below
   - **Yes** (regular fund) → skips the PPMP/budget check and goes straight to the APP-CSE check.
4. **Items in APP-CSE?**
   - Yes → Proceed to Create PR
   - No → **Items in APP-Non-CSE?**
     - Yes → Proceed to Create PR
     - No → error: *"Item is not in APP-Non-CSE & APP-CSE"*
5. **Proceed to Create PR** → forwarded to **Supervisor/Recommending Approval** (digital sign + email notification) → forwarded to **RD for Digital Sign** (+ email notification) → **Approved Purchase Request** (+ email notification).

Approved PR is the hand-off point into the RFQ flow.

## RFQ Generation & Supplier Canvassing

1. **Generate RFQ** (from the Approved PR).
2. Forwarded to **BAC Chair/BAC Vice-chair for Digital Sign**.
3. Forwarded to **Supply Officer for counter Digital Sign**.
4. **Filter Supplier based on category** (Goods, Services).
5. **Choose 3 suppliers.**
6. **Send RFQ** with complete details/specifications to the 3 selected suppliers.
7. **Supplier receives RFQ** via a **Supplier Portal**.
8. **Does supplier reply?**
   - Yes → supplier sends back a **signed quotation**.
   - No, after **7 calendar days** → the sent RFQ to that non-responding supplier is **cancelled**, and a **replacement supplier is chosen** (loops back to sending the RFQ to the new pick).
9. Separately, **"Choose n of supplier"** (a supplier-count/replacement control) feeds into **"Did all suppliers fail?"**
   - Yes → **Fail?** branch — re-checks whether the canvass overall failed.
   - No → loops back to re-attempt canvassing with the remaining/replacement suppliers.

## Evaluation & Abstract of Canvas (AOC)

1. Once quotations are in, **check each equipment with supplier**.
2. **TWG Specification evaluation** (Technical Working Group reviews specs).
3. **Procurement category check** branches three ways:
   - **If Equipment** → routes through the TWG specification evaluation path above.
   - **If List of Venue** → **individual rating of list of venue** (per winning-supplier candidate) → **summary of rating**.
   - **If Goods** → straight to generating the AOC.
4. All three paths converge on **Generate Abstract of Canvas (AOC)**.

## BAC Review

1. **AOC → BAC Review (Digital-sign)**.
2. **Fail?**
   - Yes → **Committee adds remarks** → **notify TWG, End-user, Supply** → **TWG addresses BAC remarks** → **BAC satisfied?**
     - No → **Cancel PR** → **notify end-user to re-PR** → END.
     - Yes → loops back to BAC Review for re-approval.
   - No (passes) → **AOC returned to Supply to note the lowest bidder**.

## PO Creation, Approval & Delivery

1. **Create PO** (from the AOC's noted lowest/winning bidder).
2. Forwarded to **Budget for Obligation (Digital Sign)**.
3. Forwarded to **Accounting (Digital Sign)**.
4. Forwarded to **RD for final approval (E-Sign)**.
5. **Generate PO** with complete digital signatures.
6. **Forward signed PO to Supplier Portal** — notifies both the supplier and the end-user of the winning bidder.
7. **Does supplier waive delivery?**
   - Yes → loops back into the BAC-satisfaction / re-procurement cycle.
   - No → **END** (delivery proceeds).

## Open question noted directly on the diagram

> "Need to clarify to budgeting and accounting if they can disapprove goods being procured."

This suggests it's still undecided whether Budget/Accounting sign-off is a genuine approve/reject gate (like BAC's) or a pass-through confirmation step.

## How this compares to the current implementation

The RFQ and PO features built so far (backend-persisted, in `pr_backend`/`pr_frontend`) are a simplified first pass relative to this diagram:

| Diagram | Current implementation |
|---|---|
| One RFQ canvass = exactly **3 suppliers**, sent via a Supplier Portal, with reply tracking and a 7-day timeout/replacement loop | One RFQ = **one supplier** (free-text fields), created directly from an Approved PR |
| **BAC Chair/Vice-chair + Supply Officer countersign the RFQ itself** before it's sent to suppliers | No pre-send signing step on the RFQ document |
| **Abstract of Canvas (AOC)** step with category-based branching (goods / equipment / venue) and TWG spec evaluation | No AOC step exists |
| **BAC Review** with a specific remarks → TWG-addresses → re-review loop, or cancel-and-re-PR | Generic recommend → approve → reject (no remarks loop, no PR-cancellation path) |
| PO routed through **Budget (obligation) → Accounting → RD** as three distinct sign-offs | Generic recommend → approve → reject on the PO |
| **Supplier delivery-waiver** step after PO issuance | Not modeled — nothing tracks delivery acceptance |

This gap is worth keeping in mind if/when the RFQ/PO module gets built out further to match this target process.
