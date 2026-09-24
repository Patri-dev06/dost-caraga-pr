import { createFileRoute, Link, useNavigate, useParams } from "@tanstack/react-router";
import { ArrowLeft, Ban, Download, Eye, FileSpreadsheet, Loader2, Pencil, RotateCcw } from "lucide-react";
import { exportPurchaseRequestExcel, PR_FORM_DEFAULTS } from "@/lib/pr-excel";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/app/page-header";
import { StatusBadge } from "@/components/app/status-badge";
import { AuditTimeline } from "@/components/app/audit-timeline";
import { ValidationResultPanel } from "@/components/app/validation-result-panel";
import { fmtPHP, prTotal } from "@/lib/mock-data";
import { apiGetPurchaseRequest, apiRePurchaseRequest, apiValidatePurchaseRequest } from "@/lib/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

export const Route = createFileRoute("/purchase-requests/$prId")({
  head: () => ({
    meta: [
      { title: "Purchase Request Detail — DOST Caraga" },
      { name: "description", content: "Tracking and audit trail for a Purchase Request." },
    ],
  }),
  component: PRDetail,
});

function PRDetail() {
  const { prId } = useParams({ from: "/purchase-requests/$prId" });
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const rePr = useMutation({
    mutationFn: () => apiRePurchaseRequest(prId),
    onSuccess: async (result) => {
      toast.success(result.message);
      await queryClient.invalidateQueries({ queryKey: ["purchase-requests"] });
      navigate({ to: "/purchase-requests/new", search: { edit: result.data.id } });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Unable to re-file this Purchase Request."),
  });
  const { data: pr, isLoading, error } = useQuery({
    queryKey: ["purchase-request", prId],
    queryFn: () => apiGetPurchaseRequest(prId),
  });
  const { data: validationResults } = useQuery({
    queryKey: ["purchase-request-validation", prId],
    queryFn: () => apiValidatePurchaseRequest(prId),
    enabled: !!pr && pr.status !== "Approved" && pr.status !== "Cancelled",
  });

  if (isLoading) {
    return <div className="mx-auto w-full max-w-6xl px-4 py-8 text-sm text-muted-foreground">Fetching data, kindly wait.</div>;
  }

  if (error || !pr) {
    return <div className="mx-auto w-full max-w-6xl px-4 py-8 text-sm text-muted-foreground">{error instanceof Error ? error.message : "Purchase request not found."}</div>;
  }

  function exportExcel() {
    if (!pr) return;
    const submitted = pr.dateSubmitted && pr.dateSubmitted !== "Not submitted";
    exportPurchaseRequestExcel(
      {
        ...PR_FORM_DEFAULTS,
        requestedByName: pr.requestedBy !== "Unassigned" ? pr.requestedBy : PR_FORM_DEFAULTS.requestedByName,
        requestedByDesignation: pr.requestedByPosition || (pr.requestedBy !== "Unassigned" ? "" : PR_FORM_DEFAULTS.requestedByDesignation),
        officeName: pr.office,
        prNo: pr.prNo,
        date: submitted ? pr.dateSubmitted : new Date().toISOString().slice(0, 10),
        fundSource: pr.fundSource,
        purpose: pr.purpose,
        items: pr.items.map((it) => ({
          stockNo: "",
          unit: it.uom,
          description: it.description ? `${it.name}\n${it.description}` : it.name,
          qty: it.qty,
          unitCost: it.unitCost,
        })),
      },
      pr.prNo,
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
      <Button asChild variant="ghost" size="sm" className="gap-1 -ml-2 text-muted-foreground hover:text-navy">
        <Link to="/purchase-requests"><ArrowLeft className="h-4 w-4" /> Back to Purchase Requests</Link>
      </Button>

      <PageHeader
        eyebrow={`Purchase Request · ${pr.fundType}`}
        title={pr.prNo}
        subtitle={`${pr.projectTitle} · ${pr.office}`}
        actions={
          <>
            <StatusBadge status={pr.status} />
            {(pr.status === "Draft" || pr.status === "Returned") && (
              <Button asChild className="gap-2">
                <Link to="/purchase-requests/new" search={{ edit: pr.id }}>
                  <Pencil className="h-4 w-4" /> Edit
                </Link>
              </Button>
            )}
            {pr.status === "Approved" && (
              <Button asChild variant="outline" className="gap-2 border-border">
                <Link to="/purchase-requests/new" search={{ view: pr.id }}>
                  <Eye className="h-4 w-4" /> Preview
                </Link>
              </Button>
            )}
            <Button variant="outline" className="gap-2 border-border" onClick={exportExcel}><FileSpreadsheet className="h-4 w-4" /> Export Excel</Button>
            <Button variant="outline" className="gap-2 border-border"><Download className="h-4 w-4" /> Export PDF</Button>
          </>
        }
      />

      {pr.status === "Cancelled" && (
        // Flowchart: "Cancel PR -> Notify End-user to Re-PR".
        <Card className="flex flex-wrap items-start gap-3 border border-destructive/30 bg-destructive/5 p-4">
          <Ban className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
          <div className="min-w-0 flex-1 text-sm">
            <p className="font-semibold text-destructive">
              This Purchase Request was cancelled{pr.cancelledFrom === "PO" ? " — the winning supplier waived delivery" : pr.cancelledFrom === "AOC" ? " — the BAC was not satisfied after the TWG addressed its remarks" : ""}.
            </p>
            {pr.cancelReason && <p className="mt-1 text-foreground">Reason: {pr.cancelReason}</p>}
            {pr.rePr ? (
              <p className="mt-1 text-muted-foreground">
                Re-filed as{" "}
                <Link to="/purchase-requests/$prId" params={{ prId: pr.rePr.id }} className="font-semibold text-primary underline-offset-2 hover:underline">
                  {pr.rePr.prNo}
                </Link>
                .
              </p>
            ) : (
              <p className="mt-1 text-muted-foreground">If the need still stands, Re-PR copies it into a new draft for you to review and submit.</p>
            )}
          </div>
          {!pr.rePr && (
            <Button className="gap-2" disabled={rePr.isPending} onClick={() => rePr.mutate()}>
              {rePr.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />} Re-PR
            </Button>
          )}
        </Card>
      )}
      {pr.rePrOf && (
        <p className="text-sm text-muted-foreground">
          Re-filed from cancelled{" "}
          <Link to="/purchase-requests/$prId" params={{ prId: pr.rePrOf.id }} className="font-semibold text-primary underline-offset-2 hover:underline">
            {pr.rePrOf.prNo}
          </Link>
          .
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ["Date Submitted", pr.dateSubmitted],
          ["Requested By", pr.requestedBy],
          ["Mode", pr.modeOfProcurement],
          ["Total Amount", fmtPHP(prTotal(pr))],
        ].map(([k, v]) => (
          <Card key={k} className="border border-border bg-card p-4">
            <p className="label-eyebrow">{k}</p>
            <p className="mt-1.5 text-sm font-semibold text-navy">{v}</p>
          </Card>
        ))}
      </div>

      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="bg-secondary/60">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="items">Items</TabsTrigger>
          <TabsTrigger value="validation">Validation</TabsTrigger>
          <TabsTrigger value="trail">Approval Trail</TabsTrigger>
          <TabsTrigger value="attachments">Attachments</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4">
          <Card className="border border-border bg-card p-6">
            <p className="label-eyebrow">Purpose</p>
            <p className="mt-2 text-sm text-foreground">{pr.purpose}</p>
            <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
              <div><p className="label-eyebrow">Fund Source</p><p className="mt-1 font-semibold text-navy">{pr.fundSource}</p></div>
              <div><p className="label-eyebrow">Current Stage</p><p className="mt-1 font-semibold text-navy">{pr.stage}</p></div>
              {pr.regularFund !== undefined && (
                <div>
                  <p className="label-eyebrow">Fund Path</p>
                  <p className="mt-1 font-semibold text-navy">{pr.regularFund ? "Regular fund — APP-CSE, then APP-Non-CSE" : "Non-regular fund — Project, PPMP, LIB, APP-Non-CSE"}</p>
                </div>
              )}
              {pr.regularFund === false && (
                <div><p className="label-eyebrow">Project</p><p className="mt-1 font-semibold text-navy">{pr.identifiedProject || "Not identified"}</p></div>
              )}
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="items" className="mt-4">
          <Card className="overflow-hidden border border-border bg-card">
            <Table>
              <TableHeader><TableRow className="bg-secondary/40 hover:bg-secondary/40">
                <TableHead className="label-eyebrow">Item</TableHead>
                <TableHead className="label-eyebrow">Description</TableHead>
                <TableHead className="label-eyebrow">UoM</TableHead>
                <TableHead className="label-eyebrow text-right">Qty</TableHead>
                <TableHead className="label-eyebrow text-right">Unit Cost</TableHead>
                <TableHead className="label-eyebrow text-right">Total</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {pr.items.map((i) => (
                  <TableRow key={i.id}>
                    <TableCell className="font-semibold text-navy">{i.name}</TableCell>
                    <TableCell className="text-muted-foreground">{i.description}</TableCell>
                    <TableCell>{i.uom}</TableCell>
                    <TableCell className="text-right tabular-nums">{i.qty}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtPHP(i.unitCost)}</TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">{fmtPHP(i.qty * i.unitCost)}</TableCell>
                  </TableRow>
                ))}
                <TableRow className="bg-secondary/30">
                  <TableCell colSpan={5} className="text-right font-bold uppercase tracking-wider text-xs">Grand Total</TableCell>
                  <TableCell className="text-right text-base font-bold tabular-nums text-navy">{fmtPHP(prTotal(pr))}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="validation" className="mt-4">
          <ValidationResultPanel items={pr.items} results={validationResults} />
        </TabsContent>

        <TabsContent value="trail" className="mt-4">
          <Card className="border border-border bg-card p-6">
            <AuditTimeline />
          </Card>
        </TabsContent>

        <TabsContent value="attachments" className="mt-4">
          <Card className="border border-dashed border-border bg-secondary/20 p-10 text-center">
            <p className="text-sm font-semibold text-navy">No attachments uploaded</p>
            <p className="mt-1 text-xs text-muted-foreground">Supporting documents (quotations, specifications) will appear here.</p>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
