import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, CheckCircle2, FileSpreadsheet, Loader2, PackageCheck, PackageX, Save, SendHorizontal, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/app/page-header";
import { StatusBadge } from "@/components/app/status-badge";
import {
  apiGetPurchaseOrder,
  apiSubmitPurchaseOrder,
  apiUpdatePurchaseOrder,
  apiObligatePo,
  apiAccountPo,
  apiFinalApprovePo,
  apiRejectPo,
  apiDeliverPo,
  type PurchaseOrder,
  type PurchaseOrderItem,
} from "@/lib/api";
import { fmtAmount } from "@/lib/lib-store";
import { exportPurchaseOrderExcel } from "@/lib/po-excel";
import { toast } from "sonner";

const PO_CHAIN_STEPS = [
  { pendingStatus: "Pending Budget Obligation", label: "Budget Officer", nameKey: "budgetOfficerName" as const, atKey: "budgetOfficerSignedAt" as const },
  { pendingStatus: "Pending Accounting", label: "Accounting Officer", nameKey: "accountingOfficerName" as const, atKey: "accountingOfficerSignedAt" as const },
  { pendingStatus: "Pending RD Approval", label: "Regional Director", nameKey: "approvedByName" as const, atKey: "approvedBySignedAt" as const },
];

export const Route = createFileRoute("/po/$poId")({
  head: () => ({ meta: [{ title: "Purchase Order — DOST Caraga" }] }),
  component: PurchaseOrderDetailPage,
});

interface EditableItem extends PurchaseOrderItem {
  quantityInput: string;
  unitCostInput: string;
}

function PurchaseOrderDetailPage() {
  const { poId } = Route.useParams();
  const navigate = useNavigate();

  const [po, setPo] = useState<PurchaseOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [poDate, setPoDate] = useState("");
  const [deliveryDate, setDeliveryDate] = useState("");
  const [placeOfDelivery, setPlaceOfDelivery] = useState("");
  const [terms, setTerms] = useState("");
  const [items, setItems] = useState<EditableItem[]>([]);
  const [chainBusy, setChainBusy] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const data = await apiGetPurchaseOrder(poId);
        setPo(data);
        setPoDate(data.poDate);
        setDeliveryDate(data.deliveryDate);
        setPlaceOfDelivery(data.placeOfDelivery);
        setTerms(data.termsAndConditions);
        setItems(data.items.map((it) => ({ ...it, quantityInput: String(it.quantity), unitCostInput: String(it.unitCost) })));
      } catch {
        toast.error("Could not load Purchase Order.");
        navigate({ to: "/po" });
      } finally {
        setLoading(false);
      }
    })();
  }, [poId, navigate]);

  const editable = po?.status === "Draft";
  const total = items.reduce((sum, it) => sum + (Number(it.quantityInput) || 0) * (Number(it.unitCostInput) || 0), 0);

  async function runChainAction(action: () => Promise<{ data: PurchaseOrder; message: string }>) {
    setChainBusy(true);
    try {
      const result = await action();
      setPo(result.data);
      toast.success(result.message);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Action failed.");
    } finally {
      setChainBusy(false);
    }
  }

  function handleReject() {
    const reason = window.prompt("Reason for rejecting this Purchase Order:");
    if (!reason) return;
    runChainAction(() => apiRejectPo(poId, reason));
  }

  function handleDeliver(waived: boolean) {
    const reason = waived ? window.prompt("Reason the supplier waived delivery:") : undefined;
    if (waived && !reason) return;
    runChainAction(() => apiDeliverPo(poId, waived, reason ?? undefined));
  }

  async function handleSave() {
    if (!po) return;
    setSaving(true);
    try {
      const updated = await apiUpdatePurchaseOrder(po.id, {
        po_date: poDate,
        delivery_date: deliveryDate,
        place_of_delivery: placeOfDelivery,
        terms_and_conditions: terms,
        items: items.map((it) => ({
          item_no: it.itemNo,
          description: it.description,
          uom: it.uom,
          quantity: Number(it.quantityInput) || 0,
          unit_cost: Number(it.unitCostInput) || 0,
        })),
      });
      setPo(updated);
      setItems(updated.items.map((it) => ({ ...it, quantityInput: String(it.quantity), unitCostInput: String(it.unitCost) })));
      toast.success("Purchase Order updated.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to update Purchase Order.");
    } finally {
      setSaving(false);
    }
  }

  async function handleSubmit() {
    if (!po) return;
    setSubmitting(true);
    try {
      const updated = await apiSubmitPurchaseOrder(po.id);
      setPo(updated);
      toast.success("Purchase Order submitted for recommendation.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to submit Purchase Order.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <span className="ml-2 text-sm text-muted-foreground">Loading…</span>
      </div>
    );
  }

  if (!po) return null;

  return (
    <div className="mx-auto w-full max-w-5xl space-y-5 px-3 py-4 sm:space-y-6 sm:px-6 sm:py-8 lg:px-8">
      <Button variant="ghost" size="sm" asChild className="gap-1.5 text-muted-foreground">
        <Link to="/po">
          <ArrowLeft className="h-4 w-4" /> Back
        </Link>
      </Button>

      <PageHeader
        eyebrow={`PR ${po.prNo} · RFQ ${po.rfqNo}`}
        title={po.poNo}
        subtitle={`Purchase Order${po.preparedByName ? ` · Prepared by ${po.preparedByName}${po.preparedByPosition ? `, ${po.preparedByPosition}` : ""}` : ""}`}
        actions={<StatusBadge status={po.status} />}
      />

      <Card className="grid grid-cols-2 gap-4 border border-border bg-card p-4 sm:grid-cols-4">
        <div>
          <p className="label-eyebrow">Supplier</p>
          <p className="mt-0.5 text-sm font-semibold text-navy">{po.supplierName || "—"}</p>
        </div>
        <div>
          <p className="label-eyebrow">Mode of Procurement</p>
          <p className="mt-0.5 text-sm font-semibold text-navy">{po.modeOfProcurement || "—"}</p>
        </div>
        <div>
          <p className="label-eyebrow">Total Amount</p>
          <p className="mt-0.5 text-sm font-semibold tabular-nums text-navy">₱{fmtAmount(total)}</p>
        </div>
        <div>
          <p className="label-eyebrow">Stage</p>
          <p className="mt-0.5 text-sm font-semibold text-navy">{po.stage}</p>
        </div>
      </Card>

      <Card className="space-y-4 border border-border bg-card p-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <p className="label-eyebrow">PO Date</p>
            <Input value={poDate} onChange={(e) => setPoDate(e.target.value)} disabled={!editable} className="border-border" />
          </div>
          <div className="space-y-1.5">
            <p className="label-eyebrow">Delivery Date</p>
            <Input value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} disabled={!editable} className="border-border" />
          </div>
          <div className="space-y-1.5">
            <p className="label-eyebrow">Place of Delivery</p>
            <Input value={placeOfDelivery} onChange={(e) => setPlaceOfDelivery(e.target.value)} disabled={!editable} className="border-border" />
          </div>
        </div>
        <div className="space-y-1.5">
          <p className="label-eyebrow">Terms &amp; Conditions</p>
          <Textarea rows={3} value={terms} onChange={(e) => setTerms(e.target.value)} disabled={!editable} className="border-border" />
        </div>
      </Card>

      <Card className="overflow-hidden border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow className="bg-secondary/40 hover:bg-secondary/40">
              <TableHead className="label-eyebrow w-12">No.</TableHead>
              <TableHead className="label-eyebrow">Description</TableHead>
              <TableHead className="label-eyebrow">UOM</TableHead>
              <TableHead className="label-eyebrow text-right">Qty</TableHead>
              <TableHead className="label-eyebrow text-right">Unit Cost</TableHead>
              <TableHead className="label-eyebrow text-right">Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item, index) => (
              <TableRow key={item.id}>
                <TableCell className="text-center font-semibold text-navy">{item.itemNo}</TableCell>
                <TableCell>{item.description}</TableCell>
                <TableCell>{item.uom}</TableCell>
                <TableCell className="text-right">
                  {editable ? (
                    <Input
                      value={item.quantityInput}
                      onChange={(e) => setItems((cur) => cur.map((it, i) => (i === index ? { ...it, quantityInput: e.target.value } : it)))}
                      className="h-8 w-20 border-border text-right tabular-nums"
                    />
                  ) : (
                    <span className="tabular-nums">{item.quantity}</span>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  {editable ? (
                    <Input
                      value={item.unitCostInput}
                      onChange={(e) => setItems((cur) => cur.map((it, i) => (i === index ? { ...it, unitCostInput: e.target.value } : it)))}
                      className="h-8 w-24 border-border text-right tabular-nums"
                    />
                  ) : (
                    <span className="tabular-nums">₱{fmtAmount(item.unitCost)}</span>
                  )}
                </TableCell>
                <TableCell className="text-right font-medium tabular-nums">
                  ₱{fmtAmount((Number(item.quantityInput) || 0) * (Number(item.unitCostInput) || 0))}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      {/* Budget -> Accounting -> RD approval chain */}
      {po.status !== "Draft" && (
        <Card className="border border-border bg-card p-4">
          <h2 className="mb-3 text-sm font-semibold text-navy">Approval Chain</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {PO_CHAIN_STEPS.map((step) => {
              const signedName = po[step.nameKey];
              const signedAt = po[step.atKey];
              const isCurrent = po.status === step.pendingStatus;
              const isDone = !!signedName;

              return (
                <div key={step.pendingStatus} className={`rounded-lg border p-3 text-xs ${isDone ? "border-success/30 bg-success/5" : isCurrent ? "border-primary/40 bg-primary/5" : "border-border"}`}>
                  <p className="flex items-center gap-1.5 font-semibold text-navy">
                    {isDone && <CheckCircle2 className="h-3.5 w-3.5 text-success" />}
                    {step.label}
                  </p>
                  {isDone ? (
                    <p className="mt-1 text-muted-foreground">Signed by {signedName}<br />{signedAt && new Date(signedAt).toLocaleString("en-PH")}</p>
                  ) : isCurrent ? (
                    <div className="mt-2 flex gap-1.5">
                      <Button
                        size="sm"
                        className="h-7 gap-1 text-xs"
                        disabled={chainBusy}
                        onClick={() =>
                          runChainAction(() =>
                            step.pendingStatus === "Pending Budget Obligation"
                              ? apiObligatePo(poId)
                              : step.pendingStatus === "Pending Accounting"
                                ? apiAccountPo(poId)
                                : apiFinalApprovePo(poId),
                          )
                        }
                      >
                        Sign now
                      </Button>
                      <Button size="sm" variant="outline" className="h-7 gap-1 border-destructive/40 text-xs text-destructive hover:bg-destructive/10" disabled={chainBusy} onClick={handleReject}>
                        <XCircle className="h-3 w-3" /> Reject
                      </Button>
                    </div>
                  ) : (
                    <p className="mt-1 text-muted-foreground">Awaiting prior signature</p>
                  )}
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* Delivery outcome */}
      {po.status === "Approved" && (
        <Card className="flex flex-wrap items-center justify-between gap-3 border border-border bg-card p-4">
          <div>
            <h2 className="text-sm font-semibold text-navy">Delivery</h2>
            <p className="text-xs text-muted-foreground">Record whether the winning supplier delivered or waived.</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" className="gap-1.5 border-warning/40 text-warning-foreground hover:bg-warning/10" disabled={chainBusy} onClick={() => handleDeliver(true)}>
              <PackageX className="h-4 w-4" /> Supplier Waived Delivery
            </Button>
            <Button className="gap-1.5" disabled={chainBusy} onClick={() => handleDeliver(false)}>
              <PackageCheck className="h-4 w-4" /> Delivery Accepted
            </Button>
          </div>
        </Card>
      )}
      {po.status === "Delivery Waived" && (
        <Card className="border border-warning/30 bg-warning/5 p-4">
          <p className="text-sm font-semibold text-warning-foreground">Supplier waived delivery</p>
          <p className="mt-1 text-sm text-foreground">{po.deliveryWaivedReason}</p>
          <Button asChild size="sm" className="mt-3 gap-1.5">
            <Link to="/rfq">Start a New RFQ Canvass</Link>
          </Button>
        </Card>
      )}

      <div className="flex flex-wrap justify-end gap-2">
        <Button
          variant="outline"
          className="gap-1.5 border-border"
          onClick={() =>
            exportPurchaseOrderExcel(
              { ...po, items: items.map((it) => ({ ...it, quantity: Number(it.quantityInput) || 0, unitCost: Number(it.unitCostInput) || 0, totalCost: (Number(it.quantityInput) || 0) * (Number(it.unitCostInput) || 0) })) },
              po.poNo,
            )
          }
        >
          <FileSpreadsheet className="h-4 w-4" /> Export Excel
        </Button>
        {editable && (
          <Button variant="outline" className="gap-1.5 border-border" onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save Changes
          </Button>
        )}
        {po.status === "Draft" && (
          <Button className="gap-1.5" onClick={handleSubmit} disabled={submitting}>
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <SendHorizontal className="h-4 w-4" />}
            Submit
          </Button>
        )}
      </div>
    </div>
  );
}
