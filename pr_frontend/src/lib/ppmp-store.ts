import { fmtAmount, parseAmount } from "./lib-store";

export { fmtAmount, parseAmount };

export interface PpmpItemRow {
  id: string;
  expense_category: string;
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

export interface PpmpForLib {
  id: string;
  libId: string;
  ppmpNo: string;
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
  totalBudget: number;
  createdAt: string;
}

const KEY = "dost_ppmps";

function read(): PpmpForLib[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as PpmpForLib[]) : [];
  } catch {
    return [];
  }
}

function write(list: PpmpForLib[]) {
  window.localStorage.setItem(KEY, JSON.stringify(list));
}

export function listPpmpsForLib(libId: string): PpmpForLib[] {
  return read().filter((p) => p.libId === libId).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export function listAllPpmps(): PpmpForLib[] {
  return read().sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export function getPpmp(id: string): PpmpForLib | undefined {
  return read().find((p) => p.id === id);
}

export function savePpmp(doc: PpmpForLib): PpmpForLib {
  const list = read();
  const idx = list.findIndex((p) => p.id === doc.id);
  if (idx >= 0) list[idx] = doc;
  else list.unshift(doc);
  write(list);
  return doc;
}

export function deletePpmp(id: string) {
  write(read().filter((p) => p.id !== id));
}

export function totalPpmpBudgetForLib(libId: string): number {
  return listPpmpsForLib(libId).reduce((sum, p) => sum + p.totalBudget, 0);
}
