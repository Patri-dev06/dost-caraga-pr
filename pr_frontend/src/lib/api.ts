import type { PRItem, PurchaseRequest, ValidationCheck } from "@/lib/mock-data";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "/api/v1";
const TOKEN_KEY = "pr_backend_token";
const TOKEN_EXPIRES_AT_KEY = "pr_backend_token_expires_at";
const TOKEN_LAST_ACTIVITY_KEY = "pr_backend_token_last_activity_at";
const CURRENT_USER_KEY = "pr_backend_current_user";
const AUTH_IDLE_TIMEOUT_MS = Number(import.meta.env.VITE_AUTH_IDLE_TIMEOUT_MINUTES ?? 30) * 60 * 1000;
const PHILIPPINE_TIME_ZONE = "Asia/Manila";
export const AUTH_EXPIRED_EVENT = "pr_backend_auth_expired";
export const CURRENT_USER_EVENT = "pr_backend_current_user_changed";

type ApiList<T> = { data: T[] };
type ApiRecord<T> = { data: T };

export type UserTier = "superadmin" | "admin" | "regular";

export type UserRecord = {
  id: number;
  name: string;
  email: string;
  office: string;
  officeId: number | null;
  roles: string[];
  status: string;
  tier: UserTier;
  modules: string[]; // Superadmin-granted toggleable modules (regular accounts)
  accessModules: string[]; // effective modules the user can reach
  lastLogin: string;
};

/** The signed-in user, persisted client-side for gating the UI. */
export type CurrentUser = {
  id: number;
  name: string;
  email: string;
  tier: UserTier;
  modules: string[]; // effective modules (access_modules)
  office: string;
  position: string;
  isBudgetOfficer: boolean; // designated Budget Officer for PPMP/LIB fund certification
  isRegionalDirector: boolean; // designated Regional Director for LIB final approval
  isBacChair: boolean; // designated BAC Chairman: reviews Abstracts of Canvas
  isBacViceChair: boolean; // designated BAC Vice-Chairman: reviews Abstracts of Canvas
  isSupplyOfficer: boolean; // designated Supply Officer: counter-signs RFQs, notes the lowest bidder
  isTwgLead: boolean; // designated TWG Lead: evaluates equipment, answers BAC remarks, rates venues
  hasSignature: boolean; // an e-signature is uploaded (required to sign/approve)
};

export type RoleRecord = {
  id: number;
  name: string;
  desc: string;
  perms: string[];
};

export type AuditLogRecord = {
  id: number;
  ts: string;
  actor: string;
  role: string;
  module: string;
  action: string;
  target: string;
  ip: string;
};

export type SystemPreferenceRecord = {
  key: string;
  value: string | number | boolean | null;
  category: string;
  label: string;
  description?: string | null;
  type: "text" | "number" | "boolean";
};

export type PpmpRecord = {
  id: number;
  code: string;
  item: string;
  category: string;
  qty: number;
  estCost: number;
  schedule: string;
  documentId?: number | null;
  rowNumber?: number | null;
  objective?: string | null;
  projectType?: string | null;
  quantitySize?: string | null;
  recommendedMode?: string | null;
  preProcurementConference?: string | null;
  procurementStart?: string | null;
  procurementEnd?: string | null;
  deliveryPeriod?: string | null;
  sourceOfFunds?: string | null;
  supportingDocuments?: string | null;
  remarks?: string | null;
};

export type PpmpDocumentRecord = {
  id: number;
  projectId: number;
  projectTitle: string;
  ppmpNo: string;
  fiscalYear: number;
  endUserUnit: string;
  documentType: "Indicative" | "Final";
  sourceFilename: string;
  preparedSubmittedByName: string;
  preparedSubmittedByPosition: string;
  preparedSubmittedByDate: string;
  budgetOfficerName: string;
  budgetOfficerPosition: string;
  budgetCertifiedDate: string;
  totalEstimatedBudget: number;
  rowCount: number;
  importedAt: string;
  items: PpmpRecord[];
};

export type AppCseRecord = {
  id: number;
  code: string;
  item: string;
  uom: string;
  qty: number;
  unitPrice: number;
  fiscalYear: number | null;
  isConsolidated: boolean;
};

export type AppNonCseRecord = {
  id: number;
  code: string;
  item: string;
  category: string;
  qty: number;
  estCost: number;
  fiscalYear: number | null;
  isConsolidated: boolean;
};

export type BudgetRecord = {
  id: number;
  code: string;
  account: string;
  allocated: number;
  obligated: number;
};

export type BudgetCreatePayload = {
  account_code: string;
  account_name: string;
  allocated_amount: number;
  obligated_amount?: number;
};

export type PurchaseRequestCreatePayload = {
  office?: string;
  office_code?: string;
  fundSource?: string;
  fund_source?: string;
  projectTitle?: string;
  project_code?: string;
  requestedBy?: number | null;
  requested_by?: number | null;
  modeOfProcurement?: string;
  mode_of_procurement?: string;
  purpose: string;
  /** "Charged to": the planning PPMP's client uid. Its class decides the flowchart's "Regular fund?". */
  ppmp_client_uid?: string | null;
  submit?: boolean;
  items: Array<{
    name: string;
    description?: string;
    uom: string;
    qty?: number;
    quantity?: number;
    unitCost?: number;
    unit_cost?: number;
  }>;
};

export type PpmpCreatePayload = {
  code?: string;
  item_name: string;
  category?: string;
  uom?: string;
  quantity: number;
  estimated_unit_cost: number;
  schedule?: string;
};

export type PpmpImportRow = {
  row_number?: number;
  code?: string;
  expense_category?: string;
  general_description?: string;
  project_type?: string;
  item_name: string;
  uom?: string;
  quantity?: number;
  quantity_size?: string;
  recommended_mode?: string;
  pre_procurement_conference?: string;
  procurement_start?: string;
  procurement_end?: string;
  delivery_period?: string;
  source_of_funds?: string;
  estimated_budget?: number;
  supporting_documents?: string;
  remarks?: string;
};

export type PpmpDocumentCreatePayload = {
  document: {
    ppmp_no?: string;
    fiscal_year: number;
    end_user_unit?: string;
    document_type: "Indicative" | "Final";
    source_filename?: string;
    prepared_submitted_by_name?: string;
    prepared_submitted_by_position?: string;
    prepared_submitted_by_date?: string;
    budget_officer_name?: string;
    budget_officer_position?: string;
    budget_certified_date?: string;
  };
  rows: PpmpImportRow[];
};

export type AppCseCreatePayload = {
  code?: string;
  item_name: string;
  category?: string;
  uom?: string;
  quantity: number;
  unit_price: number;
};

export type AppNonCseCreatePayload = {
  code?: string;
  item_name: string;
  category?: string;
  uom?: string;
  quantity: number;
  estimated_cost: number;
};

export function getToken() {
  if (typeof window === "undefined") return null;
  const token = window.localStorage.getItem(TOKEN_KEY);
  const expiresAt = Number(window.localStorage.getItem(TOKEN_EXPIRES_AT_KEY) ?? 0);
  const lastActivityAt = Number(window.localStorage.getItem(TOKEN_LAST_ACTIVITY_KEY) ?? 0);

  if (!token) return null;

  if (expiresAt && Date.now() >= expiresAt) {
    clearToken();
    return null;
  }

  if (AUTH_IDLE_TIMEOUT_MS > 0 && lastActivityAt && Date.now() - lastActivityAt >= AUTH_IDLE_TIMEOUT_MS) {
    clearToken();
    return null;
  }

  return token;
}

export function setToken(token: string, expiresInSeconds?: number) {
  window.localStorage.setItem(TOKEN_KEY, token);
  recordAuthActivity();

  if (expiresInSeconds) {
    window.localStorage.setItem(TOKEN_EXPIRES_AT_KEY, String(Date.now() + expiresInSeconds * 1000));
  }
}

export function getAuthIdleTimeoutMs() {
  return AUTH_IDLE_TIMEOUT_MS;
}

export function recordAuthActivity() {
  if (typeof window === "undefined" || !window.localStorage.getItem(TOKEN_KEY)) return;

  window.localStorage.setItem(TOKEN_LAST_ACTIVITY_KEY, String(Date.now()));
}

export function clearToken() {
  window.localStorage.removeItem(TOKEN_KEY);
  window.localStorage.removeItem(TOKEN_EXPIRES_AT_KEY);
  window.localStorage.removeItem(TOKEN_LAST_ACTIVITY_KEY);
  clearCurrentUser();
}

export function hasValidToken() {
  return Boolean(getToken());
}

export function getCurrentUser(): CurrentUser | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(CURRENT_USER_KEY);
    return raw ? (JSON.parse(raw) as CurrentUser) : null;
  } catch {
    return null;
  }
}

export function setCurrentUser(user: CurrentUser) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(user));
  window.dispatchEvent(new CustomEvent(CURRENT_USER_EVENT));
}

export function clearCurrentUser() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(CURRENT_USER_KEY);
  window.dispatchEvent(new CustomEvent(CURRENT_USER_EVENT));
}

export async function login(email: string, password: string) {
  const result = await request<{ token: string; expires_in: number; user: BackendUser }>("/auth/login", {
    method: "POST",
    body: { email, password },
    auth: false,
  });
  setToken(result.token, result.expires_in);
  setCurrentUser(mapCurrentUser(result.user));
  return result;
}

export type PublicOffice = { id: number; name: string; code: string };

export type RegisterPayload = {
  name: string;
  email: string;
  password: string;
  position: string;
  office_id: number;
};

/** Public office list for the registration form (no auth required). */
export async function apiPublicOffices(): Promise<PublicOffice[]> {
  const result = await request<{ data: PublicOffice[] }>("/auth/offices", { auth: false });
  return result.data;
}

/** Register a new (Pending) account. Requires admin activation before sign-in. */
export async function register(payload: RegisterPayload) {
  return request<{ message: string }>("/auth/register", {
    method: "POST",
    body: payload,
    auth: false,
  });
}

/** Refresh the signed-in user from the backend (source of truth for tier/modules). */
export async function apiMe(): Promise<CurrentUser> {
  const result = await request<{ data: BackendUser }>("/auth/me");
  const user = mapCurrentUser(result.data);
  setCurrentUser(user);
  return user;
}

/** Self-service profile update (name / email / position). */
export async function apiUpdateProfile(payload: { name?: string; email?: string; position?: string }): Promise<CurrentUser> {
  const result = await request<{ data: BackendUser }>("/auth/me", { method: "PUT", body: payload });
  const user = mapCurrentUser(result.data);
  setCurrentUser(user);
  return user;
}

export async function logout() {
  const token = getToken();

  try {
    if (token) {
      await fetch(`${API_BASE_URL}/auth/logout`, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });
    }
  } finally {
    expireAuthSession();
  }
}

export async function apiGetPurchaseRequests() {
  const result = await request<ApiList<BackendPurchaseRequest>>("/purchase-requests");
  return result.data.map(mapPurchaseRequest);
}

/** One page of a server-paginated list — carries the total/last-page counts, unlike a plain array. */
export type Page<T> = {
  items: T[];
  page: number;
  perPage: number;
  total: number;
  lastPage: number;
};

/** @deprecated kept as an alias — existing code refers to this as PurchaseRequestPage. */
export type PurchaseRequestPage = Page<PurchaseRequest>;

type BackendPaginated<T> = { data: T[]; current_page: number; per_page: number; total: number; last_page: number };

/** Fetches one page from an endpoint that returns Laravel's paginator shape, mapping each raw item. */
async function fetchPage<Raw, T>(path: string, mapItem: (raw: Raw) => T): Promise<Page<T>> {
  const result = await request<BackendPaginated<Raw>>(path);
  return {
    items: result.data.map(mapItem),
    page: result.current_page,
    perPage: result.per_page,
    total: result.total,
    lastPage: result.last_page,
  };
}

/**
 * The signed-in user's own PRs (whatever their role), one page at a time — for the dashboard's
 * "My Purchase Requests" widget. Always asks the server for just this page, never the whole list,
 * so it stays cheap no matter how many PRs pile up over time.
 */
export async function apiGetMyPurchaseRequestsPage(page: number, perPage = 5): Promise<PurchaseRequestPage> {
  return fetchPage<BackendPurchaseRequest, PurchaseRequest>(
    `/purchase-requests?mine=1&page=${page}&per_page=${perPage}`,
    mapPurchaseRequest,
  );
}

/** The main Purchase Requests list, one page at a time (never the whole table). */
export async function apiGetPurchaseRequestsPage(page: number, perPage = 20, status?: string): Promise<Page<PurchaseRequest>> {
  const params = new URLSearchParams({ page: String(page), per_page: String(perPage) });
  if (status) params.set("status", status);
  return fetchPage<BackendPurchaseRequest, PurchaseRequest>(`/purchase-requests?${params.toString()}`, mapPurchaseRequest);
}

/**
 * One row per PR, traced through RFQ -> AOC -> PO for whichever columns already have real data.
 * The rest (ORS/BURS, delivery, inspection, issuance, payment) are kept by hand by the Supply team
 * and arrive in `manual`, keyed like MONITORING_FIELDS.
 */
export type MonitoringRow = {
  prId: string;
  date: string | null;
  endUserUnit: string | null;
  charging: string | null;
  prNo: string | null;
  description: string | null;
  purpose: string | null;
  amount: number;
  prSignatories: string | null;
  prRemarks: string | null;
  rfqNo: string | null;
  rfqOutForSignature: string | null;
  rfqInWithSignature: string | null;
  rfqOut: string | null;
  quotationRoutedBy: string | null;
  inWithQuotation: string | null;
  suppliers: string | null;
  rfqRemarks: string | null;
  aocOut: string | null;
  aocInWithSignature: string | null;
  bacMemberWhoSigned: string | null;
  aocRemarks: string | null;
  awardedSupplier: string | null;
  poNo: string | null;
  amountAwarded: number | null;
  poOutToBudget: string | null;
  poApprovedAt: string | null;
  poConformedAt: string | null;
  poRemarks: string | null;
  prStatus: string | null;
  sdAttached: string | null; // Supplementary Documents attached at submission, e.g. "PPMP, LIB"
  manual: MonitoringManualValues;
  canEdit: boolean;
};

/** The Supply team's hand-kept cells: dates as YYYY-MM-DD, date-times as YYYY-MM-DDTHH:mm. */
export type MonitoringManualValues = Record<string, string | number>;

type BackendMonitoringRow = {
  pr_id: number;
  date: string | null;
  end_user_unit: string | null;
  charging: string | null;
  pr_no: string | null;
  description: string | null;
  purpose: string | null;
  amount: number | string;
  pr_signatories: string | null;
  pr_remarks: string | null;
  rfq_no: string | null;
  rfq_out_for_signature: string | null;
  rfq_in_with_signature: string | null;
  rfq_out: string | null;
  quotation_routed_by: string | null;
  in_with_quotation: string | null;
  suppliers: string | null;
  rfq_remarks: string | null;
  aoc_out: string | null;
  aoc_in_with_signature: string | null;
  bac_member_who_signed: string | null;
  aoc_remarks: string | null;
  awarded_supplier: string | null;
  po_no: string | null;
  amount_awarded: number | string | null;
  po_out_to_budget: string | null;
  po_approved_at: string | null;
  po_conformed_at?: string | null;
  po_remarks?: string | null;
  pr_status?: string | null;
  sd_attached?: string | null;
  manual?: MonitoringManualValues;
  can_edit?: boolean;
};

function mapMonitoringRow(row: BackendMonitoringRow): MonitoringRow {
  return {
    prId: String(row.pr_id),
    date: row.date,
    endUserUnit: row.end_user_unit || null,
    charging: row.charging,
    prNo: row.pr_no,
    description: row.description || null,
    purpose: row.purpose,
    amount: Number(row.amount),
    prSignatories: row.pr_signatories,
    prRemarks: row.pr_remarks,
    rfqNo: row.rfq_no,
    rfqOutForSignature: row.rfq_out_for_signature,
    rfqInWithSignature: row.rfq_in_with_signature,
    rfqOut: row.rfq_out,
    quotationRoutedBy: row.quotation_routed_by,
    inWithQuotation: row.in_with_quotation,
    suppliers: row.suppliers || null,
    rfqRemarks: row.rfq_remarks,
    aocOut: row.aoc_out,
    aocInWithSignature: row.aoc_in_with_signature,
    bacMemberWhoSigned: row.bac_member_who_signed,
    aocRemarks: row.aoc_remarks,
    awardedSupplier: row.awarded_supplier,
    poNo: row.po_no,
    amountAwarded: row.amount_awarded == null ? null : Number(row.amount_awarded),
    poOutToBudget: row.po_out_to_budget,
    poApprovedAt: row.po_approved_at,
    poConformedAt: row.po_conformed_at ?? null,
    poRemarks: row.po_remarks ?? null,
    prStatus: row.pr_status ?? null,
    sdAttached: row.sd_attached ?? null,
    manual: row.manual ?? {},
    canEdit: row.can_edit ?? false,
  };
}

/**
 * A Supplementary Document (SD) attached to a PR when it was submitted: a frozen copy of its PPMP or
 * LIB as it stood then. `snapshot` holds that copy (PPMP items, or LIB rows).
 */
export type PrSupportingDocument = {
  id: string;
  type: "PPMP" | "LIB" | string;
  typeLabel: string;
  reference: string | null;
  title: string | null;
  total: number;
  attachedAt: string | null;
  attachedBy: string | null;
  snapshot: Record<string, unknown>;
};

export async function apiGetPrSupportingDocuments(prId: string): Promise<PrSupportingDocument[]> {
  const result = await request<{ data: Record<string, unknown>[] }>(`/purchase-requests/${prId}/supporting-documents`);
  return result.data.map((d) => ({
    id: String(d.id),
    type: String(d.type),
    typeLabel: String(d.type_label ?? d.type),
    reference: (d.reference as string | null) ?? null,
    title: (d.title as string | null) ?? null,
    total: Number(d.total ?? 0),
    attachedAt: (d.attached_at as string | null) ?? null,
    attachedBy: (d.attached_by as string | null) ?? null,
    snapshot: (d.snapshot as Record<string, unknown>) ?? {},
  }));
}

/** One step of a PR's procurement flow: done, current (waiting on someone), still missing, or stopped. */
export type PrProgressStep = {
  key: string;
  phase: "PR" | "RFQ" | "AOC" | "PO" | "Delivery" | "Payment" | string;
  label: string;
  waitingOn: string;
  status: "done" | "current" | "pending" | "stopped";
  at: string | null;
  detail: string | null;
};

export type PrNextStep = { label: string; waitingOn: string; detail: string | null };

export type PrProgress = { steps: PrProgressStep[]; done: number; total: number; stopped: string | null; next: PrNextStep | null };

const mapNext = (n: Record<string, unknown> | null | undefined): PrNextStep | null =>
  n ? { label: String(n.label), waitingOn: String(n.waiting_on ?? ""), detail: (n.detail as string | null) ?? null } : null;

/** Every step of one PR's flow — from submission through RFQ, AOC, PO, delivery and payment. */
export async function apiGetPrProgress(prId: string): Promise<PrProgress> {
  const { data } = await request<{ data: Record<string, unknown> }>(`/purchase-requests/${prId}/progress`);
  return {
    steps: (data.steps as Record<string, unknown>[]).map((s) => ({
      key: String(s.key), phase: String(s.phase), label: String(s.label), waitingOn: String(s.waiting_on ?? ""),
      status: s.status as PrProgressStep["status"], at: (s.at as string | null) ?? null, detail: (s.detail as string | null) ?? null,
    })),
    done: Number(data.done),
    total: Number(data.total),
    stopped: (data.stopped as string | null) ?? null,
    next: mapNext(data.next as Record<string, unknown> | null),
  };
}

/** One of the signed-in user's own PRs, with where it stands. */
export type MySubmission = {
  id: string;
  prNo: string;
  purpose: string;
  status: string;
  createdAt: string | null;
  submittedAt: string | null;
  amount: number;
  itemCount: number;
  progress: { done: number; total: number; stopped: string | null; next: PrNextStep | null; phase: string | null };
};

/** "My Submissions": the PRs the signed-in user filed (never anyone else's), one page at a time. */
export async function apiGetMySubmissionsPage(page: number, perPage = 10, status?: string): Promise<Page<MySubmission>> {
  const params = new URLSearchParams({ page: String(page), per_page: String(perPage) });
  if (status) params.set("status", status);
  return fetchPage<Record<string, unknown>, MySubmission>(`/purchase-requests/my-submissions?${params.toString()}`, (r) => {
    const p = r.progress as Record<string, unknown>;
    return {
      id: String(r.id),
      prNo: String(r.pr_no ?? ""),
      purpose: String(r.purpose ?? ""),
      status: String(r.status ?? ""),
      createdAt: (r.created_at as string | null) ?? null,
      submittedAt: (r.submitted_at as string | null) ?? null,
      amount: Number(r.amount ?? 0),
      itemCount: Number(r.item_count ?? 0),
      progress: {
        done: Number(p.done), total: Number(p.total), stopped: (p.stopped as string | null) ?? null,
        next: mapNext(p.next as Record<string, unknown> | null), phase: (p.phase as string | null) ?? null,
      },
    };
  });
}

/** Narrows the Monitoring Sheet: one period at most (a day, a month or a year of the PR's DATE). */
export type MonitoringFilters = {
  search?: string;
  status?: string;
  stage?: string; // a key of the dashboard's PR stages (DashboardStage.key)
  date?: string; // YYYY-MM-DD
  month?: string; // YYYY-MM
  year?: string; // YYYY
};

/** The Procurement Monitoring Sheet, one page at a time — never the whole PR table. */
export async function apiGetPurchaseRequestMonitoringPage(page: number, perPage = 20, filters: MonitoringFilters = {}): Promise<Page<MonitoringRow>> {
  const params = new URLSearchParams({ page: String(page), per_page: String(perPage) });
  for (const [key, value] of Object.entries(filters)) {
    if (value) params.set(key, value);
  }
  return fetchPage<BackendMonitoringRow, MonitoringRow>(`/purchase-requests/monitoring?${params.toString()}`, mapMonitoringRow);
}

/** Saves the Supply team's hand-kept cells on one PR's row; a blank value clears that cell. */
export async function apiUpdateMonitoringEntry(prId: string, values: Record<string, string | number | null>) {
  const result = await request<ApiRecord<BackendMonitoringRow> & { message: string }>(`/purchase-requests/${prId}/monitoring`, {
    method: "PUT",
    body: { values },
  });
  return { message: result.message, data: mapMonitoringRow(result.data) };
}

/** One stage of the procurement flow and how many of the user's PRs sit in it. */
export type DashboardStage = { key: string; label: string; count: number };

export type FollowUpList<T> = { total: number; items: T[] };

/** What the Supply team has to chase by hand, now that suppliers are contacted outside the system. */
export type DashboardFollowUps = {
  rfqRepliesDue: FollowUpList<{ rfqId: string; rfqNo: string | null; supplierName: string | null; contactNo: string | null; dueAt: string | null }>;
  posWithSupplier: FollowUpList<{ poId: string; poNo: string | null; supplierName: string | null; contactNo: string | null; forwardedAt: string | null }>;
  deliveriesDue: FollowUpList<{ prId: string; prNo: string | null; poNo: string | null; supplierName: string | null; dueDate: string | null }>;
};

export type DashboardSummary = {
  purchaseRequests: { count: number; amount: number };
  approvalsPending: number | null;
  rfqs: { count: number; canvassing: number } | null;
  purchaseOrders: { count: number; pending: number } | null;
  stages: DashboardStage[];
  followUps: DashboardFollowUps | null; // null unless the viewer is on the Supply team
  recentPurchaseRequests: { id: string; prNo: string; office: string | null; status: string; createdAt: string | null }[];
  recentRfqs: { id: string; rfqNo: string; prNo: string | null; status: string; createdAt: string | null }[];
};

type Raw = Record<string, unknown>;
const str = (v: unknown) => (v == null ? null : String(v));

/** The dashboard's counts, PR stages, Supply follow-ups and latest PRs/RFQs, in one call. */
export async function apiGetDashboardSummary(): Promise<DashboardSummary> {
  const { data } = await request<{ data: Raw }>("/dashboard/summary");
  const f = data.follow_ups as Record<string, { total: number; items: Raw[] }> | null;
  const list = <T,>(l: { total: number; items: Raw[] }, map: (r: Raw) => T): FollowUpList<T> => ({ total: l.total, items: l.items.map(map) });
  const pr = data.purchase_requests as { count: number; amount: number | string };

  return {
    purchaseRequests: { count: pr.count, amount: Number(pr.amount) },
    approvalsPending: (data.approvals_pending as number | null) ?? null,
    rfqs: (data.rfqs as DashboardSummary["rfqs"]) ?? null,
    purchaseOrders: (data.purchase_orders as DashboardSummary["purchaseOrders"]) ?? null,
    stages: data.stages as DashboardStage[],
    followUps: f
      ? {
          rfqRepliesDue: list(f.rfq_replies_due, (r) => ({ rfqId: String(r.rfq_id), rfqNo: str(r.rfq_no), supplierName: str(r.supplier_name), contactNo: str(r.contact_no), dueAt: str(r.due_at) })),
          posWithSupplier: list(f.pos_with_supplier, (r) => ({ poId: String(r.po_id), poNo: str(r.po_no), supplierName: str(r.supplier_name), contactNo: str(r.contact_no), forwardedAt: str(r.forwarded_at) })),
          deliveriesDue: list(f.deliveries_due, (r) => ({ prId: String(r.pr_id), prNo: str(r.pr_no), poNo: str(r.po_no), supplierName: str(r.supplier_name), dueDate: str(r.due_date) })),
        }
      : null,
    recentPurchaseRequests: (data.recent_purchase_requests as Raw[]).map((r) => ({
      id: String(r.id), prNo: String(r.pr_no ?? ""), office: str(r.office), status: String(r.status ?? ""), createdAt: str(r.created_at),
    })),
    recentRfqs: (data.recent_rfqs as Raw[]).map((r) => ({
      id: String(r.id), rfqNo: String(r.rfq_no ?? ""), prNo: str(r.pr_no), status: String(r.status ?? ""), createdAt: str(r.created_at),
    })),
  };
}

/** The full Approval Inbox queue, one page at a time. */
export async function apiGetApprovalsPage(page: number, perPage = 20): Promise<Page<PurchaseRequest>> {
  return fetchPage<BackendPurchaseRequest, PurchaseRequest>(
    `/approvals?page=${page}&per_page=${perPage}`,
    mapPurchaseRequest,
  );
}

/**
 * One fund source's shared item totals — what every live PR (any requester) has already drawn,
 * pre-summed on the server (grouped by item name/UOM), for PPMP balance checks. Never loads every
 * PR into the browser: pass `fundSource` and `excludePrId` (the PR being edited, if any) so the
 * server does the summing and returns only as many rows as there are distinct items.
 */
export type PurchaseRequestUsageItem = { name: string; uom: string; qty: number; amount: number };

export async function apiGetPurchaseRequestUsage(fundSource: string, excludePrId?: string | number): Promise<PurchaseRequestUsageItem[]> {
  const params = new URLSearchParams({ fund_source: fundSource });
  if (excludePrId) params.set("exclude_pr_id", String(excludePrId));
  const result = await request<{ data: { name: string; uom: string; quantity: string | number; amount: string | number }[] }>(
    `/purchase-requests/usage?${params.toString()}`,
  );
  return result.data.map((row) => ({ name: row.name, uom: row.uom, qty: Number(row.quantity), amount: Number(row.amount) }));
}

export async function apiGetPurchaseRequest(id: string | number) {
  const result = await request<ApiRecord<BackendPurchaseRequest>>(`/purchase-requests/${id}`);
  return mapPurchaseRequest(result.data);
}

export async function apiCreatePurchaseRequest(payload: PurchaseRequestCreatePayload) {
  const result = await request<ApiRecord<BackendPurchaseRequest>>("/purchase-requests", {
    method: "POST",
    body: payload,
  });
  return mapPurchaseRequest(result.data);
}

export async function apiUpdatePurchaseRequest(id: string | number, payload: PurchaseRequestCreatePayload) {
  const result = await request<ApiRecord<BackendPurchaseRequest>>(`/purchase-requests/${id}`, {
    method: "PUT",
    body: payload,
  });
  return mapPurchaseRequest(result.data);
}

export async function apiSubmitPurchaseRequest(id: string | number) {
  const result = await request<ApiRecord<BackendPurchaseRequest> & { message: string }>(`/purchase-requests/${id}/submit`, {
    method: "POST",
  });
  return mapPurchaseRequest(result.data);
}

/** Flowchart "Notify End-user to Re-PR": copies a cancelled PR into a new Draft for its requester. */
export async function apiRePurchaseRequest(id: string | number) {
  const result = await request<ApiRecord<BackendPurchaseRequest> & { message: string }>(`/purchase-requests/${id}/re-pr`, { method: "POST" });
  return { message: result.message, data: mapPurchaseRequest(result.data) };
}

export async function apiValidatePurchaseRequest(id: string | number) {
  const result = await request<{ data: BackendValidation[] }>(`/purchase-requests/${id}/validate`, {
    method: "POST",
  });
  return result.data.map(mapValidation);
}

/**
 * `limit` returns a flat, capped list for a dashboard preview. Without it, the full inbox is
 * fetched — the server caps this at 100/request regardless (real pagination underneath), so it
 * never pulls the whole queue unbounded; `perPage` lets a caller ask for fewer if it wants to.
 */
export async function apiGetApprovals(limit?: number, perPage = 100) {
  const query = limit ? `?limit=${limit}` : `?per_page=${perPage}`;
  const result = await request<ApiList<BackendPurchaseRequest>>(`/approvals${query}`);
  return result.data.map(mapPurchaseRequest);
}

export async function apiApprovalAction(id: string | number, action: "recommend" | "approve" | "reject", reason?: string) {
  return request<ApiRecord<BackendPurchaseRequest> & { message: string }>(`/approvals/${id}/${action}`, {
    method: "POST",
    body: action === "reject" ? { reason: reason || "Rejected from approval inbox." } : { remarks: reason },
  });
}

export async function apiGetUsers() {
  const result = await request<ApiList<BackendUser>>("/users");
  return result.data.map(mapUser);
}

export type Signatory = { id: number; name: string; tier: UserTier; position: string | null; roles: string[] };

/**
 * Approved accounts (status = Active) for signatory pickers — any signed-in user may read this.
 * `role` narrows it to holders of one role (an account may hold several), e.g. "BAC Chairman".
 */
export async function apiGetSignatories(role?: string): Promise<Signatory[]> {
  const query = role ? `?${new URLSearchParams({ role }).toString()}` : "";
  const result = await request<ApiList<{ id: number; name: string; tier?: UserTier; position?: string | null; roles?: string[] }>>(`/signatories${query}`);
  return result.data.map((u) => ({ id: u.id, name: u.name, tier: u.tier ?? "regular", position: u.position ?? null, roles: u.roles ?? [] }));
}

export type BudgetOfficer = { id: number; name: string; position: string; isCurrentUser: boolean };

/** The account designated as Budget Officer, used to certify fund availability on PPMPs. */
export async function apiGetBudgetOfficer(): Promise<BudgetOfficer | null> {
  const result = await request<{ data: BudgetOfficer | null }>("/budget-officer");
  return result.data;
}

export type WorkflowSignatory = { id: number; name: string; position: string; isCurrentUser: boolean };
export type WorkflowSignatories = {
  budgetOfficer: WorkflowSignatory | null;
  regionalDirector: WorkflowSignatory | null;
  bacChairman: WorkflowSignatory | null;
  bacViceChairman: WorkflowSignatory | null;
};

/** The designated routing signatories (Budget Officer, Regional Director, BAC Chair/Vice-Chair). */
export async function apiGetWorkflowSignatories(): Promise<WorkflowSignatories> {
  const result = await request<{ data: WorkflowSignatories }>("/workflow-signatories");
  return result.data;
}

export type AppNotification = {
  id: number;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  data: Record<string, unknown> | null;
  read: boolean;
  createdAt: string;
};

export async function apiGetNotifications(): Promise<{ items: AppNotification[]; unread: number }> {
  const result = await request<{ data: AppNotification[]; unread: number }>("/notifications");
  return { items: result.data, unread: result.unread };
}

export async function apiMarkNotificationRead(id: number): Promise<void> {
  await request<{ message: string }>(`/notifications/${id}/read`, { method: "POST" });
}

export async function apiMarkAllNotificationsRead(): Promise<void> {
  await request<{ message: string }>("/notifications/read-all", { method: "POST" });
}

export type PpmpReviewPayload = {
  reviewComment?: string;
  returnReason?: string;
  itemComments?: Record<string, string>;
};

/** Budget Officer returns a submitted PPMP to its owner for revision. */
export async function apiReturnPlanningPpmp<T = unknown>(id: string, payload: PpmpReviewPayload): Promise<T> {
  const result = await request<ApiRecord<T>>(`/planning-ppmps/${encodeURIComponent(id)}/return`, { method: "POST", body: payload });
  return result.data;
}

/** Budget Officer approves (certifies) a submitted PPMP. */
export async function apiApprovePlanningPpmp<T = unknown>(id: string, payload: PpmpReviewPayload): Promise<T> {
  const result = await request<ApiRecord<T>>(`/planning-ppmps/${encodeURIComponent(id)}/approve`, { method: "POST", body: payload });
  return result.data;
}

export async function apiUpdateUser(
  id: number,
  payload: { tier?: UserTier; modules?: string[] | null; status?: string; role_ids?: number[]; password?: string },
) {
  const result = await request<ApiRecord<BackendUser>>(`/users/${id}`, { method: "PUT", body: payload });
  return mapUser(result.data);
}

export async function apiGetRoles() {
  const result = await request<ApiList<BackendRole>>("/roles");
  return result.data.map(mapRole);
}

export async function apiGetAuditLogs() {
  const result = await request<ApiList<BackendAudit>>("/audit-logs");
  return result.data.map(mapAudit);
}

export async function apiGetSystemSettings() {
  const result = await request<ApiList<BackendSystemPreference>>("/system-settings");
  return result.data.map(mapSystemPreference);
}

export async function apiUpdateSystemSettings(settings: Array<Pick<SystemPreferenceRecord, "key" | "value">>) {
  const result = await request<ApiList<BackendSystemPreference>>("/system-settings", {
    method: "PUT",
    body: { settings },
  });
  return result.data.map(mapSystemPreference);
}

export async function apiGetPpmp(projectId = 1) {
  const result = await apiGetPpmpWorkspace(projectId);
  return result.entries;
}

export async function apiGetPpmpWorkspace(projectId = 1) {
  const result = await request<BackendPpmpIndex>(`/ppmp/${projectId}`);
  return {
    entries: result.data.map(mapPpmp),
    documents: (result.documents ?? []).map(mapPpmpDocument),
  };
}

export async function apiCreatePpmp(payload: PpmpCreatePayload, projectId = 1) {
  const result = await request<BackendPpmp>(`/ppmp/${projectId}`, {
    method: "POST",
    body: payload,
  });
  return mapPpmp(result);
}

export async function apiCreatePpmpDocument(payload: PpmpDocumentCreatePayload, projectId = 1) {
  const result = await request<ApiRecord<BackendPpmpDocument>>(`/ppmp/${projectId}/documents`, {
    method: "POST",
    body: payload,
  });
  return mapPpmpDocument(result.data);
}

/** The server caps this at 100/request regardless — this just keeps today's data volumes fully
 * visible without needing a "load more" control yet; the endpoint is real pagination underneath. */
export async function apiGetPlanningLibs<T = unknown>(): Promise<T[]> {
  const result = await request<ApiList<T>>("/planning-libs?per_page=100");
  return result.data;
}

/** The LIB list, one page at a time (raw docs — the caller migrates them, as syncLibsFromDatabase does). */
export async function apiGetPlanningLibsPage<T = unknown>(page: number, perPage = 20, status?: string): Promise<Page<T>> {
  const params = new URLSearchParams({ page: String(page), per_page: String(perPage) });
  if (status) params.set("status", status);
  return fetchPage<T, T>(`/planning-libs?${params.toString()}`, (raw) => raw);
}

export async function apiUpsertPlanningLib<T = unknown>(payload: T & { id?: string }): Promise<T> {
  const id = payload.id;
  const result = await request<ApiRecord<T>>(id ? `/planning-libs/${encodeURIComponent(id)}` : "/planning-libs", {
    method: id ? "PUT" : "POST",
    body: payload,
  });
  return result.data;
}

export async function apiDeletePlanningLib(id: string): Promise<void> {
  await request<{ message: string }>(`/planning-libs/${encodeURIComponent(id)}`, { method: "DELETE" });
}

// --- LIB routing workflow: preparer → supervisor → budget officer → regional director ---
export async function apiSubmitPlanningLib<T = unknown>(id: string): Promise<T> {
  const result = await request<ApiRecord<T>>(`/planning-libs/${encodeURIComponent(id)}/submit`, { method: "POST" });
  return result.data;
}

export async function apiRecommendPlanningLib<T = unknown>(id: string, comment?: string): Promise<T> {
  const result = await request<ApiRecord<T>>(`/planning-libs/${encodeURIComponent(id)}/recommend`, { method: "POST", body: { comment } });
  return result.data;
}

export async function apiCertifyPlanningLib<T = unknown>(id: string, comment?: string): Promise<T> {
  const result = await request<ApiRecord<T>>(`/planning-libs/${encodeURIComponent(id)}/certify`, { method: "POST", body: { comment } });
  return result.data;
}

export async function apiApprovePlanningLib<T = unknown>(id: string, comment?: string): Promise<T> {
  const result = await request<ApiRecord<T>>(`/planning-libs/${encodeURIComponent(id)}/approve`, { method: "POST", body: { comment } });
  return result.data;
}

export async function apiReturnPlanningLib<T = unknown>(id: string, reason: string, comment?: string): Promise<T> {
  const result = await request<ApiRecord<T>>(`/planning-libs/${encodeURIComponent(id)}/return`, { method: "POST", body: { reason, comment } });
  return result.data;
}

/** The server caps this at 100/request regardless — this just keeps today's data volumes fully
 * visible without needing a "load more" control yet; the endpoint is real pagination underneath. */
export async function apiGetPlanningPpmps<T = unknown>(libId?: string): Promise<T[]> {
  const params = new URLSearchParams({ per_page: "100" });
  if (libId) params.set("lib_id", libId);
  const result = await request<ApiList<T>>(`/planning-ppmps?${params.toString()}`);
  return result.data;
}

/** The PPMP list, one page at a time (raw docs — the caller migrates them, as syncPpmpsFromDatabase does). */
export async function apiGetPlanningPpmpsPage<T = unknown>(page: number, perPage = 20, libId?: string): Promise<Page<T>> {
  const params = new URLSearchParams({ page: String(page), per_page: String(perPage) });
  if (libId) params.set("lib_id", libId);
  return fetchPage<T, T>(`/planning-ppmps?${params.toString()}`, (raw) => raw);
}

export async function apiUpsertPlanningPpmp<T = unknown>(payload: T & { id?: string }): Promise<T> {
  const id = payload.id;
  const result = await request<ApiRecord<T>>(id ? `/planning-ppmps/${encodeURIComponent(id)}` : "/planning-ppmps", {
    method: id ? "PUT" : "POST",
    body: payload,
  });
  return result.data;
}

/** Starts a revision of an approved PPMP; returns the new draft revision. */
export async function apiRevisePlanningPpmp<T = unknown>(id: string, reason: string): Promise<{ message: string; data: T }> {
  return request<{ message: string; data: T }>(`/planning-ppmps/${encodeURIComponent(id)}/revise`, { method: "POST", body: { reason } });
}

export async function apiDeletePlanningPpmp(id: string): Promise<void> {
  await request<{ message: string }>(`/planning-ppmps/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export async function apiGetAppCse() {
  const result = await request<ApiList<BackendAppCse>>("/app-cse");
  return result.data.map(mapAppCse);
}

export async function apiCreateAppCse(payload: AppCseCreatePayload) {
  const result = await request<BackendAppCse>("/app-cse", {
    method: "POST",
    body: payload,
  });
  return mapAppCse(result);
}

export async function apiGetAppNonCse() {
  const result = await request<ApiList<BackendAppNonCse>>("/app-non-cse");
  return result.data.map(mapAppNonCse);
}

export async function apiCreateAppNonCse(payload: AppNonCseCreatePayload) {
  const result = await request<BackendAppNonCse>("/app-non-cse", {
    method: "POST",
    body: payload,
  });
  return mapAppNonCse(result);
}

export async function apiGetBudget(projectId = 1) {
  const result = await request<{ data: BackendBudget[] }>(`/budget/${projectId}`);
  return result.data.map(mapBudget);
}

export async function apiCreateBudget(payload: BudgetCreatePayload, projectId = 1) {
  const result = await request<BackendBudget>(`/budget/${projectId}`, {
    method: "POST",
    body: payload,
  });
  return mapBudget(result);
}

/**
 * Thrown for any non-OK API response. Carries the raw message for generic
 * `toast.error(error.message)` handling, plus (when the backend included them,
 * e.g. a PR save-as-draft-but-failed-validation response) the itemized
 * validation breakdown and the partially-saved record, so a caller that wants
 * to show more than the summary message can.
 */
export class ApiError extends Error {
  validation?: (ValidationCheck & { itemId?: string })[];
  data?: PurchaseRequest;

  constructor(message: string, options?: { validation?: (ValidationCheck & { itemId?: string })[]; data?: PurchaseRequest }) {
    super(message);
    this.name = "ApiError";
    this.validation = options?.validation;
    this.data = options?.data;
  }
}

async function request<T>(path: string, options: { method?: string; body?: unknown; auth?: boolean } = {}): Promise<T> {
  // File uploads (signed quotations) go as multipart; the browser sets that Content-Type itself.
  const isForm = typeof FormData !== "undefined" && options.body instanceof FormData;
  const headers: Record<string, string> = { Accept: "application/json" };
  if (!isForm) headers["Content-Type"] = "application/json";

  if (options.auth !== false) {
    const token = getToken();
    if (!token) {
      notifyAuthExpired();
      throw new Error("Please sign in to continue.");
    }
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: options.method ?? "GET",
    headers,
    body: isForm ? (options.body as FormData) : options.body ? JSON.stringify(options.body) : undefined,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));

    if (response.status === 401 && options.auth !== false) {
      notifyAuthExpired();
    }

    const validation = Array.isArray(error?.validation?.data) ? error.validation.data.map(mapValidation) : undefined;
    const data = error?.data && typeof error.data === "object" && "pr_no" in error.data ? mapPurchaseRequest(error.data) : undefined;

    // Laravel validation errors carry the field messages; show the first instead of the generic one.
    const firstFieldError = error?.errors && typeof error.errors === "object" ? (Object.values(error.errors)[0] as string[] | undefined)?.[0] : undefined;
    throw new ApiError(firstFieldError ?? error.message ?? `Backend request failed with HTTP ${response.status}.`, { validation, data });
  }

  return response.json();
}

function notifyAuthExpired() {
  if (typeof window === "undefined") return;

  expireAuthSession();
}

export function expireAuthSession() {
  if (typeof window === "undefined") return;

  clearToken();
  window.dispatchEvent(new CustomEvent(AUTH_EXPIRED_EVENT));
}

type BackendPurchaseRequest = {
  id: number;
  pr_no: string;
  office: string | BackendNamedRecord | null;
  fund_source: string | (BackendNamedRecord & { fund_type?: "GAA" | "Trust" | "Special" }) | null;
  fund_type?: "GAA" | "Trust" | "Special" | null;
  amount?: number;
  status: PurchaseRequest["status"];
  stage: string;
  date_submitted?: string | null;
  submitted_at?: string | null;
  requested_by: number | BackendNamedRecord | null;
  requester?: BackendNamedRecord | null;
  mode_of_procurement: string;
  project_title?: string | null;
  project?: (BackendNamedRecord & { title?: string | null }) | null;
  purpose: string;
  items: BackendPrItem[];
  validation?: BackendValidation[];
  approval_trail?: BackendApproval[];
  regular_fund?: boolean;
  identified_project?: string | null;
  ppmp_client_uid?: string | null;
  ppmp_class?: "Regular" | "Project" | null;
  cancelled_at?: string | null;
  cancel_reason?: string | null;
  cancelled_from?: "AOC" | "PO" | null;
  re_pr_of?: { id: number; pr_no: string } | null;
  re_pr?: { id: number; pr_no: string } | null;
};

type BackendNamedRecord = {
  id?: number;
  name?: string | null;
  position?: string | null;
  title?: string | null;
  code?: string | null;
  description?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type BackendPrItem = {
  id: number;
  name: string;
  description: string | null;
  uom: string;
  quantity: string | number;
  unit_cost: string | number;
};

type BackendValidation = {
  id?: number;
  purchase_request_item_id?: number | null;
  label: string;
  status: ValidationCheck["status"];
  message: string;
};

type BackendApproval = {
  id: number;
  role: string | null;
  action: string;
  remarks: string | null;
  created_at: string;
};

type BackendUser = {
  id: number;
  name: string;
  email: string;
  office?: { name: string } | null;
  office_id?: number | null;
  position?: string | null;
  roles?: BackendRole[];
  status: string;
  tier?: UserTier;
  modules?: string[] | null;
  access_modules?: string[];
  is_budget_officer?: boolean;
  is_regional_director?: boolean;
  is_bac_chair?: boolean;
  is_bac_vice_chair?: boolean;
  is_supply_officer?: boolean;
  is_twg_lead?: boolean;
  has_signature?: boolean;
  last_login_at: string | null;
};

type BackendRole = {
  id: number;
  name: string;
  description: string | null;
  permissions: string[] | null;
};

type BackendAudit = {
  id: number;
  created_at: string;
  actor_name: string | null;
  role: string | null;
  module: string;
  action: string;
  target: string | null;
  ip_address: string | null;
};

type BackendSystemPreference = {
  key: string;
  value: { value?: string | number | boolean | null } | string | number | boolean | null;
  category: string;
  label: string;
  description: string | null;
  type: "text" | "number" | "boolean";
};

type BackendPpmpIndex = {
  data: BackendPpmp[];
  documents?: BackendPpmpDocument[];
};

type BackendPpmp = {
  id: number;
  code: string | null;
  ppmp_document_id?: number | null;
  row_number?: number | null;
  expense_category?: string | null;
  general_description?: string | null;
  project_type?: string | null;
  quantity_size?: string | null;
  recommended_mode?: string | null;
  pre_procurement_conference?: string | null;
  procurement_start?: string | null;
  procurement_end?: string | null;
  delivery_period?: string | null;
  source_of_funds?: string | null;
  estimated_budget?: string | number | null;
  supporting_documents?: string | null;
  remarks?: string | null;
  quantity: string | number;
  estimated_unit_cost: string | number;
  schedule: string | null;
  item?: { name: string; category: string | null } | null;
};

type BackendPpmpDocument = {
  id: number;
  project_id: number;
  project_title?: string | null;
  ppmp_no: string | null;
  fiscal_year: string | number;
  end_user_unit: string | null;
  document_type: "Indicative" | "Final" | string;
  source_filename: string | null;
  prepared_submitted_by_name: string | null;
  prepared_submitted_by_position: string | null;
  prepared_submitted_by_date: string | null;
  budget_officer_name: string | null;
  budget_officer_position: string | null;
  budget_certified_date: string | null;
  total_estimated_budget: string | number;
  row_count: string | number;
  imported_at: string | null;
  items: BackendPpmp[];
};

type BackendAppCse = {
  id: number;
  code: string | null;
  quantity: string | number;
  unit_price: string | number;
  fiscal_year?: number | null;
  is_consolidated?: boolean;
  item?: { name: string; uom: string } | null;
};

type BackendAppNonCse = {
  id: number;
  code: string | null;
  quantity: string | number;
  estimated_cost: string | number;
  fiscal_year?: number | null;
  is_consolidated?: boolean;
  item?: { name: string; category: string | null } | null;
};

type BackendBudget = {
  id: number;
  account_code: string;
  account_name: string;
  allocated_amount: string | number;
  obligated_amount: string | number;
};

function mapPurchaseRequest(pr: BackendPurchaseRequest): PurchaseRequest {
  const amount = pr.amount ?? pr.items.reduce((sum, item) => sum + Number(item.quantity) * Number(item.unit_cost), 0);
  const fundType = pr.fund_type ?? (typeof pr.fund_source === "object" ? pr.fund_source?.fund_type : null) ?? "GAA";

  return {
    id: String(pr.id),
    prNo: pr.pr_no,
    office: textFromRelation(pr.office, "Unassigned"),
    fundSource: textFromRelation(pr.fund_source, "Unassigned"),
    fundType,
    amount: Number(amount),
    status: pr.status,
    dateSubmitted: dateOnly(pr.date_submitted ?? pr.submitted_at) ?? "Not submitted",
    requestedBy: textFromRelation(pr.requester ?? pr.requested_by, "Unassigned"),
    requestedByPosition: typeof (pr.requester ?? pr.requested_by) === "object" ? ((pr.requester ?? pr.requested_by) as BackendNamedRecord | null)?.position ?? "" : "",
    modeOfProcurement: pr.mode_of_procurement,
    projectTitle: pr.project_title ?? textFromRelation(pr.project, "No project assigned"),
    purpose: pr.purpose,
    items: pr.items.map(mapPrItem),
    stage: pr.stage,
    regularFund: pr.regular_fund,
    identifiedProject: pr.identified_project ?? null,
    ppmpClientUid: pr.ppmp_client_uid ?? null,
    ppmpClass: pr.ppmp_class ?? null,
    cancelledAt: pr.cancelled_at ?? null,
    cancelReason: pr.cancel_reason ?? null,
    cancelledFrom: pr.cancelled_from ?? null,
    rePrOf: pr.re_pr_of ? { id: String(pr.re_pr_of.id), prNo: pr.re_pr_of.pr_no } : null,
    rePr: pr.re_pr ? { id: String(pr.re_pr.id), prNo: pr.re_pr.pr_no } : null,
  };
}

function mapPrItem(item: BackendPrItem): PRItem {
  return {
    id: String(item.id),
    name: item.name,
    description: item.description ?? "",
    uom: item.uom,
    qty: Number(item.quantity),
    unitCost: Number(item.unit_cost),
  };
}

function mapValidation(result: BackendValidation): ValidationCheck & { itemId?: string } {
  return {
    itemId: result.purchase_request_item_id ? String(result.purchase_request_item_id) : undefined,
    label: result.label,
    status: result.status,
    message: result.message,
  };
}

export interface RfqItem {
  id: string;
  itemNo: number;
  qty: number;
  unit: string;
  description: string;
  unitAbc: number;
  totalAbc: number;
}

export interface RfqQuoteItem {
  rfqItemId: string;
  unitPrice: number | null;
  totalPrice: number | null;
  /** TWG "check each equipment with supplier": null until checked. */
  twgComplies: boolean | null;
  twgRemarks: string;
}

export interface RfqSupplier {
  id: string;
  supplierId: string | null;
  supplierName: string;
  supplierAddress: string;
  supplierContactNo: string;
  supplierTin: string;
  supplierBy: string;
  supplierEmail: string;
  status: string; // Pending | Sent | Replied | TimedOut | Replaced | Failed TWG | Cancelled
  sentAt: string;
  replyDueAt: string;
  repliedAt: string;
  isOverdue: boolean;
  isWinner: boolean;
  replacedBySupplierId: string | null;
  hasQuotation: boolean;
  quotationName: string;
  quoteSubmittedVia: string;
  twgResult: "Passed" | "Failed" | null;
  remarks: string;
  quoteItems: RfqQuoteItem[];
}

export interface Rfq {
  preparedByName: string;
  preparedByPosition: string;
  id: string;
  rfqNo: string;
  prId: string;
  prNo: string;
  procurementCategory: string;
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
  suppliers: RfqSupplier[];
  canvasser: string;
  bacAction: string;
  /** Flowchart order: Supply Officer counter-signs first, then ONE of the BAC Chairman / Vice-Chairman. */
  supplyOfficerSignedName: string;
  supplyOfficerSignedAt: string;
  bacSignedName: string;
  bacSignedRole: string;
  bacSignedAt: string;
  twgEvaluationNotes: string;
  /** Directory category the canvassed suppliers must come from: Goods (Goods/Equipment) or Services (Venue). */
  supplierCategory: "Goods" | "Services";
  /** Suppliers cancelled for not replying, or failed by the TWG, not yet replaced ("Choose n of supplier"). */
  openSupplierSlots: number;
  abstractOfCanvasId: string | null;
  abstractOfCanvasStatus: string | null;
  hasPurchaseOrder: boolean;
  status: string;
  stage: string;
  createdAt: string;
}

type BackendRfqItem = {
  id: number;
  purchase_request_item_id: number | null;
  item_no: number;
  description: string | null;
  uom: string | null;
  quantity: string | number;
  unit_abc: string | number;
  total_abc: string | number;
};

type BackendRfqQuoteItem = {
  rfq_item_id: number;
  unit_price: string | number | null;
  total_price: string | number | null;
  twg_complies?: boolean | null;
  twg_remarks?: string | null;
};

type BackendRfqSupplier = {
  id: number;
  supplier_id: number | null;
  supplier_name: string | null;
  supplier_address: string | null;
  supplier_contact_no: string | null;
  supplier_tin: string | null;
  supplier_by: string | null;
  supplier_email?: string | null;
  status: string;
  sent_at: string | null;
  reply_due_at: string | null;
  replied_at?: string | null;
  is_overdue: boolean;
  is_winner: boolean;
  replaced_by_supplier_id: number | null;
  has_quotation?: boolean;
  quotation_name?: string | null;
  quote_submitted_via?: string | null;
  twg_result?: "Passed" | "Failed" | null;
  remarks?: string | null;
  quote_items: BackendRfqQuoteItem[];
};

type BackendRfq = {
  prepared_by?: { name: string; position: string } | null;
  id: number;
  rfq_no: string;
  purchase_request_id: number;
  pr_no: string | null;
  procurement_category: string;
  quotation_no: string | null;
  rfq_date: string | null;
  opening_date: string | null;
  place_of_delivery: string | null;
  estimated_budget: string | number;
  bac_chairman: string | null;
  bac_chairman_title: string | null;
  purpose: string | null;
  fund_source: string | null;
  canvasser: string | null;
  bac_action: string | null;
  supply_officer_signed_name: string | null;
  supply_officer_signed_at: string | null;
  bac_signed_name?: string | null;
  bac_signed_role?: string | null;
  bac_signed_at?: string | null;
  twg_evaluation_notes?: string | null;
  supplier_category?: "Goods" | "Services";
  open_supplier_slots?: number;
  abstract_of_canvas_id: number | null;
  abstract_of_canvas_status: string | null;
  has_purchase_order: boolean;
  status: string;
  stage: string;
  date_submitted?: string | null;
  items: BackendRfqItem[];
  suppliers: BackendRfqSupplier[];
  created_at?: string | null;
};

function mapRfqItem(item: BackendRfqItem): RfqItem {
  return {
    id: String(item.id),
    itemNo: item.item_no,
    qty: Number(item.quantity),
    unit: item.uom ?? "",
    description: item.description ?? "",
    unitAbc: Number(item.unit_abc),
    totalAbc: Number(item.total_abc),
  };
}

function mapRfqQuoteItem(qi: BackendRfqQuoteItem): RfqQuoteItem {
  return {
    rfqItemId: String(qi.rfq_item_id),
    unitPrice: qi.unit_price === null || qi.unit_price === undefined ? null : Number(qi.unit_price),
    totalPrice: qi.total_price === null || qi.total_price === undefined ? null : Number(qi.total_price),
    twgComplies: qi.twg_complies ?? null,
    twgRemarks: qi.twg_remarks ?? "",
  };
}

function mapRfqSupplier(s: BackendRfqSupplier): RfqSupplier {
  return {
    id: String(s.id),
    supplierId: s.supplier_id !== null ? String(s.supplier_id) : null,
    supplierName: s.supplier_name ?? "",
    supplierAddress: s.supplier_address ?? "",
    supplierContactNo: s.supplier_contact_no ?? "",
    supplierTin: s.supplier_tin ?? "",
    supplierBy: s.supplier_by ?? "",
    supplierEmail: s.supplier_email ?? "",
    status: s.status,
    sentAt: s.sent_at ?? "",
    replyDueAt: s.reply_due_at ?? "",
    repliedAt: s.replied_at ?? "",
    isOverdue: s.is_overdue,
    isWinner: s.is_winner,
    replacedBySupplierId: s.replaced_by_supplier_id !== null ? String(s.replaced_by_supplier_id) : null,
    hasQuotation: Boolean(s.has_quotation),
    quotationName: s.quotation_name ?? "",
    quoteSubmittedVia: s.quote_submitted_via ?? "",
    twgResult: s.twg_result ?? null,
    remarks: s.remarks ?? "",
    quoteItems: s.quote_items.map(mapRfqQuoteItem),
  };
}

function mapRfq(rfq: BackendRfq): Rfq {
  return {
    preparedByName: rfq.prepared_by?.name ?? "",
    preparedByPosition: rfq.prepared_by?.position ?? "",
    id: String(rfq.id),
    rfqNo: rfq.rfq_no,
    prId: String(rfq.purchase_request_id),
    prNo: rfq.pr_no ?? "",
    procurementCategory: rfq.procurement_category,
    quotationNo: rfq.quotation_no ?? "",
    rfqDate: rfq.rfq_date ?? "",
    placeOfDelivery: rfq.place_of_delivery ?? "",
    estimatedBudget: Number(rfq.estimated_budget),
    openingDate: rfq.opening_date ?? "",
    bacChairman: rfq.bac_chairman ?? "",
    bacChairmanTitle: rfq.bac_chairman_title ?? "",
    purpose: rfq.purpose ?? "",
    fundSource: rfq.fund_source ?? "",
    items: rfq.items.map(mapRfqItem),
    suppliers: (rfq.suppliers ?? []).map(mapRfqSupplier),
    canvasser: rfq.canvasser ?? "",
    bacAction: rfq.bac_action ?? "",
    supplyOfficerSignedName: rfq.supply_officer_signed_name ?? "",
    supplyOfficerSignedAt: rfq.supply_officer_signed_at ?? "",
    bacSignedName: rfq.bac_signed_name ?? "",
    bacSignedRole: rfq.bac_signed_role ?? "",
    bacSignedAt: rfq.bac_signed_at ?? "",
    twgEvaluationNotes: rfq.twg_evaluation_notes ?? "",
    supplierCategory: rfq.supplier_category ?? (rfq.procurement_category === "Venue" ? "Services" : "Goods"),
    openSupplierSlots: rfq.open_supplier_slots ?? 0,
    abstractOfCanvasId: rfq.abstract_of_canvas_id !== null ? String(rfq.abstract_of_canvas_id) : null,
    abstractOfCanvasStatus: rfq.abstract_of_canvas_status,
    hasPurchaseOrder: rfq.has_purchase_order,
    status: rfq.status,
    stage: rfq.stage,
    createdAt: rfq.created_at ?? "",
  };
}

export interface RfqItemPayload {
  purchase_request_item_id?: number | null;
  item_no?: number;
  description?: string;
  uom?: string;
  quantity: number;
  unit_abc?: number;
  total_abc?: number;
}

export interface RfqCreatePayload {
  purchase_request_id: string | number;
  procurement_category?: string;
  quotation_no?: string;
  rfq_date?: string;
  opening_date?: string;
  place_of_delivery?: string;
  estimated_budget?: number;
  bac_chairman?: string;
  bac_chairman_title?: string;
  purpose?: string;
  fund_source_snapshot?: string;
  canvasser?: string;
  bac_action?: string;
  items: RfqItemPayload[];
}

/** A directory supplier (supplier_id), or a new one typed in — added to the directory in the RFQ's category. */
export interface RfqSupplierPayload {
  supplier_id?: number | string;
  supplier_name?: string;
  supplier_address?: string;
  supplier_contact_no?: string;
  supplier_email?: string;
  supplier_tin?: string;
  supplier_by?: string;
}

export async function apiGetRfqs(filters?: { purchaseRequestId?: string | number; status?: string }) {
  const params = new URLSearchParams();
  if (filters?.purchaseRequestId) params.set("purchase_request_id", String(filters.purchaseRequestId));
  if (filters?.status) params.set("status", filters.status);
  // The server caps this at 100/request regardless — keeps today's volumes fully visible without
  // a "load more" control yet; the endpoint is real pagination underneath.
  params.set("per_page", "100");

  const result = await request<ApiList<BackendRfq>>(`/rfqs?${params.toString()}`);
  return result.data.map(mapRfq);
}

/** The RFQ list, one page at a time. */
export async function apiGetRfqsPage(page: number, perPage = 20, filters?: { purchaseRequestId?: string | number; status?: string }): Promise<Page<Rfq>> {
  const params = new URLSearchParams({ page: String(page), per_page: String(perPage) });
  if (filters?.purchaseRequestId) params.set("purchase_request_id", String(filters.purchaseRequestId));
  if (filters?.status) params.set("status", filters.status);
  return fetchPage<BackendRfq, Rfq>(`/rfqs?${params.toString()}`, mapRfq);
}

export async function apiGetRfq(id: string | number) {
  const result = await request<ApiRecord<BackendRfq>>(`/rfqs/${id}`);
  return mapRfq(result.data);
}

export async function apiCreateRfq(payload: RfqCreatePayload) {
  const result = await request<ApiRecord<BackendRfq>>("/rfqs", { method: "POST", body: payload });
  return mapRfq(result.data);
}

export async function apiUpdateRfq(id: string | number, payload: Partial<RfqCreatePayload>) {
  const result = await request<ApiRecord<BackendRfq>>(`/rfqs/${id}`, { method: "PUT", body: payload });
  return mapRfq(result.data);
}

/** Flowchart signing order: the Supply Officer counter-signs, then the BAC Chairman OR Vice-Chairman. */
export async function apiSignRfq(id: string | number, step: "supply-officer" | "bac", remarks?: string) {
  const result = await request<ApiRecord<BackendRfq> & { message: string }>(`/rfqs/${id}/sign/${step}`, {
    method: "POST",
    body: { remarks },
  });
  return { ...result, data: mapRfq(result.data) };
}

export async function apiAddRfqSupplier(rfqId: string | number, payload: RfqSupplierPayload) {
  const result = await request<ApiRecord<BackendRfq>>(`/rfqs/${rfqId}/suppliers`, { method: "POST", body: payload });
  return mapRfq(result.data);
}

export async function apiRemoveRfqSupplier(rfqId: string | number, rfqSupplierId: string | number) {
  const result = await request<ApiRecord<BackendRfq>>(`/rfqs/${rfqId}/suppliers/${rfqSupplierId}`, { method: "DELETE" });
  return mapRfq(result.data);
}

/** Marks the RFQ as sent to its 3 suppliers (the Supply team delivers it) and starts their 7-day reply window. */
export async function apiSendRfq(rfqId: string | number) {
  const result = await request<ApiRecord<BackendRfq> & { message: string }>(`/rfqs/${rfqId}/send`, { method: "POST" });
  return { message: result.message, data: mapRfq(result.data) };
}

/** Records a supplier's quotation as brought back by the Supply team: prices plus the scanned signed quotation. */
export async function apiRecordRfqSupplierQuote(
  rfqId: string | number,
  rfqSupplierId: string | number,
  items: Array<{ rfq_item_id: number | string; unit_price: number }>,
  quotation: File,
) {
  const form = new FormData();
  items.forEach((item, i) => {
    form.append(`items[${i}][rfq_item_id]`, String(item.rfq_item_id));
    form.append(`items[${i}][unit_price]`, String(item.unit_price));
  });
  form.append("quotation", quotation);
  const result = await request<ApiRecord<BackendRfq>>(`/rfqs/${rfqId}/suppliers/${rfqSupplierId}/quote`, { method: "POST", body: form });
  return mapRfq(result.data);
}

/** Flowchart: "Cancel sent RFQ of Non-responding Supplier" (the hourly sweep does this after 7 days). */
export async function apiCancelRfqSupplier(rfqId: string | number, rfqSupplierId: string | number, reason?: string) {
  const result = await request<ApiRecord<BackendRfq>>(`/rfqs/${rfqId}/suppliers/${rfqSupplierId}/cancel`, { method: "POST", body: { reason } });
  return mapRfq(result.data);
}

/** Flowchart: "Choose n of supplier" — fills the slots left by cancelled or TWG-failed suppliers. */
export async function apiChooseReplacementSuppliers(rfqId: string | number, suppliers: RfqSupplierPayload[]) {
  const result = await request<ApiRecord<BackendRfq> & { message: string }>(`/rfqs/${rfqId}/suppliers/choose`, {
    method: "POST",
    body: { suppliers },
  });
  return { message: result.message, data: mapRfq(result.data) };
}

/** Downloads a supplier's signed quotation (auth-protected, so fetched here rather than linked). */
export async function apiDownloadQuotation(rfqId: string | number, rfqSupplierId: string | number, filename: string) {
  const token = getToken();
  if (!token) {
    notifyAuthExpired();
    throw new Error("Please sign in to continue.");
  }
  const response = await fetch(`${API_BASE_URL}/rfqs/${rfqId}/suppliers/${rfqSupplierId}/quotation`, { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) throw new Error("Could not download the signed quotation.");
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement("a");
  link.href = url;
  link.download = filename || "signed-quotation";
  link.click();
  URL.revokeObjectURL(url);
}

/** Equipment: the TWG's specification evaluation notes. */
export async function apiSaveTwgNotes(rfqId: string | number, notes: string) {
  const result = await request<ApiRecord<BackendRfq>>(`/rfqs/${rfqId}/twg/notes`, { method: "PUT", body: { notes } });
  return mapRfq(result.data);
}

/** Equipment: "Check each equipment with supplier" — complies or not, per quoted item. */
export async function apiTwgCheckSupplier(
  rfqId: string | number,
  rfqSupplierId: string | number,
  items: Array<{ rfq_item_id: string | number; complies: boolean; remarks?: string }>,
) {
  const result = await request<ApiRecord<BackendRfq> & { message: string }>(`/rfqs/${rfqId}/suppliers/${rfqSupplierId}/twg-check`, { method: "POST", body: { items } });
  return { message: result.message, data: mapRfq(result.data) };
}

// ---------- Supplier directory ----------

export interface Supplier {
  id: string;
  name: string;
  category: "Goods" | "Services";
  address: string;
  contactNo: string;
  email: string;
  tin: string;
  active: boolean;
}

type BackendSupplier = {
  id: number;
  name: string;
  category: "Goods" | "Services";
  address: string | null;
  contact_no: string | null;
  email: string | null;
  tin: string | null;
  active: boolean;
};

function mapSupplier(s: BackendSupplier): Supplier {
  return {
    id: String(s.id),
    name: s.name,
    category: s.category,
    address: s.address ?? "",
    contactNo: s.contact_no ?? "",
    email: s.email ?? "",
    tin: s.tin ?? "",
    active: s.active,
  };
}

export interface SupplierPayload {
  name?: string;
  category?: "Goods" | "Services";
  address?: string;
  contact_no?: string;
  email?: string;
  tin?: string;
  active?: boolean;
}

export async function apiGetSuppliersPage(page: number, perPage = 20, filters?: { category?: string; q?: string; active?: boolean }): Promise<Page<Supplier>> {
  const params = new URLSearchParams({ page: String(page), per_page: String(perPage) });
  if (filters?.category) params.set("category", filters.category);
  if (filters?.q) params.set("q", filters.q);
  if (filters?.active !== undefined) params.set("active", filters.active ? "1" : "0");
  return fetchPage<BackendSupplier, Supplier>(`/suppliers?${params.toString()}`, mapSupplier);
}

export async function apiCreateSupplier(payload: SupplierPayload) {
  const result = await request<ApiRecord<BackendSupplier>>("/suppliers", { method: "POST", body: payload });
  return mapSupplier(result.data);
}

export async function apiUpdateSupplier(id: string | number, payload: SupplierPayload) {
  const result = await request<ApiRecord<BackendSupplier>>(`/suppliers/${id}`, { method: "PUT", body: payload });
  return mapSupplier(result.data);
}

export async function apiDeactivateSupplier(id: string | number) {
  const result = await request<ApiRecord<BackendSupplier>>(`/suppliers/${id}`, { method: "DELETE" });
  return mapSupplier(result.data);
}

export interface AocSupplierSummary {
  id: string;
  supplierName: string;
  status: string;
  isWinner: boolean;
  twgResult: "Passed" | "Failed" | null;
  totalQuoted: number;
  quoteItems: RfqQuoteItem[];
}

/** Venue AOCs: "Individual rating of list of venue" -> "Summary of rating". */
export interface VenueRating {
  criteria: string[];
  venueIds: string[];
  raters: Array<{ id: number; name: string; role: string; rated: boolean }>;
  summary: Array<{ rfqSupplierId: string; supplierName: string; totalQuoted: number; criteria: Record<string, number>; overall: number; rank: number }> | null;
  myTurn: boolean;
  ratings: Array<{ rfqSupplierId: string; raterId: number; raterRole: string; criterion: string; score: number; remarks: string }>;
}

export interface AbstractOfCanvas {
  preparedByName: string;
  preparedByPosition: string;
  id: string;
  rfqId: string;
  rfqNo: string;
  prNo: string;
  procurementCategory: string;
  twgEvaluationNotes: string;
  winningRfqSupplierId: string | null;
  winningSupplierName: string;
  status: string;
  bacRemarks: string;
  twgResponse: string;
  submittedAt: string;
  purchaseRequestId: string;
  bacApprovedAt: string;
  supplyNotedName: string;
  supplyNotedAt: string;
  hasPurchaseOrder: boolean;
  suppliers: AocSupplierSummary[];
  items: RfqItem[];
  venueRating: VenueRating | null;
}

type BackendAocSupplierSummary = {
  id: number;
  supplier_name: string | null;
  status: string;
  is_winner: boolean;
  twg_result?: "Passed" | "Failed" | null;
  total_quoted: number | string;
  quote_items?: BackendRfqQuoteItem[];
};

type BackendVenueRating = {
  criteria: string[];
  venue_ids: number[];
  raters: Array<{ id: number; name: string; role: string; rated: boolean }>;
  summary: Array<{ rfq_supplier_id: number; supplier_name: string; total_quoted: number; criteria: Record<string, number>; overall: number; rank: number }> | null;
  my_turn: boolean;
  ratings: Array<{ rfq_supplier_id: number; rater_id: number; rater_role: string; criterion: string; score: number; remarks: string | null }>;
};

type BackendAbstractOfCanvas = {
  prepared_by?: { name: string; position: string } | null;
  id: number;
  rfq_id: number;
  rfq_no: string | null;
  pr_no: string | null;
  procurement_category: string;
  twg_evaluation_notes: string | null;
  winning_rfq_supplier_id: number | null;
  winning_supplier_name: string | null;
  status: string;
  bac_remarks: string | null;
  twg_response: string | null;
  submitted_at: string | null;
  purchase_request_id?: number | null;
  bac_approved_at?: string | null;
  supply_noted_name?: string | null;
  supply_noted_at?: string | null;
  has_purchase_order?: boolean;
  suppliers?: BackendAocSupplierSummary[];
  items?: BackendRfqItem[];
  venue_rating?: BackendVenueRating | null;
};

function mapAbstractOfCanvas(aoc: BackendAbstractOfCanvas): AbstractOfCanvas {
  return {
    preparedByName: aoc.prepared_by?.name ?? "",
    preparedByPosition: aoc.prepared_by?.position ?? "",
    id: String(aoc.id),
    rfqId: String(aoc.rfq_id),
    rfqNo: aoc.rfq_no ?? "",
    prNo: aoc.pr_no ?? "",
    procurementCategory: aoc.procurement_category,
    twgEvaluationNotes: aoc.twg_evaluation_notes ?? "",
    winningRfqSupplierId: aoc.winning_rfq_supplier_id !== null ? String(aoc.winning_rfq_supplier_id) : null,
    winningSupplierName: aoc.winning_supplier_name ?? "",
    status: aoc.status,
    bacRemarks: aoc.bac_remarks ?? "",
    twgResponse: aoc.twg_response ?? "",
    submittedAt: aoc.submitted_at ?? "",
    purchaseRequestId: aoc.purchase_request_id ? String(aoc.purchase_request_id) : "",
    bacApprovedAt: aoc.bac_approved_at ?? "",
    supplyNotedName: aoc.supply_noted_name ?? "",
    supplyNotedAt: aoc.supply_noted_at ?? "",
    hasPurchaseOrder: Boolean(aoc.has_purchase_order),
    suppliers: (aoc.suppliers ?? []).map((s) => ({
      id: String(s.id),
      supplierName: s.supplier_name ?? "",
      status: s.status,
      isWinner: s.is_winner,
      twgResult: s.twg_result ?? null,
      totalQuoted: Number(s.total_quoted),
      quoteItems: (s.quote_items ?? []).map(mapRfqQuoteItem),
    })),
    items: (aoc.items ?? []).map(mapRfqItem),
    venueRating: aoc.venue_rating
      ? {
          criteria: aoc.venue_rating.criteria,
          venueIds: aoc.venue_rating.venue_ids.map(String),
          raters: aoc.venue_rating.raters,
          summary: aoc.venue_rating.summary
            ? aoc.venue_rating.summary.map((v) => ({
                rfqSupplierId: String(v.rfq_supplier_id),
                supplierName: v.supplier_name,
                totalQuoted: Number(v.total_quoted),
                criteria: v.criteria,
                overall: Number(v.overall),
                rank: v.rank,
              }))
            : null,
          myTurn: aoc.venue_rating.my_turn,
          ratings: aoc.venue_rating.ratings.map((r) => ({
            rfqSupplierId: String(r.rfq_supplier_id),
            raterId: r.rater_id,
            raterRole: r.rater_role,
            criterion: r.criterion,
            score: r.score,
            remarks: r.remarks ?? "",
          })),
        }
      : null,
  };
}

/** One row of the BAC review queue. */
export interface AocSummary {
  id: string;
  rfqId: string;
  rfqNo: string;
  prNo: string;
  procurementCategory: string;
  status: string;
  winningSupplierName: string;
  winningTotal: number;
  bacRemarks: string;
  submittedAt: string;
}

/** Abstracts of Canvas, optionally limited to the given statuses (e.g. "Pending BAC Review"). */
/**
 * `limit` returns a flat, capped list for a dashboard preview. Without it, the full queue is
 * fetched — the server caps this at 100/request regardless (real pagination underneath), so it
 * never pulls every Abstract of Canvas ever made in one request.
 */
type BackendAocSummary = {
  id: number;
  rfq_id: number;
  rfq_no: string | null;
  pr_no: string | null;
  procurement_category: string;
  status: string;
  winning_supplier_name: string | null;
  winning_total: number | string | null;
  bac_remarks: string | null;
  submitted_at: string | null;
};

function mapAocSummary(aoc: BackendAocSummary): AocSummary {
  return {
    id: String(aoc.id),
    rfqId: String(aoc.rfq_id),
    rfqNo: aoc.rfq_no ?? "",
    prNo: aoc.pr_no ?? "",
    procurementCategory: aoc.procurement_category,
    status: aoc.status,
    winningSupplierName: aoc.winning_supplier_name ?? "",
    winningTotal: Number(aoc.winning_total ?? 0),
    bacRemarks: aoc.bac_remarks ?? "",
    submittedAt: aoc.submitted_at ?? "",
  };
}

export async function apiGetAocs(statuses?: string[], limit?: number): Promise<AocSummary[]> {
  const params = new URLSearchParams();
  if (statuses?.length) params.set("status", statuses.join(","));
  if (limit) params.set("limit", String(limit));
  else params.set("per_page", "100");
  const query = params.toString() ? `?${params.toString()}` : "";
  const result = await request<{ data: BackendAocSummary[] }>(`/aoc${query}`);
  return result.data.map(mapAocSummary);
}

/** The full BAC Review queue, one page at a time. */
export async function apiGetAocsPage(statuses: string[] | undefined, page: number, perPage = 20): Promise<Page<AocSummary>> {
  const params = new URLSearchParams({ page: String(page), per_page: String(perPage) });
  if (statuses?.length) params.set("status", statuses.join(","));
  return fetchPage<BackendAocSummary, AocSummary>(`/aoc?${params.toString()}`, mapAocSummary);
}

export async function apiGenerateAoc(rfqId: string | number, twgEvaluationNotes?: string) {
  const result = await request<ApiRecord<BackendAbstractOfCanvas>>(`/rfqs/${rfqId}/aoc`, {
    method: "POST",
    body: { twg_evaluation_notes: twgEvaluationNotes },
  });
  return mapAbstractOfCanvas(result.data);
}

export async function apiGetAoc(aocId: string | number) {
  const result = await request<ApiRecord<BackendAbstractOfCanvas>>(`/aoc/${aocId}`);
  return mapAbstractOfCanvas(result.data);
}

export async function apiSubmitAocForBacReview(aocId: string | number) {
  const result = await request<ApiRecord<BackendAbstractOfCanvas> & { message: string }>(`/aoc/${aocId}/submit-for-bac-review`, { method: "POST" });
  return { ...result, data: mapAbstractOfCanvas(result.data) };
}

export async function apiBacReviewAoc(aocId: string | number, pass: boolean, remarks?: string) {
  const result = await request<ApiRecord<BackendAbstractOfCanvas> & { message: string }>(`/aoc/${aocId}/bac-review`, {
    method: "POST",
    body: { pass, remarks },
  });
  return { ...result, data: mapAbstractOfCanvas(result.data) };
}

export async function apiTwgRespondAoc(aocId: string | number, response: string) {
  const result = await request<ApiRecord<BackendAbstractOfCanvas> & { message: string }>(`/aoc/${aocId}/twg-respond`, {
    method: "POST",
    body: { response },
  });
  return { ...result, data: mapAbstractOfCanvas(result.data) };
}

/** Flowchart: "BAC satisfied?" after the TWG addressed its remarks. Not satisfied cancels the PR (Re-PR). */
export async function apiBacSatisfactionAoc(aocId: string | number, satisfied: boolean, reason?: string) {
  const result = await request<ApiRecord<BackendAbstractOfCanvas> & { message: string }>(`/aoc/${aocId}/bac-satisfaction`, {
    method: "POST",
    body: { satisfied, reason },
  });
  return { ...result, data: mapAbstractOfCanvas(result.data) };
}

/** Flowchart: "AOC returned to supply to note lowest bidder" — the Supply Officer confirms and signs. */
export async function apiNoteLowestBidder(aocId: string | number) {
  const result = await request<ApiRecord<BackendAbstractOfCanvas> & { message: string }>(`/aoc/${aocId}/note-lowest-bidder`, { method: "POST" });
  return { ...result, data: mapAbstractOfCanvas(result.data) };
}

/** One rater's scores for every venue on every criterion (1-5). */
export async function apiRateVenues(aocId: string | number, ratings: Array<{ rfq_supplier_id: string | number; criterion: string; score: number; remarks?: string }>) {
  const result = await request<ApiRecord<BackendAbstractOfCanvas> & { message: string }>(`/aoc/${aocId}/venue-ratings`, { method: "POST", body: { ratings } });
  return { ...result, data: mapAbstractOfCanvas(result.data) };
}

/** Venue AOCs waiting on the signed-in user's rating (for "Needs Your Action"). */
export async function apiGetMyVenueRatings(): Promise<AocSummary[]> {
  const result = await request<{ data: BackendAocSummary[] }>("/aoc/my-venue-ratings");
  return result.data.map(mapAocSummary);
}

export interface PurchaseOrderItem {
  id: string;
  itemNo: number;
  description: string;
  uom: string;
  quantity: number;
  unitCost: number;
  totalCost: number;
}

export interface PurchaseOrder {
  preparedByName: string;
  preparedByPosition: string;
  id: string;
  poNo: string;
  prId: string;
  prNo: string;
  rfqId: string;
  rfqNo: string;
  supplierName: string;
  supplierAddress: string;
  supplierContactNo: string;
  supplierTin: string;
  poDate: string;
  deliveryDate: string;
  placeOfDelivery: string;
  modeOfProcurement: string;
  totalAmount: number;
  termsAndConditions: string;
  budgetOfficerName: string;
  budgetOfficerSignedAt: string;
  accountingOfficerName: string;
  accountingOfficerSignedAt: string;
  approvedByName: string;
  approvedBySignedAt: string;
  deliveryWaived: boolean;
  deliveryWaivedAt: string;
  deliveryWaivedReason: string;
  /** "Generate PO (with complete digital signature)": each signer's e-signature image (data URL). */
  budgetOfficerSignature: string;
  accountingOfficerSignature: string;
  approvedBySignature: string;
  supplierEmail: string;
  forwardedToSupplierAt: string;
  deliveryAcceptedAt: string;
  deliveryRespondedBy: string;
  items: PurchaseOrderItem[];
  status: string;
  stage: string;
  createdAt: string;
}

type BackendPurchaseOrderItem = {
  id: number;
  rfq_item_id: number | null;
  item_no: number;
  description: string | null;
  uom: string | null;
  quantity: string | number;
  unit_cost: string | number;
  total_cost: string | number;
};

type BackendPurchaseOrder = {
  prepared_by?: { name: string; position: string } | null;
  id: number;
  po_no: string;
  purchase_request_id: number;
  pr_no: string | null;
  rfq_id: number;
  rfq_no: string | null;
  supplier_name: string | null;
  supplier_address: string | null;
  supplier_contact_no: string | null;
  supplier_tin: string | null;
  po_date: string | null;
  delivery_date: string | null;
  place_of_delivery: string | null;
  mode_of_procurement: string | null;
  total_amount: string | number;
  terms_and_conditions: string | null;
  budget_officer_name: string | null;
  budget_officer_signed_at: string | null;
  accounting_officer_name: string | null;
  accounting_officer_signed_at: string | null;
  approved_by_name: string | null;
  approved_by_signed_at: string | null;
  delivery_waived: boolean;
  delivery_waived_at: string | null;
  delivery_waived_reason: string | null;
  budget_officer_signature?: string | null;
  accounting_officer_signature?: string | null;
  approved_by_signature?: string | null;
  supplier_email?: string | null;
  forwarded_to_supplier_at?: string | null;
  delivery_accepted_at?: string | null;
  delivery_responded_by?: string | null;
  status: string;
  stage: string;
  date_submitted?: string | null;
  items: BackendPurchaseOrderItem[];
  created_at?: string | null;
};

function mapPurchaseOrderItem(item: BackendPurchaseOrderItem): PurchaseOrderItem {
  return {
    id: String(item.id),
    itemNo: item.item_no,
    description: item.description ?? "",
    uom: item.uom ?? "",
    quantity: Number(item.quantity),
    unitCost: Number(item.unit_cost),
    totalCost: Number(item.total_cost),
  };
}

function mapPurchaseOrder(po: BackendPurchaseOrder): PurchaseOrder {
  return {
    preparedByName: po.prepared_by?.name ?? "",
    preparedByPosition: po.prepared_by?.position ?? "",
    id: String(po.id),
    poNo: po.po_no,
    prId: String(po.purchase_request_id),
    prNo: po.pr_no ?? "",
    rfqId: String(po.rfq_id),
    rfqNo: po.rfq_no ?? "",
    supplierName: po.supplier_name ?? "",
    supplierAddress: po.supplier_address ?? "",
    supplierContactNo: po.supplier_contact_no ?? "",
    supplierTin: po.supplier_tin ?? "",
    poDate: po.po_date ?? "",
    deliveryDate: po.delivery_date ?? "",
    placeOfDelivery: po.place_of_delivery ?? "",
    modeOfProcurement: po.mode_of_procurement ?? "",
    totalAmount: Number(po.total_amount),
    termsAndConditions: po.terms_and_conditions ?? "",
    budgetOfficerName: po.budget_officer_name ?? "",
    budgetOfficerSignedAt: po.budget_officer_signed_at ?? "",
    accountingOfficerName: po.accounting_officer_name ?? "",
    accountingOfficerSignedAt: po.accounting_officer_signed_at ?? "",
    approvedByName: po.approved_by_name ?? "",
    approvedBySignedAt: po.approved_by_signed_at ?? "",
    deliveryWaived: po.delivery_waived,
    deliveryWaivedAt: po.delivery_waived_at ?? "",
    deliveryWaivedReason: po.delivery_waived_reason ?? "",
    budgetOfficerSignature: po.budget_officer_signature ?? "",
    accountingOfficerSignature: po.accounting_officer_signature ?? "",
    approvedBySignature: po.approved_by_signature ?? "",
    supplierEmail: po.supplier_email ?? "",
    forwardedToSupplierAt: po.forwarded_to_supplier_at ?? "",
    deliveryAcceptedAt: po.delivery_accepted_at ?? "",
    deliveryRespondedBy: po.delivery_responded_by ?? "",
    items: po.items.map(mapPurchaseOrderItem),
    status: po.status,
    stage: po.stage,
    createdAt: po.created_at ?? "",
  };
}

export interface PurchaseOrderUpdatePayload {
  po_date?: string;
  delivery_date?: string;
  place_of_delivery?: string;
  terms_and_conditions?: string;
  items?: Array<{
    rfq_item_id?: number | null;
    item_no?: number;
    description?: string;
    uom?: string;
    quantity: number;
    unit_cost: number;
  }>;
}

export async function apiGetPurchaseOrders(filters?: { purchaseRequestId?: string | number; status?: string }) {
  const params = new URLSearchParams();
  if (filters?.purchaseRequestId) params.set("purchase_request_id", String(filters.purchaseRequestId));
  if (filters?.status) params.set("status", filters.status);
  // The server caps this at 100/request regardless — keeps today's volumes fully visible without
  // a "load more" control yet; the endpoint is real pagination underneath.
  params.set("per_page", "100");

  const result = await request<ApiList<BackendPurchaseOrder>>(`/purchase-orders?${params.toString()}`);
  return result.data.map(mapPurchaseOrder);
}

/** The Purchase Order list, one page at a time. */
export async function apiGetPurchaseOrdersPage(page: number, perPage = 20, filters?: { purchaseRequestId?: string | number; status?: string }): Promise<Page<PurchaseOrder>> {
  const params = new URLSearchParams({ page: String(page), per_page: String(perPage) });
  if (filters?.purchaseRequestId) params.set("purchase_request_id", String(filters.purchaseRequestId));
  if (filters?.status) params.set("status", filters.status);
  return fetchPage<BackendPurchaseOrder, PurchaseOrder>(`/purchase-orders?${params.toString()}`, mapPurchaseOrder);
}

export async function apiGetPurchaseOrder(id: string | number) {
  const result = await request<ApiRecord<BackendPurchaseOrder>>(`/purchase-orders/${id}`);
  return mapPurchaseOrder(result.data);
}

/** Generates a Draft PO from the RFQ's BAC-approved Abstract of Canvas, copying the winning supplier's quote. */
export async function apiGenerateFromRfq(rfqId: string | number) {
  const result = await request<ApiRecord<BackendPurchaseOrder>>(`/rfqs/${rfqId}/generate-po`, { method: "POST" });
  return mapPurchaseOrder(result.data);
}

export async function apiUpdatePurchaseOrder(id: string | number, payload: PurchaseOrderUpdatePayload) {
  const result = await request<ApiRecord<BackendPurchaseOrder>>(`/purchase-orders/${id}`, { method: "PUT", body: payload });
  return mapPurchaseOrder(result.data);
}

export async function apiSubmitPurchaseOrder(id: string | number) {
  const result = await request<ApiRecord<BackendPurchaseOrder> & { message: string }>(`/purchase-orders/${id}/submit`, { method: "POST" });
  return mapPurchaseOrder(result.data);
}

/** 3-stage approval chain: Budget Obligation -> Accounting -> Regional Director. */
export async function apiObligatePo(id: string | number, remarks?: string) {
  const result = await request<ApiRecord<BackendPurchaseOrder> & { message: string }>(`/approvals/po/${id}/obligate`, { method: "POST", body: { remarks } });
  return { ...result, data: mapPurchaseOrder(result.data) };
}

export async function apiAccountPo(id: string | number, remarks?: string) {
  const result = await request<ApiRecord<BackendPurchaseOrder> & { message: string }>(`/approvals/po/${id}/account`, { method: "POST", body: { remarks } });
  return { ...result, data: mapPurchaseOrder(result.data) };
}

/** RD final approval; the fully signed PO is then released to the Supply team to bring to the supplier. */
export async function apiFinalApprovePo(id: string | number, remarks?: string) {
  const result = await request<ApiRecord<BackendPurchaseOrder> & { message: string }>(`/approvals/po/${id}/final-approve`, { method: "POST", body: { remarks } });
  return { message: result.message, data: mapPurchaseOrder(result.data) };
}

export async function apiRejectPo(id: string | number, reason: string) {
  const result = await request<ApiRecord<BackendPurchaseOrder> & { message: string }>(`/approvals/po/${id}/reject`, { method: "POST", body: { reason } });
  return { ...result, data: mapPurchaseOrder(result.data) };
}

export async function apiDeliverPo(id: string | number, waived: boolean, reason?: string) {
  const result = await request<ApiRecord<BackendPurchaseOrder> & { message: string }>(`/purchase-orders/${id}/deliver`, {
    method: "POST",
    body: { waived, reason },
  });
  return { ...result, data: mapPurchaseOrder(result.data) };
}

function mapUser(user: BackendUser): UserRecord {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    office: user.office?.name ?? "Unassigned",
    officeId: user.office_id ?? null,
    roles: user.roles?.map((role) => role.name) ?? [],
    status: user.status,
    tier: user.tier ?? "regular",
    modules: user.modules ?? [],
    accessModules: user.access_modules ?? [],
    lastLogin: user.last_login_at ?? "Never",
  };
}

function mapCurrentUser(user: BackendUser): CurrentUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    tier: user.tier ?? "regular",
    modules: user.access_modules ?? [],
    office: user.office?.name ?? "Unassigned",
    position: user.position || user.roles?.[0]?.name || "",
    isBudgetOfficer: Boolean(user.is_budget_officer),
    isRegionalDirector: Boolean(user.is_regional_director),
    isBacChair: Boolean(user.is_bac_chair),
    isBacViceChair: Boolean(user.is_bac_vice_chair),
    isSupplyOfficer: Boolean(user.is_supply_officer),
    isTwgLead: Boolean(user.is_twg_lead),
    hasSignature: Boolean(user.has_signature),
  };
}

/** Current user's uploaded e-signature (base64 data URL) or null. */
export async function apiGetMySignature(): Promise<string | null> {
  const result = await request<{ data: { signature: string | null } }>("/me/signature");
  return result.data.signature;
}

/** Upload / replace the current user's e-signature (base64 data URL). */
export async function apiSetMySignature(signature: string): Promise<void> {
  await request<{ data: { has_signature: boolean } }>("/me/signature", { method: "POST", body: { signature } });
}

/** Remove the current user's e-signature. */
export async function apiDeleteMySignature(): Promise<void> {
  await request<{ data: { has_signature: boolean } }>("/me/signature", { method: "DELETE" });
}

function mapRole(role: BackendRole): RoleRecord {
  return {
    id: role.id,
    name: role.name,
    desc: role.description ?? "",
    perms: role.permissions ?? [],
  };
}

function mapAudit(log: BackendAudit): AuditLogRecord {
  return {
    id: log.id,
    ts: formatPhilippineDateTime(log.created_at),
    actor: log.actor_name ?? "System",
    role: log.role ?? "N/A",
    module: log.module,
    action: log.action,
    target: log.target ?? "",
    ip: log.ip_address ?? "",
  };
}

function mapSystemPreference(setting: BackendSystemPreference): SystemPreferenceRecord {
  return {
    key: setting.key,
    value: typeof setting.value === "object" && setting.value !== null && "value" in setting.value ? setting.value.value ?? null : setting.value,
    category: setting.category,
    label: setting.label,
    description: setting.description,
    type: setting.type,
  };
}

function formatPhilippineDateTime(value: string | null | undefined) {
  if (!value) return "";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("en-PH", {
    timeZone: PHILIPPINE_TIME_ZONE,
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
    timeZoneName: "short",
  }).format(date);
}

function mapPpmp(row: BackendPpmp): PpmpRecord {
  const quantity = Number(row.quantity);
  const unitCost = Number(row.estimated_unit_cost);
  const estimatedBudget = row.estimated_budget === null || row.estimated_budget === undefined ? quantity * unitCost : Number(row.estimated_budget);

  return {
    id: row.id,
    code: row.code ?? `PPMP-${row.id}`,
    item: row.item?.name ?? "Unassigned item",
    category: row.expense_category ?? row.item?.category ?? "N/A",
    qty: quantity,
    estCost: estimatedBudget,
    schedule: row.schedule ?? "N/A",
    documentId: row.ppmp_document_id ?? null,
    rowNumber: row.row_number ?? null,
    objective: row.general_description ?? null,
    projectType: row.project_type ?? null,
    quantitySize: row.quantity_size ?? null,
    recommendedMode: row.recommended_mode ?? null,
    preProcurementConference: row.pre_procurement_conference ?? null,
    procurementStart: row.procurement_start ?? null,
    procurementEnd: row.procurement_end ?? null,
    deliveryPeriod: row.delivery_period ?? null,
    sourceOfFunds: row.source_of_funds ?? null,
    supportingDocuments: row.supporting_documents ?? null,
    remarks: row.remarks ?? null,
  };
}

function mapPpmpDocument(document: BackendPpmpDocument): PpmpDocumentRecord {
  return {
    id: document.id,
    projectId: document.project_id,
    projectTitle: document.project_title ?? "Assigned project",
    ppmpNo: document.ppmp_no ?? `PPMP-${document.id}`,
    fiscalYear: Number(document.fiscal_year),
    endUserUnit: document.end_user_unit ?? "Unassigned unit",
    documentType: document.document_type === "Indicative" ? "Indicative" : "Final",
    sourceFilename: document.source_filename ?? "",
    preparedSubmittedByName: document.prepared_submitted_by_name ?? "",
    preparedSubmittedByPosition: document.prepared_submitted_by_position ?? "",
    preparedSubmittedByDate: document.prepared_submitted_by_date ?? "",
    budgetOfficerName: document.budget_officer_name ?? "",
    budgetOfficerPosition: document.budget_officer_position ?? "",
    budgetCertifiedDate: document.budget_certified_date ?? "",
    totalEstimatedBudget: Number(document.total_estimated_budget),
    rowCount: Number(document.row_count),
    importedAt: document.imported_at ?? "",
    items: document.items.map(mapPpmp),
  };
}

function mapAppCse(row: BackendAppCse): AppCseRecord {
  return {
    id: row.id,
    code: row.code ?? `CSE-${row.id}`,
    item: row.item?.name ?? "Unassigned item",
    uom: row.item?.uom ?? "unit",
    qty: Number(row.quantity),
    unitPrice: Number(row.unit_price),
    fiscalYear: row.fiscal_year ?? null,
    isConsolidated: Boolean(row.is_consolidated),
  };
}

function mapAppNonCse(row: BackendAppNonCse): AppNonCseRecord {
  return {
    id: row.id,
    code: row.code ?? `NC-${row.id}`,
    item: row.item?.name ?? "Unassigned item",
    category: row.item?.category ?? "N/A",
    qty: Number(row.quantity),
    estCost: Number(row.estimated_cost),
    fiscalYear: row.fiscal_year ?? null,
    isConsolidated: Boolean(row.is_consolidated),
  };
}

function mapBudget(row: BackendBudget): BudgetRecord {
  return {
    id: row.id,
    code: row.account_code,
    account: row.account_name,
    allocated: Number(row.allocated_amount),
    obligated: Number(row.obligated_amount),
  };
}

function textFromRelation(value: string | number | BackendNamedRecord | null | undefined, fallback: string) {
  if (typeof value === "string") return value;
  if (typeof value === "number") return `User #${value}`;
  if (!value) return fallback;

  return value.name ?? value.title ?? value.code ?? fallback;
}

function dateOnly(value: string | null | undefined) {
  return value?.split("T")[0] ?? null;
}
