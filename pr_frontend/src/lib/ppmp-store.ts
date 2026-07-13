import { canViewOwned, fmtAmount, parseAmount } from "./lib-store";
import { apiDeletePlanningPpmp, apiGetPlanningPpmps, apiUpsertPlanningPpmp, getCurrentUser } from "./api";

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
}

export type PpmpStatus =
  | "Draft"
  | "Submitted to Budget Officer"
  | "Budget Officer Checked"
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
    status === "Approved" ||
    status === "Draft"
      ? status
      : "Draft";

  const revisionCount = typeof doc.revisionCount === "number" ? doc.revisionCount : 0;

  return { ...(doc as unknown as PpmpForLib), status: validStatus, revisionCount };
}

function write(list: PpmpForLib[]) {
  window.localStorage.setItem(KEY, JSON.stringify(list));
}

export function listPpmpsForLib(libId: string): PpmpForLib[] {
  return read()
    .filter((p) => p.libId === libId && canViewOwned(p.ownerId))
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export function listAllPpmps(): PpmpForLib[] {
  return read()
    .filter((p) => canViewOwned(p.ownerId))
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export function getPpmp(id: string): PpmpForLib | undefined {
  const doc = read().find((p) => p.id === id);
  return doc && canViewOwned(doc.ownerId) ? doc : undefined;
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
  }
  return libId ? listPpmpsForLib(libId) : listAllPpmps();
}
