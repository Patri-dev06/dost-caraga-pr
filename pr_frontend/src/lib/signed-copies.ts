import type { CurrentUser } from "./api";

/** The Supply team, who may upload a signed copy on a signatory's behalf (mirrors the backend's check). */
export function isSupplyTeam(user: CurrentUser | null | undefined): boolean {
  if (!user) return false;
  return user.tier === "superadmin" || user.tier === "admin" || user.isSupplyOfficer || user.modules.includes("rfq") || user.modules.includes("po");
}
