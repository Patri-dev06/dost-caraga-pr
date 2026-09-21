import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { FilePlus2, FileText, AlertTriangle, FileCheck2, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/app/page-header";
import { StatusBadge } from "@/components/app/status-badge";
import { apiGetPurchaseRequests, apiGetRfqs } from "@/lib/api";
import { fmtAmount } from "@/lib/lib-store";
import type { PurchaseRequest } from "@/lib/mock-data";
import { useQuery } from "@tanstack/react-query";

export const Route = createFileRoute("/rfq")({
  head: () => ({
    meta: [
      { title: "RFQ — DOST Caraga" },
      { name: "description", content: "Request for Quotation documents generated from Purchase Requests." },
    ],
  }),
  component: RfqListPage,
});

function RfqListPage() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const { data: prs = [], isLoading: loadingPrs, error: prsError } = useQuery({
    queryKey: ["purchase-requests"],
    queryFn: apiGetPurchaseRequests,
    enabled: pathname === "/rfq",
  });

  const { data: rfqs = [], isLoading: loadingRfqs } = useQuery({
    queryKey: ["rfqs"],
    queryFn: () => apiGetRfqs(),
    enabled: pathname === "/rfq",
  });

  if (pathname !== "/rfq") return <Outlet />;

  const loading = loadingPrs || loadingRfqs;
  const approvedPrs = prs.filter((pr) => pr.status === "Approved");

  return (
    <div className="mx-auto w-full max-w-7xl space-y-5 px-3 py-4 sm:space-y-6 sm:px-6 sm:py-8 lg:px-8">
      <PageHeader
        eyebrow="Procurement"
        title="Request for Quotation"
        subtitle="Generate RFQ documents from approved Purchase Requests."
      />

      {prsError && (
        <div className="flex items-center gap-3 rounded-lg border border-warning/40 bg-warning/10 p-4">
          <AlertTriangle className="h-5 w-5 shrink-0 text-warning" />
          <div>
            <p className="text-sm font-semibold text-warning-foreground">Server Unavailable</p>
            <p className="mt-0.5 text-xs text-muted-foreground">Could not load Purchase Requests from server.</p>
          </div>
        </div>
      )}

      {loading ? (
        <div className="rounded-xl border border-border bg-card p-10 text-center">
          <p className="text-sm text-muted-foreground">Loading…</p>
        </div>
      ) : (
        <>
          {/* Existing RFQs */}
          {rfqs.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-sm font-semibold text-navy">Generated RFQs</h2>
              <div className="divide-y divide-border rounded-xl border border-border bg-card shadow-card">
                {rfqs.map((rfq) => (
                  <div key={rfq.id} className="flex items-center gap-4 px-4 py-3 transition-colors hover:bg-secondary/40">
                    <FileCheck2 className="h-4 w-4 shrink-0 text-primary" />
                    <div className="min-w-0 flex-1">
                      <Link to="/rfq/$rfqId" params={{ rfqId: rfq.id }} className="text-sm font-medium text-navy hover:underline">
                        {rfq.rfqNo}
                      </Link>
                      <p className="text-xs text-muted-foreground">
                        PR: {rfq.prNo} · {rfq.items.length} items · ₱{fmtAmount(rfq.estimatedBudget)} · {rfq.stage}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center justify-end gap-1.5">
                      <StatusBadge status={rfq.status} />
                      {rfq.abstractOfCanvasStatus && rfq.abstractOfCanvasStatus !== rfq.status && (
                        <Link to="/aoc/$aocId" params={{ aocId: rfq.abstractOfCanvasId ?? "" }} title="Abstract of Canvas status">
                          <StatusBadge status={rfq.abstractOfCanvasStatus} />
                        </Link>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* PR list to generate RFQ from */}
          {approvedPrs.length > 0 ? (
            <div className="space-y-3">
              <h2 className="text-sm font-semibold text-navy">Generate RFQ from Purchase Request</h2>
              <p className="text-xs text-muted-foreground">
                Select a Purchase Request to auto-generate an RFQ document.
              </p>
              <div className="divide-y divide-border rounded-xl border border-border bg-card shadow-card">
                {approvedPrs.map((pr) => (
                  <ApprovedPrCard key={pr.id} pr={pr} existingRfqCount={rfqs.filter((r) => r.prId === pr.id).length} />
                ))}
              </div>
            </div>
          ) : !prsError ? (
            <div className="rounded-xl border border-border bg-card p-10 text-center">
              <FileText className="mx-auto mb-2 h-8 w-8 text-muted-foreground/60" strokeWidth={1.5} />
              <p className="text-sm font-semibold text-navy">No Approved Purchase Requests</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Approve a Purchase Request first, then generate an RFQ here.
              </p>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

function ApprovedPrCard({ pr, existingRfqCount }: { pr: PurchaseRequest; existingRfqCount: number }) {
  return (
    <div className="flex flex-wrap items-center gap-4 px-4 py-3 transition-colors hover:bg-secondary/40">
      <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-navy">{pr.prNo}</p>
        <p className="text-xs text-muted-foreground">
          {pr.office} · {pr.items.length} item{pr.items.length !== 1 ? "s" : ""} · {pr.purpose}
        </p>
      </div>
      <div className="text-right">
        <p className="text-sm font-semibold tabular-nums text-navy">₱{fmtAmount(pr.amount)}</p>
        {existingRfqCount > 0 && (
          <p className="text-[10px] text-muted-foreground">{existingRfqCount} RFQ(s) generated</p>
        )}
      </div>
      <Button asChild variant="outline" size="sm" className="gap-1.5">
        <Link to="/purchase-requests/new" search={{ view: pr.id }}>
          <Eye className="h-4 w-4" /> Preview PR
        </Link>
      </Button>
      <Button asChild size="sm" className="gap-1.5">
        <Link to="/rfq/new" search={{ pr: pr.id }}>
          <FilePlus2 className="h-4 w-4" /> Generate RFQ
        </Link>
      </Button>
    </div>
  );
}
