// Frontend-only persistence for Line Item Budgets (DOST Form 4).
// There is no backend LIB resource, so documents are stored in localStorage.

export type LibStatus =
  | "Draft"
  | "Pending Supervisor Review"
  | "Forwarded to Budget Officer"
  | "Pending Regional Director Approval"
  | "Approved";

export interface LibRow {
  id: string;
  label: string; // Object of Expenditure
  note: string; // middle notes column
  indent: 0 | 1 | 2; // 0 = section, 1 = group/line, 2 = sub-line
  header: boolean; // true = category header (bold, no amounts)
  approved: string; // numeric string
  reprogramming: string; // numeric string
  justification: string; // reprogramming justification (on-screen only, never printed)
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
  history?: LibSnapshot[]; // snapshots captured on each revision
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
export function libTotals(rows: LibRow[]) {
  return rows.reduce(
    (acc, r) => {
      if (!r.header) {
        acc.approved += parseAmount(r.approved);
        acc.reprogramming += parseAmount(r.reprogramming);
      }
      return acc;
    },
    { approved: 0, reprogramming: 0 },
  );
}

function row(
  label: string,
  opts: { note?: string; indent?: 0 | 1 | 2; header?: boolean; approved?: number; reprogramming?: number; justification?: string } = {},
): LibRow {
  return {
    id: newRowId(),
    label,
    note: opts.note ?? "",
    indent: opts.indent ?? 1,
    header: opts.header ?? false,
    approved: opts.approved != null ? String(opts.approved) : "",
    reprogramming: opts.reprogramming != null ? String(opts.reprogramming) : "",
    justification: opts.justification ?? "",
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

export function newLibDoc(): LibDoc {
  const now = new Date().toISOString();
  return { id: newLibId(), status: "Draft", history: [], createdAt: now, updatedAt: now, ...defaultLibContent() };
}

function read(): LibDoc[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as LibDoc[]) : [];
  } catch {
    return [];
  }
}

function write(list: LibDoc[]) {
  window.localStorage.setItem(KEY, JSON.stringify(list));
}

export function listLibs(): LibDoc[] {
  const list = read();
  if (list.length === 0) {
    // Seed one example (the DOST Form 4 sample) so the list isn't empty.
    const now = new Date().toISOString();
    const seed: LibDoc = { id: newLibId(), status: "Approved", createdAt: now, updatedAt: now, ...defaultLibContent() };
    write([seed]);
    return [seed];
  }
  return list.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
}

export function getLib(id: string): LibDoc | undefined {
  return read().find((d) => d.id === id);
}

export function saveLib(doc: LibDoc): LibDoc {
  const list = read();
  const idx = list.findIndex((d) => d.id === doc.id);
  const updated: LibDoc = { ...doc, updatedAt: new Date().toISOString() };
  if (idx >= 0) list[idx] = updated;
  else list.unshift(updated);
  write(list);
  return updated;
}

export function deleteLib(id: string) {
  write(read().filter((d) => d.id !== id));
}
