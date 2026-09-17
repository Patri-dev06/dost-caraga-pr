import { createFileRoute, Link } from "@tanstack/react-router";
import { AlertTriangle, CheckCircle2, FileCheck2, FileText, PackagePlus, ThumbsUp, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/app/page-header";
import { StatusBadge } from "@/components/app/status-badge";
import { apiGenerateFromRfq, apiGetPurchaseOrders, apiGetRfqs, apiPoApprovalAction, type Rfq } from "@/lib/api";
import { fmtAmount } from "@/lib/lib-store";
import { toast } from "sonner";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export const Route = createFileRoute("/po")({
  head: () => ({
    meta: [
      { title: "Purchase Orders — DOST Caraga" },
      { name: "description", content: "Generate Purchase Orders from approved RFQs and track their approval." },
    ],
  }),
  component: PurchaseOrderListPage,
});

function PurchaseOrderListPage() {
  const queryClient = useQueryClient();

  const { data: approvedRfqs = [], isLoading: loadingRfqs, error: rfqsError } = useQuery({
    queryKey: ["rfqs", "approved"],
    queryFn: () => apiGetRfqs({ status: "Approved" }),
  });

  const { data: purchaseOrders = [], isLoading: loadingPos } = useQuery({
    queryKey: ["purchase-orders"],
    queryFn: () => apiGetPurchaseOrders(),
  });

  const usedRfqIds = new Set(purchaseOrders.map((po) => po.rfqId));
  const eligibleRfqs = approvedRfqs.filter((rfq) => !usedRfqIds.has(rfq.id));
  const pendingPos = purchaseOrders.filter((po) => po.status === "For Recommendation" || po.status === "For Approval");

  const generateMutation = useMutation({
    mutationFn: (rfqId: string) => apiGenerateFromRfq(rfqId),
    onSuccess: async () => {
      toast.success("Purchase Order generated.");
      await queryClient.invalidateQueries({ queryKey: ["purchase-orders"] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Unable to generate Purchase Order."),
  });

  const actionMutation = useMutation({
    mutationFn: ({ id, action, reason }: { id: string; action: "recommend" | "approve" | "reject"; reason?: string }) =>
      apiPoApprovalAction(id, action, reason),
    onSuccess: async (result) => {
      toast.success(result.message);
      await queryClient.invalidateQueries({ queryKey: ["purchase-orders"] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Unable to complete approval action."),
  });

  const loading = loadingRfqs || loadingPos;

  return (
    <div className="mx-auto w-full max-w-7xl space-y-5 px-3 py-4 sm:space-y-6 sm:px-6 sm:py-8 lg:px-8">
      <PageHeader
        eyebrow="Procurement"
        title="Purchase Orders"
        subtitle="Generate a Purchase Order from an approved RFQ's winning supplier."
      />

      {rfqsError && (
        <div className="flex items-center gap-3 rounded-lg border border-warning/40 bg-warning/10 p-4">
          <AlertTriangle className="h-5 w-5 shrink-0 text-warning" />
          <div>
            <p className="text-sm font-semibold text-warning-foreground">Server Unavailable</p>
            <p className="mt-0.5 text-xs text-muted-foreground">Could not load RFQs from server.</p>
          </div>
        </div>
      )}

      {loading ? (
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
                  <div key={po.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <Link to="/po/$poId" params={{ poId: po.id }} className="text-sm font-medium text-navy hover:underline">
                        {po.poNo}
                      </Link>
                      <p className="text-xs text-muted-foreground">
                        PR: {po.prNo} · {po.supplierName || "No supplier name"} · {po.stage}
                      </p>
                    </div>
                    <StatusBadge status={po.status} />
                    <div className="flex gap-1.5">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 gap-1 border-border px-2 text-xs"
                        disabled={actionMutation.isPending}
                        onClick={() =>
                          actionMutation.mutate({ id: po.id, action: po.status === "For Recommendation" ? "recommend" : "approve" })
                        }
                      >
                        {po.status === "For Recommendation" ? <ThumbsUp className="h-3 w-3" /> : <CheckCircle2 className="h-3 w-3" />}
                        {po.status === "For Recommendation" ? "Recommend" : "Approve"}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 gap-1 border-destructive/40 px-2 text-xs text-destructive hover:bg-destructive/10"
                        disabled={actionMutation.isPending}
                        onClick={() => {
                          const reason = window.prompt("Reason for rejecting this Purchase Order:");
                          if (!reason) return;
                          actionMutation.mutate({ id: po.id, action: "reject", reason });
                        }}
                      >
                        <XCircle className="h-3 w-3" /> Reject
                      </Button>
                    </div>
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
                  <div key={po.id} className="flex items-center gap-4 px-4 py-3 transition-colors hover:bg-secondary/40">
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
            </div>
          )}

          {eligibleRfqs.length > 0 ? (
            <div className="space-y-3">
              <h2 className="text-sm font-semibold text-navy">Generate PO from Approved RFQ</h2>
              <p className="text-xs text-muted-foreground">
                Select the winning supplier's RFQ to generate its Purchase Order.
              </p>
              <div className="divide-y divide-border rounded-xl border border-border bg-card shadow-card">
                {eligibleRfqs.map((rfq) => (
                  <EligibleRfqCard
                    key={rfq.id}
                    rfq={rfq}
                    generating={generateMutation.isPending}
                    onGenerate={() => generateMutation.mutate(rfq.id)}
                  />
                ))}
              </div>
            </div>
          ) : !rfqsError ? (
            <div className="rounded-xl border border-border bg-card p-10 text-center">
              <FileText className="mx-auto mb-2 h-8 w-8 text-muted-foreground/60" strokeWidth={1.5} />
              <p className="text-sm font-semibold text-navy">No Approved RFQs Awaiting a PO</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Approve an RFQ's winning supplier first, then generate its Purchase Order here.
              </p>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

function EligibleRfqCard({ rfq, generating, onGenerate }: { rfq: Rfq; generating: boolean; onGenerate: () => void }) {
  return (
    <div className="flex flex-wrap items-center gap-4 px-4 py-3 transition-colors hover:bg-secondary/40">
      <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-navy">{rfq.rfqNo}</p>
        <p className="text-xs text-muted-foreground">
          PR: {rfq.prNo} · {rfq.supplierName || "No supplier name"} · {rfq.items.length} item{rfq.items.length !== 1 ? "s" : ""}
        </p>
      </div>
      <Button size="sm" className="gap-1.5" onClick={onGenerate} disabled={generating}>
        <PackagePlus className="h-4 w-4" /> Generate PO
      </Button>
    </div>
  );
}
