# System Audit — DOST Caraga Procurement System

**Commit audited:** `main @ 11c44fe`
**Date:** 2026-08-13

## Health snapshot
- ✅ All 5 planning/workflow migrations applied (`migrate:status` all Ran).
- ✅ Backend `php -l` clean on touched controllers/models.
- ✅ Production build (`npm run build`) passes.
- ⚠️ `tsc --noEmit` fails only on 2 pre-existing baseline errors (see LOW-1).
- ✅ E-signature feature landed complete (backend gates + topbar uploader + LIB button gating).

---

## 🔴 HIGH-1 — Workflow & e-signature bypass via the save (upsert) endpoint  ✅ FIXED (2026-08-13)

> **Applied:** `planningLibStore` now sets `status` to the server's current status for
> existing docs and `Draft` for new ones (never advances on save). `planningPpmpStore`
> validation restricts save `status` to `Draft` / `Submitted to Budget Officer` via
> `Rule::in(...)`, so `Approved`/`Returned` can only be set through the review endpoints.


**Locations**
- `pr_backend/app/Http/Controllers/Api/ProcurementController.php:336` — `planningLibStore` fills `'status' => $data['status']`
- `pr_backend/app/Http/Controllers/Api/ProcurementController.php:666` — `planningPpmpStore` fills `'status' => $data['status']`
- Validation: both use `'status' => ['required', 'string']` (no allow-list)

**Problem**
The LIB/PPMP save endpoints persist a **client-supplied `status`**, guarded only by `abortUnlessOwned()`. An owner can call:

```
PUT /api/v1/planning-libs/{clientUid}   { ..., "status": "Approved" }
PUT /api/v1/planning-ppmps/{clientUid}  { ..., "status": "Approved" }
```

and **self-approve their own document**, bypassing:
- the Supervisor → Budget Officer → Regional Director routing,
- the per-stage authorization checks, and
- the mandatory e-signature gate.

The dedicated workflow endpoints (`/submit`, `/recommend`, `/certify`, `/approve`, `/return`) enforce all of the above; this save endpoint is a back door that ignores them. (Scope: a user can only self-approve their *own* docs, but it still defeats segregation-of-duties and the e-signature mandate.)

**Fix**
The upsert must never accept a forward status transition. Status should change **only** through the workflow endpoints.

- For a **new / draft** document: clamp `status` to `Draft` (or `Returned` if you keep that as a distinct draft state).
- For an **existing** document: **preserve the server's current status** and ignore the client-sent `status`.

Sketch (LIB — mirror for PPMP):

```php
// planningLibStore(), inside the DB::transaction closure, replace:
//   'status' => $data['status'],
// with:
'status' => $document->exists
    ? $document->status                 // never let a save change an in-flight status
    : 'Draft',                          // new docs always start as Draft
```

Also tighten validation with an allow-list, e.g.:

```php
'status' => ['required', Rule::in(['Draft', 'Pending Supervisor Review',
    'Forwarded to Budget Officer', 'Pending Regional Director Approval', 'Approved'])],
```

(Legit flows don't need the upsert to set `Approved`: the reprogramming/revise flow keeps the doc's existing `Approved` status, which "preserve server status" handles automatically.)

- [x] Patch `planningLibStore` status handling
- [x] Patch `planningPpmpStore` status handling
- [x] Add `Rule::in(...)` allow-list (PPMP)
- [ ] Re-test: draft save, submit, full routing, and confirm a raw `PUT {status:"Approved"}` no longer approves

---

## 🟠 MEDIUM-1 — PPMP approve/submit buttons not gated on e-signature (UX)

**Locations**
- Enforced server-side: `ProcurementController.php:637` (PPMP submit), `:789` (PPMP approve)
- Missing client gate: `pr_frontend/src/routes/planning.ppmp.new.tsx` (no `hasSignature` check)
- Correct reference: `pr_frontend/src/routes/planning.lib.new.tsx:461` (`noSignature` disables buttons + shows hint)

**Problem**
The backend correctly returns 422 when a user without an e-signature tries to submit/approve a PPMP, but the PPMP form doesn't proactively disable those buttons like the LIB form does. Users only discover the block after clicking.

**Fix**
Mirror the LIB pattern in the PPMP form: read `currentUser.hasSignature`, disable the submit/approve buttons when absent, and show the same "Upload your e-signature first (account menu → My E-Signature)" hint.

- [ ] Add `noSignature` gate to PPMP submit/approve buttons

---

## 🟠 MEDIUM-2 — localStorage-first sync is lossy and leaves data at rest

**Locations**
- `pr_frontend/src/lib/lib-store.ts`, `pr_frontend/src/lib/ppmp-store.ts` (`dost_libs`, `dost_ppmps` caches)
- Fire-and-forget writes: `void apiUpsertPlanningLib(...).catch(() => undefined)` (and PPMP equivalent)

**Problem**
- A failed server write is silently swallowed, so the browser can show data the server never stored.
- Planning/budget data persists in `localStorage` on shared workstations after logout.

**Fix**
- Surface sync failures (toast + retry/queue) instead of swallowing them.
- Clear `dost_libs` / `dost_ppmps` (and other caches) on logout.

- [ ] Surface/queue failed syncs
- [ ] Clear planning caches on logout

---

## 🟡 LOW / Observations

### LOW-1 — Two pre-existing TypeScript errors fail `tsc`
- `pr_frontend/src/lib/api.ts:1014` — `mapSystemPreference` TS2322 on `setting.value`.
- `pr_frontend/src/routes/planning.ppmp.new.tsx:1023` — `findLastIndex` needs `es2023` (+ implicit-any params).
- Vite build still passes, but a `tsc`-based CI gate would fail. Fix: set tsconfig `lib`/`target` to `es2023`; correct the `mapSystemPreference` typing.
- [ ] Bump tsconfig target/lib to es2023
- [ ] Fix mapSystemPreference typing

### LOW-2 — Password reset not distinctly audited
- Superadmin reset logs a generic "Updated User" (via the resource update path), not "Reset password". Reset itself is correctly superadmin-gated and hashed.
- [ ] Emit a specific audit entry when `password` is present on a user update.

### LOW-3 — Shallow signature validation
- `storeSignature` validates only `starts_with:data:image/` + `max:2000000`. A non-image data URL passes and renders broken. Low risk; optionally decode/validate server-side.
- [ ] (Optional) Validate the uploaded signature is a decodable image.

### LOW-4 — `exceljs` pinned at 3.4.0
- `package.json` now matches the installed/locked 3.4.0 (previously claimed `^4.4.0` but ran 3.x). Make a deliberate keep-vs-upgrade decision.
- [ ] Decide: keep 3.4.0 or upgrade to 4.x (then re-verify the LIB/PR Excel exports).

### LOW-5 — `php artisan serve` broken on the Windows/Herd host (dev-only)
- Workaround in use: `php -S 127.0.0.1:8000 -t public public\index.php`. Documented; no action required.

---

## ✅ Confirmed solid (no action)
- API tokens: SHA-256 hashed, 8h expiry; login requires `status = Active`.
- `register` cannot escalate `tier`/`status` (both server-forced to `regular`/`Pending`).
- Passwords hashed via the `hashed` cast and hidden from serialization.
- `users.signature` hidden from generic payloads; only `has_signature` is exposed.
- Per-stage LIB authorization + e-signature gates enforced on the dedicated workflow endpoints.
- Audit logging present across auth, planning, references, approvals.

---

## Suggested patch order
1. **HIGH-1** (status clamp + allow-list) — closes the approval/e-signature bypass.
2. **MEDIUM-1** (PPMP button gating) — quick UX parity with LIB.
3. **MEDIUM-2** (sync failures + logout cache clear).
4. **LOW-1** (tsc/es2023) and the remaining LOW items as cleanup.
