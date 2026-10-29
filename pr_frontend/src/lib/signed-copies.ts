import type { CurrentUser } from "./api";

/** The Supply team, who may upload a signed copy on a signatory's behalf (mirrors the backend's check). */
export function isSupplyTeam(user: CurrentUser | null | undefined): boolean {
  if (!user) return false;
  return user.tier === "superadmin" || user.tier === "admin" || user.isSupplyOfficer || user.modules.includes("rfq") || user.modules.includes("po");
}

/**
 * Whether this user can sign this PR's step digitally with PNPKI: they are the very person named for
 * it, they registered a certificate, and the signatory before them signed digitally too (requester →
 * recommending officer → Regional Director, all on the same PDF).
 */
export function canSignPrDigitally(
  user: CurrentUser | null | undefined,
  pr: { requestedById?: number | null; recommendingOfficer?: { id: number } | null; digitallySigned?: string[] } | null,
  step: "submit" | "recommend" | "approve",
): boolean {
  if (!user?.pnpkiEnabled || !user.hasPnpkiCertificate) return false;
  const signed = pr?.digitallySigned ?? [];
  if (step === "submit") return !pr || pr.requestedById == null || pr.requestedById === user.id;
  if (step === "recommend") return pr?.recommendingOfficer?.id === user.id && signed.includes("requested");
  return user.isRegionalDirector && signed.includes("recommending");
}
