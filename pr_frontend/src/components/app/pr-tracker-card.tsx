import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ClipboardList, Gavel, Inbox, PackageCheck, Star, Wrench } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/app/status-badge";
import { apiGetApprovals, apiGetAocs, apiGetMyVenueRatings, apiGetRfqsPage } from "@/lib/api";
import { useCurrentUser, useCanAccess } from "@/lib/current-user";

const PREVIEW_LIMIT = 5;

type Row = { key: string; title: string; note?: string; status: string; to: "/rfq/$rfqId" | "/aoc/$aocId" | "/purchase-requests/$prId"; id: string };
type Section = { key: string; label: string; icon: LucideIcon; rows: Row[]; empty: string; viewAll?: { to: "/approval-inbox" | "/rfq"; search?: { tab: "bac" } } };

/**
 * "Needs Your Action" — capped previews (never the whole queue) of everything waiting on the
 * signed-in user somewhere along the flowchart: PR approvals, RFQ signatures, TWG checks, BAC
 * decisions, Supply noting the lowest bidder, replacement suppliers, and venue ratings.
 */
function NeedsYourActionCard() {
  const canAccess = useCanAccess();
  const { user } = useCurrentUser();
  const superadmin = user?.tier === "superadmin";
  const showApprovals = canAccess("approvals");
  const canRfq = canAccess("rfq");
  const isBac = Boolean(user?.isBacChair || user?.isBacViceChair || superadmin);
  const isSupply = Boolean(user?.isSupplyOfficer || superadmin) && canRfq;
  const isTwg = Boolean(user?.isTwgLead || superadmin) && canRfq;

  const { data: approvals = [] } = useQuery({
    queryKey: ["dashboard-approvals-preview"],
    queryFn: () => apiGetApprovals(PREVIEW_LIMIT),
    enabled: showApprovals,
  });
  const { data: bacAocs = [] } = useQuery({
    queryKey: ["dashboard-bac-preview"],
    queryFn: () => apiGetAocs(["Pending BAC Review", "Pending BAC Satisfaction"], PREVIEW_LIMIT),
    enabled: isBac && (canRfq || showApprovals),
  });
  const { data: bacRfqs } = useQuery({
    queryKey: ["dashboard-rfq-bac-sign"],
    queryFn: () => apiGetRfqsPage(1, PREVIEW_LIMIT, { status: "Pending BAC Signature" }),
    enabled: isBac && canRfq,
  });
  const { data: supplyRfqs } = useQuery({
    queryKey: ["dashboard-rfq-supply"],
    queryFn: () => apiGetRfqsPage(1, 20, { status: "Draft,Pending Supply Officer Countersign,Canvassing,TWG Evaluation" }),
    enabled: isSupply,
  });
  const { data: supplyAocs = [] } = useQuery({
    queryKey: ["dashboard-supply-noting"],
    queryFn: () => apiGetAocs(["For Supply Noting"], PREVIEW_LIMIT),
    enabled: isSupply,
  });
  const { data: twgRfqs } = useQuery({
    queryKey: ["dashboard-rfq-twg"],
    queryFn: () => apiGetRfqsPage(1, PREVIEW_LIMIT, { status: "TWG Evaluation" }),
    enabled: isTwg,
  });
  const { data: twgAocs = [] } = useQuery({
    queryKey: ["dashboard-twg-returned"],
    queryFn: () => apiGetAocs(["BAC Returned"], PREVIEW_LIMIT),
    enabled: isTwg,
  });
  const { data: venueAocs = [] } = useQuery({
    queryKey: ["dashboard-venue-ratings"],
    queryFn: apiGetMyVenueRatings,
  });

  const sections: Section[] = [];
  if (showApprovals) {
    sections.push({
      key: "approvals",
      label: "Approval Inbox",
      icon: Inbox,
      empty: "No Purchase Request awaiting your action.",
      viewAll: { to: "/approval-inbox" },
      rows: approvals.map((pr) => ({ key: `pr-${pr.id}`, title: pr.prNo, status: pr.status, to: "/purchase-requests/$prId", id: pr.id })),
    });
  }
  if (isBac) {
    sections.push({
      key: "bac",
      label: "BAC",
      icon: Gavel,
      empty: "Nothing awaiting the BAC.",
      viewAll: { to: "/approval-inbox", search: { tab: "bac" } },
      rows: [
        ...(bacRfqs?.items ?? []).map((r) => ({ key: `rfq-${r.id}`, title: r.rfqNo, note: "Sign the RFQ", status: r.status, to: "/rfq/$rfqId" as const, id: r.id })),
        ...bacAocs.map((a) => ({ key: `aoc-${a.id}`, title: a.rfqNo, note: a.status === "Pending BAC Satisfaction" ? "Satisfied with the TWG response?" : "Review the AOC", status: a.status, to: "/aoc/$aocId" as const, id: a.id })),
      ],
    });
  }
  if (isSupply) {
    const supplyRows: Row[] = [];
    for (const r of supplyRfqs?.items ?? []) {
      if (r.status === "Draft" || r.status === "Pending Supply Officer Countersign") {
        supplyRows.push({ key: `rfq-${r.id}`, title: r.rfqNo, note: "Counter-sign the RFQ", status: r.status, to: "/rfq/$rfqId", id: r.id });
      } else if (r.openSupplierSlots > 0 && !r.abstractOfCanvasId) {
        supplyRows.push({ key: `rfq-${r.id}`, title: r.rfqNo, note: `Choose ${r.openSupplierSlots} replacement supplier${r.openSupplierSlots > 1 ? "s" : ""}`, status: r.status, to: "/rfq/$rfqId", id: r.id });
      }
    }
    for (const a of supplyAocs) supplyRows.push({ key: `aoc-${a.id}`, title: a.rfqNo, note: "Note the lowest bidder", status: a.status, to: "/aoc/$aocId", id: a.id });
    sections.push({ key: "supply", label: "Supply Officer", icon: PackageCheck, empty: "Nothing awaiting the Supply Officer.", viewAll: { to: "/rfq" }, rows: supplyRows.slice(0, PREVIEW_LIMIT * 2) });
  }
  if (isTwg) {
    sections.push({
      key: "twg",
      label: "TWG",
      icon: Wrench,
      empty: "Nothing awaiting the TWG.",
      rows: [
        ...(twgRfqs?.items ?? []).map((r) => ({ key: `rfq-${r.id}`, title: r.rfqNo, note: "Check each equipment item", status: r.status, to: "/rfq/$rfqId" as const, id: r.id })),
        ...twgAocs.map((a) => ({ key: `aoc-${a.id}`, title: a.rfqNo, note: "Address the BAC remarks", status: a.status, to: "/aoc/$aocId" as const, id: a.id })),
      ],
    });
  }
  if (venueAocs.length > 0) {
    sections.push({
      key: "venues",
      label: "Venue Rating",
      icon: Star,
      empty: "",
      rows: venueAocs.map((a) => ({ key: `venue-${a.id}`, title: a.rfqNo, note: "Rate the venues", status: a.status, to: "/aoc/$aocId", id: a.id })),
    });
  }

  if (sections.length === 0) return null;

  return (
    <Card className="border border-border bg-card p-4">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-navy">
        <Inbox className="h-4 w-4 text-primary" /> Needs Your Action
      </h3>

      {sections.map((section, i) => {
        const Icon = section.icon ?? ClipboardList;
        return (
          <div key={section.key} className={i > 0 ? "mt-3 border-t border-border pt-3" : "mb-1"}>
            <div className="mb-1 flex items-center justify-between">
              <p className="label-eyebrow flex items-center gap-1"><Icon className="h-3 w-3" /> {section.label}</p>
              {section.viewAll && (
                <Link to={section.viewAll.to} search={section.viewAll.search} className="text-xs font-medium text-primary hover:underline">View all</Link>
              )}
            </div>
            {section.rows.length === 0 ? (
              <p className="py-2 text-xs text-muted-foreground">{section.empty}</p>
            ) : (
              <div className="divide-y divide-border">
                {section.rows.map((row) => (
                  <Link
                    key={row.key}
                    to={row.to}
                    params={row.to === "/rfq/$rfqId" ? { rfqId: row.id } : row.to === "/aoc/$aocId" ? { aocId: row.id } : { prId: row.id }}
                    className="flex items-center justify-between gap-3 py-2 hover:bg-secondary/40"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-navy">{row.title}</span>
                      {row.note && <span className="block truncate text-xs text-muted-foreground">{row.note}</span>}
                    </span>
                    <StatusBadge status={row.status} />
                  </Link>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </Card>
  );
}

export function PrTrackerSection() {
  return <NeedsYourActionCard />;
}
