// Line Item Budgets (DOST Form 4). PostgreSQL is the source of truth; localStorage
// is retained as a browser cache/fallback while the API is unavailable.

import {
  apiApprovePlanningLib,
  apiCertifyPlanningLib,
  apiDeletePlanningLib,
  apiGetPlanningLibs,
  apiRecommendPlanningLib,
  apiReturnPlanningLib,
  apiSubmitPlanningLib,
  apiUpsertPlanningLib,
  getCurrentUser,
} from "./api";

export type LibStatus =
  | "Draft"
  | "Pending Supervisor Review"
  | "Forwarded to Budget Officer"
  | "Pending Regional Director Approval"
  | "Approved";

// A LIB may be reprogrammed up to MAX_REVISIONS times. Each revision adds one
// reprogramming round (First, Second, Third) carrying its own amount + justification.
export const MAX_REVISIONS = 3;

export const REPROG_LABELS = ["First", "Second", "Third"] as const;
export function reprogLabel(roundIndex: number): string {
  return `${REPROG_LABELS[roundIndex] ?? `Round ${roundIndex + 1}`} Reprogramming`;
}

export interface LibReprogramming {
  amount: string; // numeric string
  justification: string; // why this line changed in this round
}

export interface LibRow {
  id: string;
  label: string; // Object of Expenditure
  note: string; // middle notes column
  indent: 0 | 1 | 2; // 0 = section, 1 = group/line, 2 = sub-line
  header: boolean; // true = category header (bold, no amounts)
  approved: string; // numeric string
  reprogrammings: LibReprogramming[]; // one entry per committed/in-progress revision round
}

// Highest number of reprogramming rounds present across the given rows.
export function maxRounds(rows: LibRow[]): number {
  return rows.reduce((m, r) => Math.max(m, r.reprogrammings?.length ?? 0), 0);
}

export interface LibSnapshot {
  savedAt: string;
  status: LibStatus;
  rows: LibRow[];
}

export interface LibDoc {
  id: string;
  fiscalYear: string;
  programTitle: string;
  projectTitle: string;
  implementingAgency: string;
  totalDuration: string;
  cooperatingAgency: string;
  projectLeader: string;
  monitoringAgency: string;
  durationFrom?: string; // ISO date (YYYY-MM-DD) — structured project duration range
  durationTo?: string;
  rows: LibRow[];
  chargeableNote: string;
  preparedByName: string;
  preparedByPosition: string;
  recommendingName: string;
  recommendingPosition: string;
  certifiedName: string;
  certifiedPosition: string;
  approvedName: string;
  approvedPosition: string;
  status: LibStatus;
  revision: number; // count of committed reprogramming rounds (0..MAX_REVISIONS)
  history?: LibSnapshot[]; // snapshots captured on each revision
  ownerId?: number; // account that created this LIB (visibility scope)
  ownerName?: string; // creator's name, for display
  // Routing workflow (preparer → supervisor → budget officer → regional director)
  supervisorId?: number;
  budgetOfficerId?: number;
  approvedById?: number;
  submittedAt?: string;
  recommendedAt?: string;
  certifiedAt?: string;
  approvedAt?: string;
  returnReason?: string; // reason captured when a signatory returns it for revision
  reviewComment?: string; // latest signatory comment
  approvalSignature?: string; // e-signature text on final approval
  createdAt: string;
  updatedAt: string;
}

const KEY = "dost_libs";

let rowSeq = 0;
export function newRowId() {
  rowSeq += 1;
  return `row-${Date.now()}-${rowSeq}`;
}
export function newLibId() {
  return `lib-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}

export function parseAmount(v: string): number {
  const n = Number(String(v).replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : 0;
}
export function fmtAmount(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
export function libTotals(rows: LibRow[]): { approved: number; reprogrammings: number[] } {
  const reprogrammings = new Array(maxRounds(rows)).fill(0) as number[];
  let approved = 0;
  for (const r of rows) {
    // Category/Title headers may carry their own amount now, so include every row.
    // Empty cells parse to 0, so classic "header has no amount" data is unaffected.
    approved += parseAmount(r.approved);
    (r.reprogrammings ?? []).forEach((rp, i) => {
      reprogrammings[i] += parseAmount(rp.amount);
    });
  }
  return { approved, reprogrammings };
}

export interface LibTitleSubtotal {
  titleId: string;
  title: string;
  approved: number;
  reprogrammings: number[];
}

/**
 * Sub-total each Title (indent-0 header) group: sum the approved amount and every
 * reprogramming round across the rows that belong to it (up to the next Title).
 */
export function subtotalsByTitle(rows: LibRow[]): LibTitleSubtotal[] {
  const rounds = maxRounds(rows);
  const out: LibTitleSubtotal[] = [];
  let current: LibTitleSubtotal | null = null;
  for (const r of rows) {
    if (r.header && r.indent === 0) {
      current = { titleId: r.id, title: r.label, approved: 0, reprogrammings: new Array(rounds).fill(0) as number[] };
      out.push(current);
      continue;
    }
    if (current) {
      current.approved += parseAmount(r.approved);
      (r.reprogrammings ?? []).forEach((rp, i) => {
        if (i < rounds) current!.reprogrammings[i] += parseAmount(rp.amount);
      });
    }
  }
  return out;
}

export const LIB_TOTAL_TOLERANCE = 0.005;

export function reprogrammingTotalDifference(rows: LibRow[], roundIndex: number): number {
  const totals = libTotals(rows);
  return (totals.reprogrammings[roundIndex] ?? 0) - totals.approved;
}

export function isReprogrammingTotalBalanced(rows: LibRow[], roundIndex: number): boolean {
  return Math.abs(reprogrammingTotalDifference(rows, roundIndex)) <= LIB_TOTAL_TOLERANCE;
}

export function currentLibBudgetTotal(libOrRows: LibDoc | LibRow[]): number {
  const rows = Array.isArray(libOrRows) ? libOrRows : libOrRows.rows;
  return libTotals(rows).approved;
}

export function isApprovedReprogrammedLib(lib: LibDoc): boolean {
  return lib.status === "Approved" && lib.revision > 0;
}

function row(
  label: string,
  opts: { note?: string; indent?: 0 | 1 | 2; header?: boolean; approved?: number; reprogramming?: number; justification?: string } = {},
): LibRow {
  // The default template is an already-approved-and-once-revised sample, so any
  // line that carries a reprogramming amount seeds a single "First Reprogramming" round.
  const reprogrammings: LibReprogramming[] =
    !opts.header && opts.reprogramming != null
      ? [{ amount: String(opts.reprogramming), justification: opts.justification ?? "" }]
      : [];
  return {
    id: newRowId(),
    label,
    note: opts.note ?? "",
    indent: opts.indent ?? 1,
    header: opts.header ?? false,
    approved: opts.approved != null ? String(opts.approved) : "",
    reprogrammings,
  };
}

export function defaultLibRows(): LibRow[] {
  return [
    row("I. Maintenance and Other Operating Expenses", { indent: 0, header: true }),
    row("Traveling Expenses", { indent: 1, approved: 88220, reprogramming: 162600, justification: "Increased to accomodate the scheduled travel of personnel" }),
    row("Fuel Expenses", { indent: 1, approved: 10000, reprogramming: 10000 }),
    row("Supplies and Materials Expenses", { indent: 1, header: true }),
    row("Office Supplies", { indent: 2, approved: 68990, reprogramming: 68990, justification: "Decreased, as the actual utilization is reflected." }),
    row("ICT Supplies", { indent: 2, approved: 55990, reprogramming: 57300, justification: "Increased to augment funds for the procurement of ICT supplies" }),
    row("Communication Expenses", { indent: 1, header: true }),
    row("Public Network Service Subscription", { indent: 2, approved: 185000, reprogramming: 140400, justification: "Decreased, as the actual utilization is reflected." }),
    row("Subscription Expenses", { indent: 1, header: true }),
    row("Office Productivity Tool", { indent: 2, approved: 25500, reprogramming: 78400, justification: "Increased to accomodate provision of productivity tool for FAS and 5 PSTOs" }),
    row("Cloud-Hosting Service Renewal", { indent: 2, approved: 154100, reprogramming: 154100 }),
    row("Virtual Conferencing Platform", { indent: 2, approved: 35900, reprogramming: 35900 }),
    row("Domain Service Renewal", { indent: 2, approved: 34100, reprogramming: 34100 }),
    row("API Tokens", {
      indent: 2,
      approved: 45000,
      reprogramming: 45000,
      note: "Procured on Q1 for TAR/asense development, Certify, Risk Register System, NCCAIR System",
    }),
    row("AI Chatbot", { indent: 2, approved: 21600, reprogramming: 21600 }),
    row("Text-to-Speech/Speech-To-Text Tokens", { indent: 2, approved: 26400, reprogramming: 26400, note: "Used in Talino AI" }),
    row("Representation Expenses", { indent: 1, approved: 400000, reprogramming: 343500, justification: "Decreased to realign and utilized as travelling expenses" }),
    row("Training Expenses", { indent: 1, approved: 60000, reprogramming: 32600, justification: "Decreased to realign and utilized for the Office Productivity Tool" }),
    row("Other Professional Services", { indent: 1, header: true }),
    row("Two (2) Project Technical Assistants I (32,300.00/mo x 12 mos.)", { indent: 2, approved: 775200, reprogramming: 775200 }),
    row("Gratuity", { indent: 2, approved: 14000, reprogramming: 14000 }),
  ];
}

export function defaultLibContent(): Omit<LibDoc, "id" | "status" | "createdAt" | "updatedAt"> {
  return {
    fiscalYear: "2026",
    programTitle: "DOST-Caraga Grants-In-Aid Programme",
    projectTitle:
      "ICT Support for the Operationalization and Development of the Network of Open Virtual AI (NOVA) Hub and Regional AI Ecosystem for Startups and Workforce Development",
    implementingAgency: "DOST-Caraga",
    totalDuration: "January 1 - December 31, 2026",
    cooperatingAgency:
      "Caraga State University - Navigatu TBI\nNorth Eastern Mindanao State University - NEMSU TBI\nSurigao del Norte State University - SNSU WAVES TBI\nFather Saturnino Urios University - MOLSSS TBI\nAgusan del Sur State College of Agriculture and Technology - AB",
    projectLeader: "ENGR. NOEL M. AJOC",
    monitoringAgency: "DOST-Caraga / MIS",
    rows: defaultLibRows(),
    revision: 1,
    chargeableNote: "* Chargeable against the CY 2026 DOST Caraga Local GIA",
    preparedByName: "JENIFER T. VILLAPLAZA",
    preparedByPosition: "Science Research Specialist II",
    recommendingName: "JENNIFER J. DEJARME",
    recommendingPosition: "Chief, Technical Support Services",
    certifiedName: "MARITES B. APOLINARIA",
    certifiedPosition: "Budget Officer",
    approvedName: "ENGR. NOEL M. AJOC",
    approvedPosition: "Regional Director",
  };
}

// A blank LIB for the "Create" form: empty fields and a single ready-to-fill
// line so the user can start typing (and use the per-row + menu) right away. The
// filled-in sample lives in defaultLibContent() and only seeds the list demo.
export function emptyLibContent(): Omit<LibDoc, "id" | "status" | "createdAt" | "updatedAt"> {
  return {
    fiscalYear: "2026",
    programTitle: "",
    projectTitle: "",
    implementingAgency: "",
    totalDuration: "",
    cooperatingAgency: "",
    projectLeader: "",
    monitoringAgency: "",
    rows: [row("", { indent: 1 })],
    revision: 0,
    chargeableNote: "",
    preparedByName: "",
    preparedByPosition: "",
    recommendingName: "",
    recommendingPosition: "",
    certifiedName: "",
    certifiedPosition: "",
    approvedName: "",
    approvedPosition: "",
  };
}

export function newLibDoc(): LibDoc {
  const now = new Date().toISOString();
  const me = getCurrentUser();
  // A brand-new draft starts blank — no reprogramming rounds yet (those columns
  // only appear once an approved LIB is revised). Stamp the creator so it stays
  // private to them (superadmins can still see every LIB).
  return {
    id: newLibId(),
    status: "Draft",
    history: [],
    ownerId: me?.id,
    ownerName: me?.name,
    createdAt: now,
    updatedAt: now,
    ...emptyLibContent(),
  };
}

/**
 * Who may see a given document. A document is private to its creator; a
 * superadmin sees everything. Legacy/ownerless docs are visible only to
 * superadmins.
 */
export function canViewOwned(ownerId: number | undefined): boolean {
  const me = getCurrentUser();
  if (!me) return false;
  if (me.tier === "superadmin") return true;
  return ownerId != null && ownerId === me.id;
}

// Coerce a persisted reprogramming entry into the expected string shape. The
// database stores empty cells as null, so amount/justification can come back
// null even though the type says string — callers then do `.amount.trim()` and
// crash. Normalise here so every consumer sees plain strings.
function sanitizeReprogramming(rp: unknown): LibReprogramming {
  const o = (rp ?? {}) as { amount?: unknown; justification?: unknown };
  return {
    amount: o.amount == null ? "" : String(o.amount),
    justification: o.justification == null ? "" : String(o.justification),
  };
}

// Convert a row that may still be in the legacy single-reprogramming shape
// ({ reprogramming, justification }) into the multi-round shape.
function migrateRow(r: Record<string, unknown>): LibRow {
  if (Array.isArray((r as { reprogrammings?: unknown }).reprogrammings)) {
    const { reprogramming: _a, justification: _b, reprogrammings, ...rest } = r as Record<string, unknown>;
    return { ...(rest as unknown as LibRow), reprogrammings: (reprogrammings as unknown[]).map(sanitizeReprogramming) };
  }
  const { reprogramming, justification, ...rest } = r as Record<string, unknown>;
  const amount = reprogramming == null ? "" : String(reprogramming);
  const just = justification == null ? "" : String(justification);
  const header = Boolean((rest as { header?: unknown }).header);
  const reprogrammings: LibReprogramming[] = header || (amount.trim() === "" && just.trim() === "") ? [] : [{ amount, justification: just }];
  return { ...(rest as unknown as LibRow), reprogrammings };
}

// Ensure every non-header row has exactly `rounds` reprogramming entries so the
// columns line up (padding blanks / trimming extras as needed).
function normalizeRows(rows: LibRow[], rounds: number): LibRow[] {
  return rows.map((r) => {
    // Headers may carry their own amount now, so they get reprogramming slots too.
    const reps = [...(r.reprogrammings ?? [])];
    while (reps.length < rounds) reps.push({ amount: "", justification: "" });
    reps.length = rounds;
    return { ...r, reprogrammings: reps };
  });
}

function migrateDoc(doc: Record<string, unknown>): LibDoc {
  const rowsRaw = ((doc.rows as Record<string, unknown>[]) ?? []).map(migrateRow);
  const anyReprog = rowsRaw.some((r) => !r.header && r.reprogrammings.length > 0);
  const revision = typeof doc.revision === "number" ? doc.revision : anyReprog ? 1 : 0;
  const rows = normalizeRows(rowsRaw, revision);
  const history: LibSnapshot[] = ((doc.history as Record<string, unknown>[]) ?? []).map((s) => ({
    savedAt: String(s.savedAt ?? ""),
    status: s.status as LibStatus,
    rows: ((s.rows as Record<string, unknown>[]) ?? []).map(migrateRow),
  }));
  return { ...(doc as unknown as LibDoc), revision, rows, history };
}

function read(): LibDoc[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Record<string, unknown>[]).map(migrateDoc) : [];
  } catch {
    return [];
  }
}

function write(list: LibDoc[]) {
  window.localStorage.setItem(KEY, JSON.stringify(list));
}

const BO_LIB_IDS_KEY = "dost_bo_lib_ids";

/**
 * LIB ids the current user may also see as the designated Budget Officer —
 * those referenced by PPMPs routed to them. Maintained by the PPMP store during
 * sync so LIB visibility stays precise (no cross-account cache leaks).
 */
export function setBudgetOfficerLibIds(ids: string[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(BO_LIB_IDS_KEY, JSON.stringify(ids));
}

function budgetOfficerLibIds(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(BO_LIB_IDS_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

/** Whether the current user may view a LIB (owner/superadmin, a routing signatory, or Budget Officer for a PPMP-linked LIB). */
export function canViewLib(doc: Pick<LibDoc, "id" | "ownerId" | "supervisorId" | "budgetOfficerId" | "approvedById">): boolean {
  if (canViewOwned(doc.ownerId)) return true;
  const me = getCurrentUser();
  if (!me) return false;
  // A LIB routed to me at any stage is visible.
  if (doc.supervisorId === me.id || doc.budgetOfficerId === me.id || doc.approvedById === me.id) return true;
  return Boolean(me.isBudgetOfficer) && budgetOfficerLibIds().has(doc.id);
}

export function listLibs(): LibDoc[] {
  const list = read();
  // Only surface documents the current user is allowed to see.
  return list.filter((d) => canViewLib(d)).sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
}

export function getLib(id: string): LibDoc | undefined {
  const doc = read().find((d) => d.id === id);
  return doc && canViewLib(doc) ? doc : undefined;
}

function writeLibToCache(doc: LibDoc): LibDoc {
  const list = read();
  const idx = list.findIndex((d) => d.id === doc.id);
  const me = getCurrentUser();
  // Preserve the original owner; stamp the current user on first save if unset.
  const updated: LibDoc = {
    ...doc,
    ownerId: doc.ownerId ?? me?.id,
    ownerName: doc.ownerName ?? me?.name,
    updatedAt: new Date().toISOString(),
  };
  if (idx >= 0) list[idx] = updated;
  else list.unshift(updated);
  write(list);
  return updated;
}

export function saveLib(doc: LibDoc): LibDoc {
  const updated = writeLibToCache(doc);
  void apiUpsertPlanningLib<LibDoc>(updated).catch(() => undefined);
  return updated;
}

/** Save and AWAIT the server write — use before a workflow transition so content
 * lands before the status change (a fire-and-forget PUT could otherwise overwrite it). */
export async function saveLibNow(doc: LibDoc): Promise<LibDoc> {
  const updated = writeLibToCache(doc);
  await apiUpsertPlanningLib<LibDoc>(updated);
  return updated;
}

/** Deletes on the server first and only then drops the local copy, so a refusal (not the owner, not a draft,
 * linked PPMPs) leaves the LIB in place and reaches the caller as an error. */
export async function deleteLib(id: string): Promise<void> {
  await apiDeletePlanningLib(id);
  write(read().filter((d) => d.id !== id));
}

/** Merge a server copy of a LIB into the local cache (used after workflow actions). */
function mergeLib(doc: LibDoc) {
  const list = read();
  const idx = list.findIndex((d) => d.id === doc.id);
  if (idx >= 0) list[idx] = doc;
  else list.unshift(doc);
  write(list);
}

/** Preparer submits a Draft LIB into the routing chain (→ Supervisor). */
export async function submitLib(id: string): Promise<LibDoc> {
  const doc = migrateDoc((await apiSubmitPlanningLib<LibDoc>(id)) as unknown as Record<string, unknown>);
  mergeLib(doc);
  return doc;
}

/** Supervisor recommends a LIB (→ Budget Officer). */
export async function recommendLib(id: string, comment?: string): Promise<LibDoc> {
  const doc = migrateDoc((await apiRecommendPlanningLib<LibDoc>(id, comment)) as unknown as Record<string, unknown>);
  mergeLib(doc);
  return doc;
}

/** Budget Officer certifies fund availability on a LIB (→ Regional Director). */
export async function certifyLib(id: string, comment?: string): Promise<LibDoc> {
  const doc = migrateDoc((await apiCertifyPlanningLib<LibDoc>(id, comment)) as unknown as Record<string, unknown>);
  mergeLib(doc);
  return doc;
}

/** Regional Director gives final approval on a LIB. */
export async function approveLib(id: string, comment?: string): Promise<LibDoc> {
  const doc = migrateDoc((await apiApprovePlanningLib<LibDoc>(id, comment)) as unknown as Record<string, unknown>);
  mergeLib(doc);
  return doc;
}

/** Current-stage signatory returns a LIB to the preparer for revision. */
export async function returnLib(id: string, reason: string, comment?: string): Promise<LibDoc> {
  const doc = migrateDoc((await apiReturnPlanningLib<LibDoc>(id, reason, comment)) as unknown as Record<string, unknown>);
  mergeLib(doc);
  return doc;
}

export async function syncLibsFromDatabase(): Promise<LibDoc[]> {
  const docs = (await apiGetPlanningLibs<LibDoc>()).map((doc) => migrateDoc(doc as unknown as Record<string, unknown>));
  if (typeof window !== "undefined") write(docs);
  return listLibs();
}
