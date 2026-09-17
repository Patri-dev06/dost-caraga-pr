import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, ClipboardCheck, FileSpreadsheet, Loader2, Plus, RefreshCw, Save, Send, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/app/page-header";
import { StatusBadge } from "@/components/app/status-badge";
import {
  apiGetRfq,
  apiUpdateRfq,
  apiSignRfq,
  apiAddRfqSupplier,
  apiSendRfq,
  apiRecordRfqSupplierQuote,
  apiReplaceRfqSupplier,
  apiGenerateAoc,
  type Rfq,
  type RfqCreatePayload,
} from "@/lib/api";
import { fmtAmount, parseAmount } from "@/lib/lib-store";
import { toast } from "sonner";

export const Route = createFileRoute("/rfq/$rfqId")({
  head: () => ({ meta: [{ title: "RFQ — DOST Caraga" }] }),
  component: RfqDetailPage,
});

const SIGN_STEPS = [
  { key: "bac-chair" as const, label: "BAC Chair", pendingStatus: "Draft" },
  { key: "bac-vice-chair" as const, label: "BAC Vice-Chair", pendingStatus: "Pending BAC Vice-Chair Signature" },
  { key: "supply-officer" as const, label: "Supply Officer", pendingStatus: "Pending Supply Officer Countersign" },
];

interface EditDoc {
  procurementCategory: string;
  quotationNo: string;
  rfqDate: string;
  openingDate: string;
  placeOfDelivery: string;
  estimatedBudget: string;
  bacChairman: string;
  bacChairmanTitle: string;
  purpose: string;
  fundSource: string;
  canvasser: string;
  bacAction: string;
}

interface EditItem {
  id: string;
  itemNo: number;
  description: string;
  unit: string;
  qty: string;
  unitAbc: string;
  totalAbc: string;
}

function docFromRfq(rfq: Rfq): EditDoc {
  return {
    procurementCategory: rfq.procurementCategory,
    quotationNo: rfq.quotationNo,
    rfqDate: rfq.rfqDate,
    openingDate: rfq.openingDate,
    placeOfDelivery: rfq.placeOfDelivery,
    estimatedBudget: String(rfq.estimatedBudget),
    bacChairman: rfq.bacChairman,
    bacChairmanTitle: rfq.bacChairmanTitle,
    purpose: rfq.purpose,
    fundSource: rfq.fundSource,
    canvasser: rfq.canvasser,
    bacAction: rfq.bacAction,
  };
}

function itemsFromRfq(rfq: Rfq): EditItem[] {
  return rfq.items.map((it) => ({
    id: it.id,
    itemNo: it.itemNo,
    description: it.description,
    unit: it.unit,
    qty: String(it.qty),
    unitAbc: String(it.unitAbc),
    totalAbc: String(it.totalAbc),
  }));
}

function RfqDetailPage() {
  const { rfqId } = Route.useParams();
  const navigate = useNavigate();

  const [rfq, setRfq] = useState<Rfq | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [newSupplierName, setNewSupplierName] = useState("");
  const [twgNotes, setTwgNotes] = useState("");
  const [quoteDrafts, setQuoteDrafts] = useState<Record<string, Record<string, string>>>({});
  const [editDoc, setEditDoc] = useState<EditDoc | null>(null);
  const [editItems, setEditItems] = useState<EditItem[]>([]);
  const [savingDetails, setSavingDetails] = useState(false);

  async function reload() {
    try {
      const data = await apiGetRfq(rfqId);
      setRfq(data);
      if (data.status === "Draft") {
        setEditDoc(docFromRfq(data));
        setEditItems(itemsFromRfq(data));
      }
    } catch {
      toast.error("Could not load RFQ.");
      navigate({ to: "/rfq" });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rfqId]);

  async function run(action: () => Promise<unknown>, successMessage: string) {
    setBusy(true);
    try {
      await action();
      toast.success(successMessage);
      await reload();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Action failed.");
    } finally {
      setBusy(false);
    }
  }

  const setDocField = <K extends keyof EditDoc>(key: K, value: EditDoc[K]) =>
    setEditDoc((d) => (d ? { ...d, [key]: value } : d));
  const setEditItemField = (id: string, patch: Partial<EditItem>) =>
    setEditItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  const removeEditItem = (id: string) =>
    setEditItems((prev) => prev.filter((it) => it.id !== id).map((it, i) => ({ ...it, itemNo: i + 1 })));
  const addEditItem = () =>
    setEditItems((prev) => [...prev, { id: crypto.randomUUID(), itemNo: prev.length + 1, description: "", unit: "", qty: "", unitAbc: "", totalAbc: "" }]);

  async function handleSaveDetails() {
    if (!editDoc) return;
    if (editItems.length === 0) {
      toast.error("Add at least one item.");
      return;
    }

    const payload: Partial<RfqCreatePayload> = {
      procurement_category: editDoc.procurementCategory,
      quotation_no: editDoc.quotationNo,
      rfq_date: editDoc.rfqDate,
      opening_date: editDoc.openingDate,
      place_of_delivery: editDoc.placeOfDelivery,
      estimated_budget: parseAmount(editDoc.estimatedBudget),
      bac_chairman: editDoc.bacChairman,
      bac_chairman_title: editDoc.bacChairmanTitle,
      purpose: editDoc.purpose,
      fund_source_snapshot: editDoc.fundSource,
      canvasser: editDoc.canvasser,
      bac_action: editDoc.bacAction,
      items: editItems.map((it) => ({
        item_no: it.itemNo,
        description: it.description,
        uom: it.unit,
        quantity: Number(it.qty) || 0,
        unit_abc: parseAmount(it.unitAbc),
        total_abc: parseAmount(it.totalAbc),
      })),
    };

    setSavingDetails(true);
    try {
      await apiUpdateRfq(rfqId, payload);
      toast.success("RFQ details updated.");
      await reload();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to update RFQ.");
    } finally {
      setSavingDetails(false);
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
  if (!rfq) return null;

  const activeSuppliers = rfq.suppliers.filter((s) => s.status !== "Replaced");
  const pendingSuppliers = rfq.suppliers.filter((s) => s.status === "Pending");
  const allResolved = activeSuppliers.length > 0 && activeSuppliers.every((s) => s.status === "Replied" || s.status === "TimedOut");
  const anyReplied = activeSuppliers.some((s) => s.status === "Replied");

  return (
    <div className="mx-auto w-full max-w-5xl space-y-5 px-3 py-4 sm:space-y-6 sm:px-6 sm:py-8 lg:px-8">
      <PageHeader
        eyebrow={`PR ${rfq.prNo} · ${rfq.procurementCategory}`}
        title={rfq.rfqNo}
        subtitle="Request for Quotation"
        actions={<StatusBadge status={rfq.status} />}
      />

      <Card className="grid grid-cols-2 gap-4 border border-border bg-card p-4 sm:grid-cols-4">
        <div>
          <p className="label-eyebrow">Estimated Budget</p>
          <p className="mt-0.5 text-sm font-semibold tabular-nums text-navy">₱{fmtAmount(rfq.estimatedBudget)}</p>
        </div>
        <div>
          <p className="label-eyebrow">Items</p>
          <p className="mt-0.5 text-sm font-semibold text-navy">{rfq.items.length}</p>
        </div>
        <div>
          <p className="label-eyebrow">Stage</p>
          <p className="mt-0.5 text-sm font-semibold text-navy">{rfq.stage}</p>
        </div>
        <div>
          <p className="label-eyebrow">Export</p>
          <Button asChild variant="link" size="sm" className="h-auto p-0 text-xs">
            <Link to="/rfq/new" search={{ pr: rfq.prId }}>
              <FileSpreadsheet className="mr-1 h-3.5 w-3.5" /> Blank canvass letter
            </Link>
          </Button>
        </div>
      </Card>

      {/* Pre-send signing chain */}
      <Card className="border border-border bg-card p-4">
        <h2 className="mb-3 text-sm font-semibold text-navy">Pre-Send Signing Chain</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {SIGN_STEPS.map((step) => {
            const signedName =
              step.key === "bac-chair" ? rfq.bacChairSignedName : step.key === "bac-vice-chair" ? rfq.bacViceChairSignedName : rfq.supplyOfficerSignedName;
            const signedAt =
              step.key === "bac-chair" ? rfq.bacChairSignedAt : step.key === "bac-vice-chair" ? rfq.bacViceChairSignedAt : rfq.supplyOfficerSignedAt;
            const isCurrent = rfq.status === step.pendingStatus;
            const isDone = !!signedName;

            return (
              <div key={step.key} className={`rounded-lg border p-3 text-xs ${isDone ? "border-success/30 bg-success/5" : isCurrent ? "border-primary/40 bg-primary/5" : "border-border"}`}>
                <p className="flex items-center gap-1.5 font-semibold text-navy">
                  {isDone && <CheckCircle2 className="h-3.5 w-3.5 text-success" />}
                  {step.label}
                </p>
                {isDone ? (
                  <p className="mt-1 text-muted-foreground">Signed by {signedName}<br />{signedAt && new Date(signedAt).toLocaleString("en-PH")}</p>
                ) : isCurrent ? (
                  <Button size="sm" className="mt-2 h-7 gap-1 text-xs" disabled={busy} onClick={() => run(() => apiSignRfq(rfq.id, step.key), `Signed as ${step.label}.`)}>
                    Sign now
                  </Button>
                ) : (
                  <p className="mt-1 text-muted-foreground">Awaiting prior signature</p>
                )}
              </div>
            );
          })}
        </div>
      </Card>

      {/* Draft details — editable until the signing chain starts */}
      {rfq.status === "Draft" && editDoc ? (
        <>
          <Card className="space-y-4 border border-border bg-card p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-navy">RFQ Details</h2>
              <Button size="sm" className="gap-1.5" disabled={savingDetails} onClick={handleSaveDetails}>
                {savingDetails ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Save Changes
              </Button>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <p className="label-eyebrow">Category</p>
                <Select value={editDoc.procurementCategory} onValueChange={(v) => setDocField("procurementCategory", v)}>
                  <SelectTrigger className="border-border"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Goods">Goods</SelectItem>
                    <SelectItem value="Equipment">Equipment</SelectItem>
                    <SelectItem value="Venue" disabled>Venue (not yet supported)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <p className="label-eyebrow">Quotation No.</p>
                <Input value={editDoc.quotationNo} onChange={(e) => setDocField("quotationNo", e.target.value)} className="border-border" />
              </div>
              <div className="space-y-1.5">
                <p className="label-eyebrow">Estimated Budget</p>
                <Input value={editDoc.estimatedBudget} onChange={(e) => setDocField("estimatedBudget", e.target.value)} className="border-border" />
              </div>
              <div className="space-y-1.5">
                <p className="label-eyebrow">RFQ Date</p>
                <Input value={editDoc.rfqDate} onChange={(e) => setDocField("rfqDate", e.target.value)} className="border-border" />
              </div>
              <div className="space-y-1.5">
                <p className="label-eyebrow">Opening Date</p>
                <Input value={editDoc.openingDate} onChange={(e) => setDocField("openingDate", e.target.value)} className="border-border" />
              </div>
              <div className="space-y-1.5">
                <p className="label-eyebrow">Place of Delivery</p>
                <Input value={editDoc.placeOfDelivery} onChange={(e) => setDocField("placeOfDelivery", e.target.value)} className="border-border" />
              </div>
              <div className="space-y-1.5">
                <p className="label-eyebrow">BAC Chairman</p>
                <Input value={editDoc.bacChairman} onChange={(e) => setDocField("bacChairman", e.target.value)} className="border-border" />
              </div>
              <div className="space-y-1.5">
                <p className="label-eyebrow">BAC Chairman Title</p>
                <Input value={editDoc.bacChairmanTitle} onChange={(e) => setDocField("bacChairmanTitle", e.target.value)} className="border-border" />
              </div>
              <div className="space-y-1.5">
                <p className="label-eyebrow">Canvasser</p>
                <Input value={editDoc.canvasser} onChange={(e) => setDocField("canvasser", e.target.value)} className="border-border" />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <p className="label-eyebrow">Purpose</p>
                <Textarea rows={2} value={editDoc.purpose} onChange={(e) => setDocField("purpose", e.target.value)} className="border-border" />
              </div>
              <div className="space-y-1.5">
                <p className="label-eyebrow">Fund Source</p>
                <Textarea rows={2} value={editDoc.fundSource} onChange={(e) => setDocField("fundSource", e.target.value)} className="border-border" />
              </div>
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
                  <TableHead className="label-eyebrow text-right">Unit ABC</TableHead>
                  <TableHead className="label-eyebrow text-right">Total ABC</TableHead>
                  <TableHead className="w-8" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {editItems.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="text-center font-semibold text-navy">{item.itemNo}</TableCell>
                    <TableCell>
                      <Input value={item.description} onChange={(e) => setEditItemField(item.id, { description: e.target.value })} className="h-8 border-border" />
                    </TableCell>
                    <TableCell>
                      <Input value={item.unit} onChange={(e) => setEditItemField(item.id, { unit: e.target.value })} className="h-8 w-20 border-border" />
                    </TableCell>
                    <TableCell className="text-right">
                      <Input value={item.qty} onChange={(e) => setEditItemField(item.id, { qty: e.target.value })} className="h-8 w-16 border-border text-right tabular-nums" />
                    </TableCell>
                    <TableCell className="text-right">
                      <Input value={item.unitAbc} onChange={(e) => setEditItemField(item.id, { unitAbc: e.target.value })} className="h-8 w-24 border-border text-right tabular-nums" />
                    </TableCell>
                    <TableCell className="text-right">
                      <Input value={item.totalAbc} onChange={(e) => setEditItemField(item.id, { totalAbc: e.target.value })} className="h-8 w-24 border-border text-right tabular-nums" />
                    </TableCell>
                    <TableCell>
                      <button type="button" onClick={() => removeEditItem(item.id)} className="text-muted-foreground hover:text-destructive">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div className="border-t border-border p-2">
              <Button variant="outline" size="sm" onClick={addEditItem} className="h-7 gap-1.5 border-border">
                <Plus className="h-3.5 w-3.5" /> Add Item Row
              </Button>
            </div>
          </Card>
        </>
      ) : (
        <Card className="overflow-hidden border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow className="bg-secondary/40 hover:bg-secondary/40">
                <TableHead className="label-eyebrow w-12">No.</TableHead>
                <TableHead className="label-eyebrow">Description</TableHead>
                <TableHead className="label-eyebrow">UOM</TableHead>
                <TableHead className="label-eyebrow text-right">Qty</TableHead>
                <TableHead className="label-eyebrow text-right">Unit ABC</TableHead>
                <TableHead className="label-eyebrow text-right">Total ABC</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rfq.items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="text-center font-semibold text-navy">{item.itemNo}</TableCell>
                  <TableCell>{item.description}</TableCell>
                  <TableCell>{item.unit}</TableCell>
                  <TableCell className="text-right tabular-nums">{item.qty}</TableCell>
                  <TableCell className="text-right tabular-nums">₱{fmtAmount(item.unitAbc)}</TableCell>
                  <TableCell className="text-right tabular-nums">₱{fmtAmount(item.totalAbc)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* Supplier canvass */}
      {(rfq.status === "Ready to Send" || rfq.status === "Canvassing" || rfq.suppliers.length > 0) && (
        <Card className="space-y-4 border border-border bg-card p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-navy">Supplier Canvass</h2>
            {rfq.status === "Canvassing" && (
              <span className="text-xs text-muted-foreground">Suppliers have 7 calendar days to reply.</span>
            )}
          </div>

          <div className="space-y-2">
            {rfq.suppliers.map((s) => (
              <div key={s.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-border p-3 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-navy">{s.supplierName || "Unnamed supplier"}</p>
                  <p className="text-xs text-muted-foreground">{s.supplierAddress}</p>
                </div>
                <StatusBadge status={s.isOverdue ? "Warning" : s.status} />
                {s.isWinner && <span className="rounded-full bg-success/10 px-2 py-0.5 text-[10px] font-semibold uppercase text-success">Winner</span>}

                {s.status === "Sent" && (
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1">
                      {rfq.items.map((item) => (
                        <Input
                          key={item.id}
                          placeholder={`₱ ${item.description.slice(0, 12)}`}
                          className="h-8 w-28 border-border text-xs"
                          value={quoteDrafts[s.id]?.[item.id] ?? ""}
                          onChange={(e) =>
                            setQuoteDrafts((prev) => ({ ...prev, [s.id]: { ...prev[s.id], [item.id]: e.target.value } }))
                          }
                        />
                      ))}
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 gap-1 border-border text-xs"
                      disabled={busy}
                      onClick={() =>
                        run(
                          () =>
                            apiRecordRfqSupplierQuote(
                              rfq.id,
                              s.id,
                              rfq.items.map((item) => ({ rfq_item_id: item.id, unit_price: parseAmount(quoteDrafts[s.id]?.[item.id] ?? "") })),
                            ),
                          "Quote recorded.",
                        )
                      }
                    >
                      <ClipboardCheck className="h-3.5 w-3.5" /> Record Quote
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 gap-1 border-warning/40 text-xs text-warning-foreground hover:bg-warning/10"
                      disabled={busy}
                      onClick={() => {
                        const name = window.prompt("Replacement supplier name:");
                        if (!name) return;
                        run(() => apiReplaceRfqSupplier(rfq.id, s.id, { supplier_name: name, reason: "Non-responding supplier replaced." }), "Supplier replaced.");
                      }}
                    >
                      <RefreshCw className="h-3.5 w-3.5" /> Replace
                    </Button>
                  </div>
                )}
                {s.status === "Replied" && (
                  <p className="text-xs font-semibold tabular-nums text-navy">
                    ₱{fmtAmount(s.quoteItems.reduce((sum, qi) => sum + (qi.totalPrice ?? 0), 0))}
                  </p>
                )}
              </div>
            ))}
          </div>

          {rfq.status === "Ready to Send" && pendingSuppliers.length < 3 && (
            <div className="flex items-center gap-2">
              <Input
                placeholder="Supplier name"
                className="h-9 max-w-xs border-border"
                value={newSupplierName}
                onChange={(e) => setNewSupplierName(e.target.value)}
              />
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5 border-border"
                disabled={busy || !newSupplierName.trim()}
                onClick={() => {
                  const name = newSupplierName.trim();
                  setNewSupplierName("");
                  run(() => apiAddRfqSupplier(rfq.id, { supplier_name: name }), "Supplier added to canvass.");
                }}
              >
                <Plus className="h-4 w-4" /> Add Supplier ({activeSuppliers.length}/3)
              </Button>
            </div>
          )}

          {rfq.status === "Ready to Send" && pendingSuppliers.length === 3 && (
            <Button size="sm" className="gap-1.5" disabled={busy} onClick={() => run(() => apiSendRfq(rfq.id), "RFQ sent to all 3 suppliers.")}>
              <Send className="h-4 w-4" /> Send RFQ to Suppliers
            </Button>
          )}
        </Card>
      )}

      {/* Abstract of Canvas */}
      {rfq.status === "Canvassing" && (
        <Card className="space-y-3 border border-border bg-card p-4">
          <h2 className="text-sm font-semibold text-navy">Abstract of Canvas</h2>
          {rfq.abstractOfCanvasId ? (
            <Button asChild size="sm" className="gap-1.5">
              <Link to="/aoc/$aocId" params={{ aocId: rfq.abstractOfCanvasId }}>
                View Abstract of Canvas
              </Link>
            </Button>
          ) : allResolved && anyReplied ? (
            <>
              {rfq.procurementCategory === "Equipment" && (
                <div className="space-y-1.5">
                  <p className="label-eyebrow">TWG Evaluation Notes (required for Equipment)</p>
                  <Input value={twgNotes} onChange={(e) => setTwgNotes(e.target.value)} className="border-border" />
                </div>
              )}
              <Button
                size="sm"
                className="gap-1.5"
                disabled={busy}
                onClick={() => run(() => apiGenerateAoc(rfq.id, twgNotes || undefined), "Abstract of Canvas generated.")}
              >
                Generate Abstract of Canvas
              </Button>
            </>
          ) : (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <AlertTriangle className="h-4 w-4" /> All suppliers must reply or be marked as timed out first.
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
