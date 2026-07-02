import type { PRItem, PurchaseRequest, ValidationCheck } from "@/lib/mock-data";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "/api/v1";
const TOKEN_KEY = "pr_backend_token";
const TOKEN_EXPIRES_AT_KEY = "pr_backend_token_expires_at";
const TOKEN_LAST_ACTIVITY_KEY = "pr_backend_token_last_activity_at";
const AUTH_IDLE_TIMEOUT_MS = Number(import.meta.env.VITE_AUTH_IDLE_TIMEOUT_MINUTES ?? 30) * 60 * 1000;
const PHILIPPINE_TIME_ZONE = "Asia/Manila";
export const AUTH_EXPIRED_EVENT = "pr_backend_auth_expired";

type ApiList<T> = { data: T[] };
type ApiRecord<T> = { data: T };

export type UserRecord = {
  id: number;
  name: string;
  email: string;
  office: string;
  roles: string[];
  status: string;
  lastLogin: string;
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
};

export type AppNonCseRecord = {
  id: number;
  code: string;
  item: string;
  category: string;
  qty: number;
  estCost: number;
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
}

export function hasValidToken() {
  return Boolean(getToken());
}

export async function login(email: string, password: string) {
  const result = await request<{ token: string; expires_in: number; user: unknown }>("/auth/login", {
    method: "POST",
    body: { email, password },
    auth: false,
  });
  setToken(result.token, result.expires_in);
  return result;
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

export async function apiValidatePurchaseRequest(id: string | number) {
  const result = await request<{ data: BackendValidation[] }>(`/purchase-requests/${id}/validate`, {
    method: "POST",
  });
  return result.data.map(mapValidation);
}

export async function apiGetApprovals() {
  const result = await request<ApiList<BackendPurchaseRequest>>("/approvals");
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

async function request<T>(path: string, options: { method?: string; body?: unknown; auth?: boolean } = {}): Promise<T> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
  };

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
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));

    if (response.status === 401 && options.auth !== false) {
      notifyAuthExpired();
    }

    throw new Error(error.message ?? `Backend request failed with HTTP ${response.status}.`);
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
};

type BackendNamedRecord = {
  id?: number;
  name?: string | null;
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
  roles?: BackendRole[];
  status: string;
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
  item?: { name: string; uom: string } | null;
};

type BackendAppNonCse = {
  id: number;
  code: string | null;
  quantity: string | number;
  estimated_cost: string | number;
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
    modeOfProcurement: pr.mode_of_procurement,
    projectTitle: pr.project_title ?? textFromRelation(pr.project, "No project assigned"),
    purpose: pr.purpose,
    items: pr.items.map(mapPrItem),
    stage: pr.stage,
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

function mapUser(user: BackendUser): UserRecord {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    office: user.office?.name ?? "Unassigned",
    roles: user.roles?.map((role) => role.name) ?? [],
    status: user.status,
    lastLogin: user.last_login_at ?? "Never",
  };
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

// ============================================================
// LIB (Line Item Budget) Types & API
// ============================================================

export type LibEntryRecord = {
  id: number;
  projectId: number;
  projectTitle: string | null;
  fundSourceId: number;
  fundSourceName: string | null;
  budgetYear: number;
  papCode: string | null;
  programTitle: string | null;
  implementingAgency: string | null;
  totalDuration: string | null;
  cooperatingAgency: string | null;
  projectLeader: string | null;
  monitoringAgency: string | null;
  objectOfExpenditure: string;
  accountCode: string;
  allocatedAmount: number;
  availableAmount: number;
  status: "Draft" | "Submitted" | "Approved" | "Amended" | "Cancelled" | "Returned" | "Rejected";
  version: number;
  parentId: number | null;
  createdBy: string | null;
  approvedAt: string | null;
  cancelledAt: string | null;
  cancellationReason: string | null;
  createdAt: string | null;
};

export type LibLineItemPayload = {
  main_category: string;
  sub_category: string;
  specific_item?: string | null;
  custom_item_name?: string | null;
  approved_lib_amount?: number;
  jan?: number;
  feb?: number;
  mar?: number;
  apr?: number;
  may?: number;
  jun?: number;
  jul?: number;
  aug?: number;
  sep?: number;
  oct?: number;
  nov?: number;
  dec_amount?: number;
};

export type LibLineItemRecord = {
  id: number;
  libEntryId: number;
  mainCategory: string;
  subCategory: string;
  specificItem: string | null;
  customItemName: string | null;
  approvedLibAmount: number;
  jan: number;
  feb: number;
  mar: number;
  apr: number;
  may: number;
  jun: number;
  jul: number;
  aug: number;
  sep: number;
  oct: number;
  nov: number;
  decAmount: number;
  total: number;
  sortOrder: number;
};

export type LibEntryCreatePayload = {
  project_id: number;
  fund_source_id: number;
  budget_year: number;
  pap_code?: string;
  program_title?: string;
  implementing_agency?: string;
  total_duration?: string;
  cooperating_agency?: string;
  project_leader?: string;
  monitoring_agency?: string;
  object_of_expenditure: string;
  account_code: string;
  allocated_amount: number;
  line_items?: LibLineItemPayload[];
};

export type LibBalanceRecord = {
  allocated: number;
  committed: number;
  available: number;
};

export type ApprovalStepRecord = {
  id: number;
  stageName: string | null;
  approverName: string;
  approverDesignation: string | null;
  action: string;
  remarks: string | null;
  actedAt: string | null;
};

export type ApprovalInboxItem = {
  id: number;
  type: "lib" | "ppmp" | "purchase_request";
  documentNo: string;
  title: string;
  amount: number;
  currentStage: string;
  submittedAt: string | null;
  submittedBy: string;
  projectTitle: string | null;
  fundSource: string | null;
};

type BackendLibEntry = {
  id: number;
  project_id: number;
  project_title: string | null;
  fund_source_id: number;
  fund_source_name: string | null;
  budget_year: number;
  pap_code: string | null;
  program_title: string | null;
  implementing_agency: string | null;
  total_duration: string | null;
  cooperating_agency: string | null;
  project_leader: string | null;
  monitoring_agency: string | null;
  object_of_expenditure: string;
  account_code: string;
  allocated_amount: number;
  available_amount: number;
  status: string;
  version: number;
  parent_id: number | null;
  created_by: string | null;
  approved_at: string | null;
  cancelled_at: string | null;
  cancellation_reason: string | null;
  created_at: string | null;
};

type BackendLibLineItem = {
  id: number;
  lib_entry_id: number;
  main_category: string;
  sub_category: string;
  specific_item: string | null;
  custom_item_name: string | null;
  approved_lib_amount: number;
  jan: number;
  feb: number;
  mar: number;
  apr: number;
  may: number;
  jun: number;
  jul: number;
  aug: number;
  sep: number;
  oct: number;
  nov: number;
  dec_amount: number;
  total: number;
  sort_order: number;
};

type BackendApprovalStep = {
  id: number;
  stage_name: string | null;
  approver_name: string;
  approver_designation: string | null;
  action: string;
  remarks: string | null;
  acted_at: string | null;
};

type BackendApprovalInboxItem = {
  id: number;
  type: "lib" | "ppmp" | "purchase_request";
  document_no: string;
  title: string;
  amount: number;
  current_stage: string;
  submitted_at: string | null;
  submitted_by: string;
  project_title: string | null;
  fund_source: string | null;
};

type BackendPpmpAvailableItem = {
  id: number;
  item_name: string | null;
  code: string | null;
  quantity: number;
  estimated_budget: number;
  encumbered_amount: number;
  available_amount: number;
  ppmp_no: string | null;
  fund_source_id: number | null;
  lib_entry_id: number | null;
};

export type PpmpAvailableItem = {
  id: number;
  itemName: string | null;
  code: string | null;
  quantity: number;
  estimatedBudget: number;
  encumberedAmount: number;
  availableAmount: number;
  ppmpNo: string | null;
  fundSourceId: number | null;
  libEntryId: number | null;
};

export type PpmpDocumentManaged = {
  id: number;
  projectId: number;
  projectTitle: string | null;
  fundSourceId: number | null;
  fundSourceName: string | null;
  ppmpNo: string | null;
  fiscalYear: number;
  endUserUnit: string | null;
  documentType: string;
  status: string;
  version: number;
  parentId: number | null;
  totalEstimatedBudget: number;
  rowCount: number;
  approvedAt: string | null;
  cancelledAt: string | null;
  cancellationReason: string | null;
  createdAt: string | null;
};

type BackendPpmpDocumentManaged = {
  id: number;
  project_id: number;
  project_title: string | null;
  fund_source_id: number | null;
  fund_source_name: string | null;
  ppmp_no: string | null;
  fiscal_year: number;
  end_user_unit: string | null;
  document_type: string;
  status: string;
  version: number;
  parent_id: number | null;
  total_estimated_budget: number;
  row_count: number;
  approved_at: string | null;
  cancelled_at: string | null;
  cancellation_reason: string | null;
  created_at: string | null;
};

export type PpmpItemManaged = {
  id: number;
  ppmpDocumentId: number;
  libEntryId: number | null;
  libAccountCode: string | null;
  libFundSource: string | null;
  fundSourceId: number | null;
  itemName: string | null;
  code: string | null;
  expenseCategory: string | null;
  quantity: number;
  estimatedUnitCost: number;
  estimatedBudget: number;
  encumberedAmount: number;
  availableAmount: number;
  recommendedMode: string | null;
  schedule: string | null;
  remarks: string | null;
};

type BackendPpmpItemManaged = {
  id: number;
  ppmp_document_id: number;
  lib_entry_id: number | null;
  lib_account_code: string | null;
  lib_fund_source: string | null;
  fund_source_id: number | null;
  item_name: string | null;
  code: string | null;
  expense_category: string | null;
  quantity: number;
  estimated_unit_cost: number;
  estimated_budget: number;
  encumbered_amount: number;
  available_amount: number;
  recommended_mode: string | null;
  schedule: string | null;
  remarks: string | null;
};

// --- LIB API Functions ---

export async function apiGetLibEntries(filters?: { project_id?: number; budget_year?: number; status?: string; fund_source_id?: number }) {
  const params = new URLSearchParams();
  if (filters?.project_id) params.set("project_id", String(filters.project_id));
  if (filters?.budget_year) params.set("budget_year", String(filters.budget_year));
  if (filters?.status) params.set("status", filters.status);
  if (filters?.fund_source_id) params.set("fund_source_id", String(filters.fund_source_id));
  const qs = params.toString();
  const result = await request<{ data: BackendLibEntry[] }>(`/lib${qs ? `?${qs}` : ""}`);
  return result.data.map(mapLibEntry);
}

export async function apiGetLibEntry(id: number) {
  const result = await request<{ data: BackendLibEntry; line_items?: BackendLibLineItem[]; approval_trail: BackendApprovalStep[] }>(`/lib/${id}`);
  return {
    entry: mapLibEntry(result.data),
    lineItems: (result.line_items ?? []).map(mapLibLineItem),
    approvalTrail: result.approval_trail.map(mapApprovalStep),
  };
}

export async function apiExportLibEntry(id: number) {
  const result = await request<{ data: BackendLibEntry; line_items: BackendLibLineItem[]; summary: { mooe_subtotal: number; capital_subtotal: number; grand_total: number; approved_lib_total: number } }>(`/lib/${id}/export`);
  return {
    entry: mapLibEntry(result.data),
    lineItems: result.line_items.map(mapLibLineItem),
    summary: result.summary,
  };
}

export async function apiCreateLibEntry(payload: LibEntryCreatePayload) {
  const result = await request<{ data: BackendLibEntry }>("/lib", { method: "POST", body: payload });
  return mapLibEntry(result.data);
}

export async function apiUpdateLibEntry(id: number, payload: Partial<LibEntryCreatePayload>) {
  const result = await request<{ data: BackendLibEntry }>(`/lib/${id}`, { method: "PUT", body: payload });
  return mapLibEntry(result.data);
}

export async function apiLibAction(id: number, action: "submit" | "approve" | "return" | "reject" | "amend" | "cancel", payload?: { remarks?: string; reason?: string }) {
  const result = await request<{ data: BackendLibEntry; message: string }>(`/lib/${id}/${action}`, { method: "POST", body: payload });
  return { entry: mapLibEntry(result.data), message: result.message };
}

export async function apiGetLibBalance(id: number) {
  return request<LibBalanceRecord>(`/lib/${id}/balance`);
}

// --- PPMP Document Managed API Functions ---

export async function apiGetPpmpDocuments(filters?: { project_id?: number; fiscal_year?: number; status?: string }) {
  const params = new URLSearchParams();
  if (filters?.project_id) params.set("project_id", String(filters.project_id));
  if (filters?.fiscal_year) params.set("fiscal_year", String(filters.fiscal_year));
  if (filters?.status) params.set("status", filters.status);
  const qs = params.toString();
  const result = await request<{ data: BackendPpmpDocumentManaged[] }>(`/ppmp-documents${qs ? `?${qs}` : ""}`);
  return result.data.map(mapPpmpDocumentManaged);
}

export async function apiGetPpmpDocumentDetail(id: number) {
  const result = await request<{ data: BackendPpmpDocumentManaged; items: BackendPpmpItemManaged[]; approval_trail: BackendApprovalStep[] }>(`/ppmp-documents/${id}`);
  return {
    document: mapPpmpDocumentManaged(result.data),
    items: result.items.map(mapPpmpItemManaged),
    approvalTrail: result.approval_trail.map(mapApprovalStep),
  };
}

export async function apiCreatePpmpDocumentManaged(payload: { project_id: number; fund_source_id?: number; ppmp_no?: string; fiscal_year: number; end_user_unit?: string; document_type: "Indicative" | "Final" }) {
  const result = await request<{ data: BackendPpmpDocumentManaged }>("/ppmp-documents", { method: "POST", body: payload });
  return mapPpmpDocumentManaged(result.data);
}

export async function apiPpmpDocAction(id: number, action: string, payload?: Record<string, unknown>) {
  const result = await request<{ data: BackendPpmpDocumentManaged; message: string }>(`/ppmp-documents/${id}/${action}`, { method: "POST", body: payload });
  return { document: mapPpmpDocumentManaged(result.data), message: result.message };
}

export async function apiAddPpmpItemManaged(docId: number, payload: Record<string, unknown>) {
  const result = await request<{ data: BackendPpmpItemManaged }>(`/ppmp-documents/${docId}/items`, { method: "POST", body: payload });
  return mapPpmpItemManaged(result.data);
}

export async function apiUpdatePpmpItemManaged(docId: number, itemId: number, payload: Record<string, unknown>) {
  const result = await request<{ data: BackendPpmpItemManaged }>(`/ppmp-documents/${docId}/items/${itemId}`, { method: "PUT", body: payload });
  return mapPpmpItemManaged(result.data);
}

export async function apiRemovePpmpItemManaged(docId: number, itemId: number) {
  await request(`/ppmp-documents/${docId}/items/${itemId}`, { method: "DELETE" });
}

export async function apiGetAvailablePpmpItems(filters?: { fund_source_id?: number; project_id?: number }) {
  const params = new URLSearchParams();
  if (filters?.fund_source_id) params.set("fund_source_id", String(filters.fund_source_id));
  if (filters?.project_id) params.set("project_id", String(filters.project_id));
  const qs = params.toString();
  const result = await request<{ data: BackendPpmpAvailableItem[] }>(`/ppmp-items/available${qs ? `?${qs}` : ""}`);
  return result.data.map(mapPpmpAvailableItem);
}

// --- Approval Inbox API Functions ---

export async function apiGetApprovalInbox(type?: string) {
  const qs = type ? `?type=${type}` : "";
  const result = await request<{ data: BackendApprovalInboxItem[] }>(`/approval-inbox${qs}`);
  return result.data.map(mapApprovalInboxItem);
}

export async function apiGetApprovalInboxCount() {
  return request<{ count: number }>("/approval-inbox/count");
}

export async function apiInboxAction(type: string, id: number, action: "approve" | "return" | "reject", payload?: { remarks?: string }) {
  return request<{ message: string; status: string }>(`/approval-inbox/${type}/${id}/${action}`, { method: "POST", body: payload });
}

// --- PR Cancel ---

export async function apiCancelPurchaseRequest(id: number | string, reason: string) {
  return request<{ data: unknown; message: string }>(`/purchase-requests/${id}/cancel`, { method: "POST", body: { reason } });
}

// --- Workflow Config ---

export async function apiGetWorkflowConfig() {
  return request<{ data: Record<string, Array<{ id: number; document_type: string; stage_order: number; stage_name: string; required_role: string; is_final: boolean }>> }>("/workflow-config");
}

// --- Fund Sources (already exists in generic resource, adding convenience) ---

export async function apiGetFundSources() {
  const result = await request<{ data: Array<{ id: number; name: string; fund_type: string; description: string | null; active: boolean }> }>("/fund-sources");
  return result.data;
}

export async function apiGetProjects() {
  const result = await request<{ data: Array<{ id: number; code: string; title: string; fiscal_year: number; status: string; office?: { name: string } | null; fund_source_id?: number | null }> }>("/projects");
  return result.data;
}

// --- Mappers ---

function mapLibEntry(entry: BackendLibEntry): LibEntryRecord {
  return {
    id: entry.id,
    projectId: entry.project_id,
    projectTitle: entry.project_title,
    fundSourceId: entry.fund_source_id,
    fundSourceName: entry.fund_source_name,
    budgetYear: entry.budget_year,
    papCode: entry.pap_code,
    programTitle: entry.program_title,
    implementingAgency: entry.implementing_agency,
    totalDuration: entry.total_duration,
    cooperatingAgency: entry.cooperating_agency,
    projectLeader: entry.project_leader,
    monitoringAgency: entry.monitoring_agency,
    objectOfExpenditure: entry.object_of_expenditure,
    accountCode: entry.account_code,
    allocatedAmount: Number(entry.allocated_amount),
    availableAmount: Number(entry.available_amount),
    status: entry.status as LibEntryRecord["status"],
    version: entry.version,
    parentId: entry.parent_id,
    createdBy: entry.created_by,
    approvedAt: entry.approved_at,
    cancelledAt: entry.cancelled_at,
    cancellationReason: entry.cancellation_reason,
    createdAt: entry.created_at,
  };
}

function mapLibLineItem(item: BackendLibLineItem): LibLineItemRecord {
  return {
    id: item.id,
    libEntryId: item.lib_entry_id,
    mainCategory: item.main_category,
    subCategory: item.sub_category,
    specificItem: item.specific_item,
    customItemName: item.custom_item_name,
    approvedLibAmount: Number(item.approved_lib_amount),
    jan: Number(item.jan),
    feb: Number(item.feb),
    mar: Number(item.mar),
    apr: Number(item.apr),
    may: Number(item.may),
    jun: Number(item.jun),
    jul: Number(item.jul),
    aug: Number(item.aug),
    sep: Number(item.sep),
    oct: Number(item.oct),
    nov: Number(item.nov),
    decAmount: Number(item.dec_amount),
    total: Number(item.total),
    sortOrder: item.sort_order,
  };
}

function mapApprovalStep(step: BackendApprovalStep): ApprovalStepRecord {
  return {
    id: step.id,
    stageName: step.stage_name,
    approverName: step.approver_name,
    approverDesignation: step.approver_designation,
    action: step.action,
    remarks: step.remarks,
    actedAt: step.acted_at,
  };
}

function mapApprovalInboxItem(item: BackendApprovalInboxItem): ApprovalInboxItem {
  return {
    id: item.id,
    type: item.type,
    documentNo: item.document_no,
    title: item.title,
    amount: Number(item.amount),
    currentStage: item.current_stage,
    submittedAt: item.submitted_at,
    submittedBy: item.submitted_by,
    projectTitle: item.project_title,
    fundSource: item.fund_source,
  };
}

function mapPpmpDocumentManaged(doc: BackendPpmpDocumentManaged): PpmpDocumentManaged {
  return {
    id: doc.id,
    projectId: doc.project_id,
    projectTitle: doc.project_title,
    fundSourceId: doc.fund_source_id,
    fundSourceName: doc.fund_source_name,
    ppmpNo: doc.ppmp_no,
    fiscalYear: doc.fiscal_year,
    endUserUnit: doc.end_user_unit,
    documentType: doc.document_type,
    status: doc.status,
    version: doc.version,
    parentId: doc.parent_id,
    totalEstimatedBudget: Number(doc.total_estimated_budget),
    rowCount: doc.row_count,
    approvedAt: doc.approved_at,
    cancelledAt: doc.cancelled_at,
    cancellationReason: doc.cancellation_reason,
    createdAt: doc.created_at,
  };
}

function mapPpmpItemManaged(item: BackendPpmpItemManaged): PpmpItemManaged {
  return {
    id: item.id,
    ppmpDocumentId: item.ppmp_document_id,
    libEntryId: item.lib_entry_id,
    libAccountCode: item.lib_account_code,
    libFundSource: item.lib_fund_source,
    fundSourceId: item.fund_source_id,
    itemName: item.item_name,
    code: item.code,
    expenseCategory: item.expense_category,
    quantity: Number(item.quantity),
    estimatedUnitCost: Number(item.estimated_unit_cost),
    estimatedBudget: Number(item.estimated_budget),
    encumberedAmount: Number(item.encumbered_amount),
    availableAmount: Number(item.available_amount),
    recommendedMode: item.recommended_mode,
    schedule: item.schedule,
    remarks: item.remarks,
  };
}

function mapPpmpAvailableItem(item: BackendPpmpAvailableItem): PpmpAvailableItem {
  return {
    id: item.id,
    itemName: item.item_name,
    code: item.code,
    quantity: Number(item.quantity),
    estimatedBudget: Number(item.estimated_budget),
    encumberedAmount: Number(item.encumbered_amount),
    availableAmount: Number(item.available_amount),
    ppmpNo: item.ppmp_no,
    fundSourceId: item.fund_source_id,
    libEntryId: item.lib_entry_id,
  };
}
