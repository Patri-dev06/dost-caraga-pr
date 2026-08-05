# Meeting Notes & Requirements — 2026-07-20

Transcribed from handwritten notes. Signatory initials: **JJD / RNV** = Supervisors (recommending / countersign), **MMA** = Budget Officer (certifies funds available), **NMA** = Approver, **RD** = Regional Director.

---

## 1. Document Routing

### Routing of LIB
1. **Preparer**
2. → **Supervisor** — *Recommending Approval* (JJD, RNV)
3. → **Certified Funds Available / Budget Officer** (MMA)
4. → **Approval** (NMA)

Notes:
- Notify each account (next signatory) when there is something to submit.
- The signatory's view should be the same as the preparer's view.

### Routing of PPMP
1. **Prepared**
2. → **Supervisor's account** for countersign (JJD, RNV)
3. → **Budget Officer** (MMA)
4. → **Approval**

---

## 2. Fixes & Enhancements

- [x] **Quantity = integer only (PR)** — enforced in the UI (digits only) and backend validation (`integer, min:1`) on PR create/update.
- [x] **PR no. continuous** — `nextPrNo()` now derives from the highest existing sequence (collision-safe after deletions) instead of `count()+1`.
- [x] **"Chargeable to" field on PPMP** — new `chargeable_to` column, form field, and API round-trip.
- [x] **PPMP classification (Regular/Project)** — see §3; new `ppmp_class` column + form selector (also implements the LIB-vs-GAA distinction).
- [x] **"+" hover bug** — marked done in notes (not re-touched).
- [x] **Typo check** — native browser spellcheck (red underline) enabled on all text inputs/textareas in the LIB and PPMP forms.
- [x] **Description follows text** — implemented as placeholder hint text on empty LIB & PPMP fields (header/meta fields and row descriptions).
- [x] **PPMP no. unique per project** — auto-numbered `PPMP-{year}-{0001}` (continuous, collision-safe); the field is now read-only/auto-assigned.
- [ ] **PPMP reuse when approved** — allow reusing/duplicating an approved PPMP. *(Deferred — define "reuse": clone into new draft?)*
- [x] **"Approved by: RD"** — the designated Regional Director now shows as the "Approved by" signatory on the PPMP (via a new `/workflow-signatories` endpoint). LIB already captures its RD approver through the routing workflow. *(PR/RFQ printouts not yet forced to show RD — deferred.)*
- [x] **Notify when returned (PPMP)** — already implemented (`ppmp_returned` notification to owner).
- [x] **Full LIB routing workflow** — implemented: Preparer → Supervisor (recommend) → Budget Officer (certify) → Regional Director (approve), with return-to-preparer at any stage, per-stage authorization, and notifications at every step (`lib_submitted/recommended/certified/approved/returned`). Designated Supervisor & Regional Director are set in System Settings (like the Budget Officer). Return-reason banner shown to the preparer.
- [ ] **Certified Funds Available (MMA)** — Budget Officer certification exists for PPMP; extend labelling/flow. *(Partially present; revisit with LIB routing.)*
- [ ] **PR Purpose auto-generated but editable** — auto-fill purpose yet keep it editable. *(Deferred — confirm the auto-generation source/template.)*

---

## 3. Structural Concepts (July 20)

### PR from Councils
- Approval item — **Add**.
- Must be **cleared by FAS before approval**.

### APP (Annual Procurement Plan)
- Delivered **to the Supply Unit**.
- Generated **once a semester**.

### PPMP Classification
- **PPMP for Regular** → funded by / contains **GAA**.
- **PPMP for Project** → has a **LIB** of the project.

### Hierarchy
```
              APP
             /   \
          LIB     GAA
             \   /
             PPMP
               |
         Project Leader
```
APP is consolidated from PPMPs; a Project PPMP is backed by a LIB, a Regular PPMP by GAA. Prepared by the Project Leader.

---

## Implementation status (this pass)

**Applied & verified (migration ran, backend lint clean, no new TS errors):**
- PR quantity is integer-only (frontend input + backend validation).
- PR numbers are continuous / collision-safe.
- PPMP has `ppmp_class` (Regular=GAA / Project=LIB) and `chargeable_to`, with form controls; a Project PPMP requires a LIB, a Regular one does not.
- APP consolidation (built previously) continues to feed off approved PPMPs.

**Deferred — need a product decision before building (see checklist notes):**
- Full **LIB routing workflow** (submit → recommend → certify → approve) with per-account notifications — currently only PPMP has this.
- **"Approved by: RD"** signatory across all document types.
- **PR Purpose auto-generation** template/source.
- **PPMP no. uniqueness per project** (auto-number vs. validate).
- **PPMP reuse** semantics.
- **APP semester cadence** + delivery to Supply Unit (current consolidation is per fiscal year).
- **PR from Councils** + **FAS clearance before approval**.
- **"Description follows text"** and the general **typo pass**.
