// Central registry of access-controlled modules. Must stay in sync with the
// backend User model (App\Models\User::ALL_MODULES / TOGGLEABLE_MODULES).

export type ModuleKey =
  | "dashboard"
  | "pr"
  | "lib"
  | "ppmp"
  | "rfq"
  | "po"
  | "validation"
  | "approvals"
  | "references"
  | "reports"
  | "users"
  | "audit"
  | "settings";

/** Modules a Superadmin can grant/revoke on an individual regular account. */
export const TOGGLEABLE_MODULES: ModuleKey[] = ["pr", "lib", "ppmp", "rfq", "po", "validation", "approvals", "references", "reports"];

export const MODULE_LABELS: Record<ModuleKey, string> = {
  dashboard: "Dashboard",
  pr: "Purchase Requests",
  lib: "Line Item Budget",
  ppmp: "PPMP",
  rfq: "RFQ",
  po: "Purchase Orders",
  validation: "Validation",
  approvals: "Approval Inbox",
  references: "References (APP-CSE/Non-CSE/Budget)",
  reports: "Reports",
  users: "User Management",
  audit: "Audit Logs",
  settings: "Settings",
};

/** Resolve which module governs a given route path (null = public/ungated). */
export function moduleForPath(pathname: string): ModuleKey | null {
  if (pathname === "/") return "dashboard";
  if (pathname === "/login") return null;
  // The Supplier Portal is public (checked before "/po", which it would otherwise match).
  if (pathname === "/portal" || pathname.startsWith("/portal/")) return null;
  if (pathname.startsWith("/planning/lib")) return "lib";
  if (pathname.startsWith("/planning/ppmp")) return "ppmp";
  if (pathname.startsWith("/purchase-requests")) return "pr";
  if (pathname.startsWith("/rfq")) return "rfq";
  // An AOC is also opened by its venue raters (e.g. the end-user); the server decides who may see it.
  if (pathname.startsWith("/aoc")) return null;
  if (pathname.startsWith("/suppliers")) return "rfq";
  if (pathname.startsWith("/po")) return "po";
  if (pathname.startsWith("/validation")) return "validation";
  if (pathname.startsWith("/approval-inbox")) return "approvals";
  if (pathname.startsWith("/references")) return "references";
  if (pathname.startsWith("/reports")) return "reports";
  if (pathname.startsWith("/users")) return "users";
  if (pathname.startsWith("/audit-logs")) return "audit";
  if (pathname.startsWith("/settings")) return "settings";
  return null;
}
