import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Gavel, Inbox, ListChecks } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/app/status-badge";
import { ListPagination } from "@/components/app/list-pagination";
import { apiGetMyPurchaseRequestsPage, apiGetApprovals, apiGetAocs } from "@/lib/api";
import { fmtPHP, prTotal } from "@/lib/mock-data";
import { useCurrentUser, useCanAccess } from "@/lib/current-user";

const PER_PAGE = 5;
const PREVIEW_LIMIT = 5;

/**
 * "My Purchase Requests" — the signed-in user's own PRs, one small page at a time. Always asks
 * the server for just this page (never the whole list), so it stays cheap no matter how many PRs
 * a user accumulates over time, and paginates instead of dumping everything onto the dashboard.
 */
function MyPurchaseRequestsCard() {
  const [page, setPage] = useState(1);
  const { data, isLoading, error } = useQuery({
    queryKey: ["my-purchase-requests", page],
    queryFn: () => apiGetMyPurchaseRequestsPage(page, PER_PAGE),
  });

  const items = data?.items ?? [];

  return (
    <Card className="border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-navy">
          <ListChecks className="h-4 w-4 text-primary" /> My Purchase Requests
        </h3>
        {!!data?.total && (
          <span className="text-xs text-muted-foreground">
            {(page - 1) * PER_PAGE + 1}–{Math.min(page * PER_PAGE, data.total)} of {data.total}
          </span>
        )}
      </div>

      {isLoading && <p className="py-6 text-center text-sm text-muted-foreground">Fetching data, kindly wait.</p>}
      {!isLoading && error && (
        <p className="py-6 text-center text-sm text-muted-foreground">{error instanceof Error ? error.message : "Unable to load your Purchase Requests."}</p>
      )}
      {!isLoading && !error && items.length === 0 && (
        <p className="py-6 text-center text-sm text-muted-foreground">You haven&apos;t filed a Purchase Request yet.</p>
      )}

      {items.length > 0 && (
        <div className="divide-y divide-border">
          {items.map((pr) => (
            <Link
              key={pr.id}
              to="/purchase-requests/$prId"
              params={{ prId: pr.id }}
              className="flex items-center justify-between gap-3 py-2.5 transition-colors hover:bg-secondary/40"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-navy">{pr.prNo}</p>
                <p className="truncate text-xs text-muted-foreground">{pr.stage || pr.projectTitle}</p>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <span className="hidden text-xs font-medium tabular-nums text-muted-foreground sm:inline">{fmtPHP(prTotal(pr))}</span>
                <StatusBadge status={pr.status} />
              </div>
            </Link>
          ))}
        </div>
      )}

      {data && <ListPagination page={page} lastPage={data.lastPage} onPageChange={setPage} className="mt-3" />}
    </Card>
  );
}

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
  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
      <MyPurchaseRequestsCard />
      <NeedsYourActionCard />
    </div>
  );
}
