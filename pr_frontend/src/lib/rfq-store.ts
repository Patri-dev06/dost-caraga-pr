import { fmtAmount, parseAmount } from "./lib-store";

export { fmtAmount, parseAmount };

export interface RfqItem {
  id: string;
  itemNo: number;
  qty: number;
  unit: string;
  description: string;
  unitAbc: number;
  totalAbc: number;
  unitPrice: string;
  total: string;
}

export interface RfqDoc {
  id: string;
  prId: string;
  prNo: string;
  quotationNo: string;
  rfqDate: string;
  placeOfDelivery: string;
  estimatedBudget: number;
  openingDate: string;
  bacChairman: string;
  bacChairmanTitle: string;
  purpose: string;
  fundSource: string;
  items: RfqItem[];
  supplierName: string;
  supplierAddress: string;
  supplierBy: string;
  supplierContactNo: string;
  supplierTin: string;
  canvasser: string;
  bacAction: string;
  createdAt: string;
}

const KEY = "dost_rfqs";

function read(): RfqDoc[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as RfqDoc[]) : [];
  } catch {
    return [];
  }
}

function write(list: RfqDoc[]) {
  window.localStorage.setItem(KEY, JSON.stringify(list));
}

export function listAllRfqs(): RfqDoc[] {
  return read().sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export function listRfqsForPr(prId: string): RfqDoc[] {
  return read().filter((r) => r.prId === prId).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export function getRfq(id: string): RfqDoc | undefined {
  return read().find((r) => r.id === id);
}

export function saveRfq(doc: RfqDoc): RfqDoc {
  const list = read();
  const idx = list.findIndex((r) => r.id === doc.id);
  if (idx >= 0) list[idx] = doc;
  else list.unshift(doc);
  write(list);
  return doc;
}

export function deleteRfq(id: string) {
  write(read().filter((r) => r.id !== id));
}
