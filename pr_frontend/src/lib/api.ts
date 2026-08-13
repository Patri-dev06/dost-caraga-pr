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
  isSupervisor: boolean; // designated Supervisor for LIB recommending approval
  isRegionalDirector: boolean; // designated Regional Director for LIB final approval
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

export type Signatory = { id: number; name: string; tier: UserTier; position: string | null };

/** Approved accounts (status = Active) for signatory pickers — any signed-in user may read this. */
export async function apiGetSignatories(): Promise<Signatory[]> {
  const result = await request<ApiList<{ id: number; name: string; tier?: UserTier; position?: string | null }>>("/signatories");
  return result.data.map((u) => ({ id: u.id, name: u.name, tier: u.tier ?? "regular", position: u.position ?? null }));
}

export type BudgetOfficer = { id: number; name: string; position: string; isCurrentUser: boolean };

/** The account designated as Budget Officer, used to certify fund availability on PPMPs. */
export async function apiGetBudgetOfficer(): Promise<BudgetOfficer | null> {
  const result = await request<{ data: BudgetOfficer | null }>("/budget-officer");
  return result.data;
}

export type WorkflowSignatory = { id: number; name: string; position: string; isCurrentUser: boolean };
export type WorkflowSignatories = {
  supervisor: WorkflowSignatory | null;
  budgetOfficer: WorkflowSignatory | null;
  regionalDirector: WorkflowSignatory | null;
};

/** The designated routing signatories (Supervisor, Budget Officer, Regional Director). */
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

export async function apiGetPlanningLibs<T = unknown>(): Promise<T[]> {
  const result = await request<ApiList<T>>("/planning-libs");
  return result.data;
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

export async function apiGetPlanningPpmps<T = unknown>(libId?: string): Promise<T[]> {
  const query = libId ? `?lib_id=${encodeURIComponent(libId)}` : "";
  const result = await request<ApiList<T>>(`/planning-ppmps${query}`);
  return result.data;
}

export async function apiUpsertPlanningPpmp<T = unknown>(payload: T & { id?: string }): Promise<T> {
  const id = payload.id;
  const result = await request<ApiRecord<T>>(id ? `/planning-ppmps/${encodeURIComponent(id)}` : "/planning-ppmps", {
    method: id ? "PUT" : "POST",
    body: payload,
  });
  return result.data;
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
  office_id?: number | null;
  position?: string | null;
  roles?: BackendRole[];
  status: string;
  tier?: UserTier;
  modules?: string[] | null;
  access_modules?: string[];
  is_budget_officer?: boolean;
  is_supervisor?: boolean;
  is_regional_director?: boolean;
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
    position: user.position ?? "",
    isBudgetOfficer: Boolean(user.is_budget_officer),
    isSupervisor: Boolean(user.is_supervisor),
    isRegionalDirector: Boolean(user.is_regional_director),
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
