import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Gavel, Inbox } from "lucide-react";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/app/status-badge";
import { apiGetApprovals, apiGetAocs } from "@/lib/api";
import { useCurrentUser, useCanAccess } from "@/lib/current-user";

const PREVIEW_LIMIT = 5;

/**
 * "Needs Your Action" — a capped preview (never the whole queue) of PRs awaiting recommendation/
 * approval and, for the BAC Chair/Vice-Chair, Abstracts of Canvas awaiting BAC review. Links out
 * to the full Approval Inbox / BAC Review tab for anything beyond the preview.
 */
function NeedsYourActionCard() {
  const canAccess = useCanAccess();
  const { user } = useCurrentUser();
  const showApprovals = canAccess("approvals");
  const isBacReviewer = Boolean(user?.isBacChair || user?.isBacViceChair || user?.tier === "superadmin");

  const { data: approvals = [] } = useQuery({
    queryKey: ["dashboard-approvals-preview"],
    queryFn: () => apiGetApprovals(PREVIEW_LIMIT),
    enabled: showApprovals,
  });
  const { data: aocs = [] } = useQuery({
    queryKey: ["dashboard-bac-preview"],
    queryFn: () => apiGetAocs(["Pending BAC Review"], PREVIEW_LIMIT),
    enabled: isBacReviewer,
  });

  if (!showApprovals && !isBacReviewer) return null;

  return (
    <Card className="border border-border bg-card p-4">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-navy">
        <Inbox className="h-4 w-4 text-primary" /> Needs Your Action
      </h3>

      {showApprovals && (
        <div className="mb-1">
          <div className="mb-1 flex items-center justify-between">
            <p className="label-eyebrow">Approval Inbox</p>
            <Link to="/approval-inbox" className="text-xs font-medium text-primary hover:underline">View all</Link>
          </div>
          {approvals.length === 0 ? (
            <p className="py-2 text-xs text-muted-foreground">Nothing awaiting your action.</p>
          ) : (
            <div className="divide-y divide-border">
              {approvals.map((pr) => (
                <div key={pr.id} className="flex items-center justify-between gap-3 py-2">
                  <span className="truncate text-sm font-medium text-navy">{pr.prNo}</span>
                  <StatusBadge status={pr.status} />
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {isBacReviewer && (
        <div className={showApprovals ? "mt-3 border-t border-border pt-3" : undefined}>
          <div className="mb-1 flex items-center justify-between">
            <p className="label-eyebrow flex items-center gap-1"><Gavel className="h-3 w-3" /> BAC Review</p>
            <Link to="/approval-inbox" search={{ tab: "bac" }} className="text-xs font-medium text-primary hover:underline">View all</Link>
          </div>
          {aocs.length === 0 ? (
            <p className="py-2 text-xs text-muted-foreground">Nothing awaiting BAC review.</p>
          ) : (
            <div className="divide-y divide-border">
              {aocs.map((aoc) => (
                <div key={aoc.id} className="flex items-center justify-between gap-3 py-2">
                  <span className="truncate text-sm font-medium text-navy">{aoc.rfqNo}</span>
                  <StatusBadge status={aoc.status} />
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

export function PrTrackerSection() {
  return <NeedsYourActionCard />;
}
