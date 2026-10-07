import { createFileRoute, Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { rowClick } from "@/lib/row-click";
import { useState } from "react";
import { AlertTriangle, FileCheck2, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/app/page-header";
import { StatusBadge } from "@/components/app/status-badge";
import { ListPagination } from "@/components/app/list-pagination";
import { apiGetPurchaseOrdersPage } from "@/lib/api";
import { fmtAmount } from "@/lib/lib-store";
import { useQuery } from "@tanstack/react-query";

const PER_PAGE = 20;

export const Route = createFileRoute("/po")({
  head: () => ({
    meta: [
      { title: "Purchase Orders — DOST Caraga" },
      { name: "description", content: "Review automatically generated Purchase Orders and track their approval." },
    ],
  }),
  component: PurchaseOrderListPage,
});

function PurchaseOrderListPage() {
  // /po/$poId is a child of this route: the list only renders at /po itself (same as /rfq).
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isList = pathname === "/po";
  const navigate = useNavigate();
  const [poPage, setPoPage] = useState(1);

  const { data: poPageData, isLoading: loadingPos, error: posError } = useQuery({
    queryKey: ["purchase-orders", poPage],
    queryFn: () => apiGetPurchaseOrdersPage(poPage, PER_PAGE),
    enabled: isList,
  });
  const purchaseOrders = poPageData?.items ?? [];

  const pendingPos = purchaseOrders.filter((po) => po.status.startsWith("Pending"));

  if (!isList) return <Outlet />;

  return (
    <div className="mx-auto w-full max-w-7xl space-y-5 px-3 py-4 sm:space-y-6 sm:px-6 sm:py-8 lg:px-8">
      <PageHeader
        eyebrow="Procurement"
        title="Purchase Orders"
        subtitle="Draft Purchase Orders are created automatically when Supply confirms the AOC item awards."
      />

      {posError && (
        <div className="flex items-center gap-3 rounded-lg border border-warning/40 bg-warning/10 p-4">
          <AlertTriangle className="h-5 w-5 shrink-0 text-warning" />
          <div>
            <p className="text-sm font-semibold text-warning-foreground">Server Unavailable</p>
            <p className="mt-0.5 text-xs text-muted-foreground">Could not load Purchase Orders from the server.</p>
          </div>
        </div>
      )}

      {loadingPos ? (
        <div className="rounded-xl border border-border bg-card p-10 text-center">
          <p className="text-sm text-muted-foreground">Loading…</p>
        </div>
      ) : (
        <>
          {pendingPos.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-sm font-semibold text-navy">Purchase Orders Awaiting Action</h2>
              <div className="divide-y divide-border rounded-xl border border-border bg-card shadow-card">
                {pendingPos.map((po) => (
                  <div
                    key={po.id}
                    onClick={rowClick(() => navigate({ to: "/po/$poId", params: { poId: po.id } }), `/po/${po.id}`)}
                    className="flex cursor-pointer flex-wrap items-center gap-3 px-4 py-3 transition-colors hover:bg-secondary/40"
                  >
                    <div className="min-w-0 flex-1">
                      <Link to="/po/$poId" params={{ poId: po.id }} className="text-sm font-medium text-navy hover:underline">
                        {po.poNo}
                      </Link>
                      <p className="text-xs text-muted-foreground">
                        PR: {po.prNo} · {po.supplierName || "No supplier name"} · {po.stage}
                      </p>
                    </div>
                    <StatusBadge status={po.status} />
                    <Button asChild size="sm" variant="outline" className="h-7 gap-1 border-border px-2 text-xs">
                      <Link to="/po/$poId" params={{ poId: po.id }}>Review</Link>
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {purchaseOrders.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-sm font-semibold text-navy">Purchase Orders</h2>
              <div className="divide-y divide-border rounded-xl border border-border bg-card shadow-card">
                {purchaseOrders.map((po) => (
                  <div
                    key={po.id}
                    onClick={rowClick(() => navigate({ to: "/po/$poId", params: { poId: po.id } }), `/po/${po.id}`)}
                    className="flex cursor-pointer items-center gap-4 px-4 py-3 transition-colors hover:bg-secondary/40"
                  >
                    <FileCheck2 className="h-4 w-4 shrink-0 text-primary" />
                    <div className="min-w-0 flex-1">
                      <Link to="/po/$poId" params={{ poId: po.id }} className="text-sm font-medium text-navy hover:underline">
                        {po.poNo}
                      </Link>
                      <p className="text-xs text-muted-foreground">
                        PR: {po.prNo} · RFQ: {po.rfqNo} · {po.items.length} items · ₱{fmtAmount(po.totalAmount)}
                      </p>
                    </div>
                    <StatusBadge status={po.status} />
                  </div>
                ))}
              </div>
              {poPageData && <ListPagination page={poPage} lastPage={poPageData.lastPage} total={poPageData.total} onPageChange={setPoPage} />}
            </div>
          )}

          {purchaseOrders.length === 0 && !posError ? (
            <div className="rounded-xl border border-border bg-card p-10 text-center">
              <FileText className="mx-auto mb-2 h-8 w-8 text-muted-foreground/60" strokeWidth={1.5} />
              <p className="text-sm font-semibold text-navy">No Purchase Orders yet</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Purchase Orders will appear here automatically after Supply confirms an AOC's item awards.
              </p>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
