import { canViewOwned, fmtAmount, parseAmount, setBudgetOfficerLibIds } from "./lib-store";
import {
  apiApprovePlanningPpmp,
  apiDeletePlanningPpmp,
  apiGetPlanningPpmps,
  apiReturnPlanningPpmp,
  apiUpsertPlanningPpmp,
  getCurrentUser,
  type PpmpReviewPayload,
} from "./api";

export { fmtAmount, parseAmount };

export interface PpmpItemRow {
  id: string;
  expense_category: string;
  expense_subcategory?: string;
  general_description: string;
  item_name: string;
  project_type: string;
  quantity_size: string;
  quantity: number;
  recommended_mode: string;
  pre_procurement_conference: string;
  procurement_start: string;
  procurement_end: string;
  delivery_period: string;
  source_of_funds: string;
  estimated_budget: number;
  supporting_documents: string;
  remarks: string;
  /** Budget Officer's per-item note, surfaced to the owner when returned. */
  reviewer_comment?: string;
}

export type PpmpStatus =
  | "Draft"
  | "Submitted to Budget Officer"
  | "Budget Officer Checked"
  | "Returned"
  | "Approved";

export interface PpmpForLib {
  id: string;
  libId: string;
  ppmpNo: string;
  status: PpmpStatus;
  revisionCount: number;
  fiscalYear: number;
  endUserUnit: string;
  documentType: "Indicative" | "Final";
  preparedByName: string;
  preparedByPosition: string;
  preparedByDate: string;
  budgetOfficerName: string;
  budgetOfficerPosition: string;
  budgetCertifiedDate: string;
  rows: PpmpItemRow[];
  formRows?: Record<string, unknown>[];
  totalBudget: number;
  ownerId?: number; // account that created this PPMP (visibility scope)
  ownerName?: string; // creator's name, for display
  budgetOfficerId?: number; // designated Budget Officer this PPMP is routed to
  reviewComment?: string; // Budget Officer's overall review note
  returnReason?: string; // reason captured when returned for revision
  approvedByName?: string; // who certified/approved it
  approvedAt?: string;
  approvalSignature?: string; // PNPKI / e-signature text (placeholder until PNPKI is wired)
  submittedAt?: string;
  createdAt: string;
}

const KEY = "dost_ppmps";

function read(): PpmpForLib[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Record<string, unknown>[]).map(migratePpmp) : [];
  } catch {
    return [];
  }
}

function migratePpmp(doc: Record<string, unknown>): PpmpForLib {
  const status = typeof doc.status === "string" ? doc.status : "Draft";
  const validStatus: PpmpStatus =
    status === "Submitted to Budget Officer" ||
    status === "Budget Officer Checked" ||
    status === "Returned" ||
    status === "Approved" ||
    status === "Draft"
      ? status
      : "Draft";

  const revisionCount = typeof doc.revisionCount === "number" ? doc.revisionCount : 0;

  return { ...(doc as unknown as PpmpForLib), status: validStatus, revisionCount };
}

/**
 * Who may see a PPMP: its owner (or a superadmin) always, plus the designated
 * Budget Officer for the PPMPs routed to them. The backend enforces the same
 * rule; this keeps the local cache from hiding a Budget Officer's review queue.
 */
export function canViewPpmp(doc: Pick<PpmpForLib, "ownerId" | "budgetOfficerId">): boolean {
  if (canViewOwned(doc.ownerId)) return true;
  const me = getCurrentUser();
  return me != null && doc.budgetOfficerId != null && doc.budgetOfficerId === me.id;
}

function write(list: PpmpForLib[]) {
  window.localStorage.setItem(KEY, JSON.stringify(list));
}

export function listPpmpsForLib(libId: string): PpmpForLib[] {
  return read()
    .filter((p) => p.libId === libId && canViewPpmp(p))
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export function listAllPpmps(): PpmpForLib[] {
  return read()
    .filter((p) => canViewPpmp(p))
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export function getPpmp(id: string): PpmpForLib | undefined {
  const doc = read().find((p) => p.id === id);
  return doc && canViewPpmp(doc) ? doc : undefined;
}

export function savePpmp(doc: PpmpForLib): PpmpForLib {
  const list = read();
  const idx = list.findIndex((p) => p.id === doc.id);
  const me = getCurrentUser();
  // Preserve the original owner; stamp the current user on first save if unset.
  const stamped: PpmpForLib = { ...doc, ownerId: doc.ownerId ?? me?.id, ownerName: doc.ownerName ?? me?.name };
  if (idx >= 0) list[idx] = stamped;
  else list.unshift(stamped);
  write(list);
  void apiUpsertPlanningPpmp<PpmpForLib>(stamped).catch(() => undefined);
  return stamped;
}

export function deletePpmp(id: string) {
  write(read().filter((p) => p.id !== id));
  void apiDeletePlanningPpmp(id).catch(() => undefined);
}

/** Merge a server copy of a PPMP into the local cache (used after review actions). */
function mergePpmp(doc: PpmpForLib) {
  const list = read();
  const idx = list.findIndex((p) => p.id === doc.id);
  if (idx >= 0) list[idx] = doc;
  else list.unshift(doc);
  write(list);
}

/** Budget Officer returns a submitted PPMP to its owner with comments. */
export async function returnPpmpForRevision(id: string, payload: PpmpReviewPayload): Promise<PpmpForLib> {
  const doc = migratePpmp((await apiReturnPlanningPpmp<PpmpForLib>(id, payload)) as unknown as Record<string, unknown>);
  mergePpmp(doc);
  return doc;
}

/** Budget Officer approves (certifies) a submitted PPMP. */
export async function approvePpmpAsBudgetOfficer(id: string, payload: PpmpReviewPayload): Promise<PpmpForLib> {
  const doc = migratePpmp((await apiApprovePlanningPpmp<PpmpForLib>(id, payload)) as unknown as Record<string, unknown>);
  mergePpmp(doc);
  return doc;
}

export function totalPpmpBudgetForLib(libId: string): number {
  return listPpmpsForLib(libId).reduce((sum, p) => sum + p.totalBudget, 0);
}

export async function syncPpmpsFromDatabase(libId?: string): Promise<PpmpForLib[]> {
  const existing = read();
  const docs = (await apiGetPlanningPpmps<PpmpForLib>(libId)).map((doc) => migratePpmp(doc as unknown as Record<string, unknown>));
  if (typeof window !== "undefined") {
    const syncedIds = new Set(docs.map((doc) => doc.id));
    const remaining = libId ? existing.filter((doc) => doc.libId !== libId || !syncedIds.has(doc.id)) : existing.filter((doc) => !syncedIds.has(doc.id));
    write([...docs, ...remaining]);
    refreshBudgetOfficerLibIds();
  }
  return libId ? listPpmpsForLib(libId) : listAllPpmps();
}

/** Record which LIBs the current user may see as Budget Officer (routed PPMPs). */
export function refreshBudgetOfficerLibIds(): void {
  const me = getCurrentUser();
  if (!me?.isBudgetOfficer) {
    setBudgetOfficerLibIds([]);
    return;
  }
  const ids = read()
    .filter((p) => p.budgetOfficerId === me.id && p.libId)
    .map((p) => p.libId);
  setBudgetOfficerLibIds([...new Set(ids)]);
}

/** All PPMPs routed to the current user (as Budget Officer) awaiting or past review. */
export function listPpmpsForBudgetOfficer(): PpmpForLib[] {
  const me = getCurrentUser();
  if (!me?.isBudgetOfficer) return [];
  return read()
    .filter((p) => p.budgetOfficerId === me.id && p.ownerId !== me.id)
    .sort((a, b) => ((a.submittedAt ?? a.createdAt) < (b.submittedAt ?? b.createdAt) ? 1 : -1));
}
