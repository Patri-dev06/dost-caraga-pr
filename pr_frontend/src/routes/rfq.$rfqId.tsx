import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { DatePickerField } from "@/components/app/date-picker-field";
import { PersonPicker } from "@/components/app/person-picker";
import { useSignatories } from "@/lib/signatories";
import { useEffect, useState } from "react";
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  ClipboardCheck,
  Download,
  FileSpreadsheet,
  Loader2,
  Plus,
  Save,
  Send,
  Trash2,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/app/page-header";
import { StatusBadge } from "@/components/app/status-badge";
import { SupplierPicker } from "@/components/app/supplier-picker";
import {
  apiGetRfq,
  apiUpdateRfq,
  apiSignRfq,
  apiAddRfqSupplier,
  apiRemoveRfqSupplier,
  apiSendRfq,
  apiRecordRfqSupplierQuote,
  apiCancelRfqSupplier,
  apiChooseReplacementSuppliers,
  apiDownloadQuotation,
  apiSaveTwgNotes,
  apiTwgCheckSupplier,
  apiGenerateAoc,
  apiGetWorkflowSignatories,
  type Rfq,
  type RfqCreatePayload,
  type RfqSupplier,
  type RfqSupplierPayload,
  type Signatory,
} from "@/lib/api";
import { fmtAmount, parseAmount } from "@/lib/lib-store";
import { useCurrentUser } from "@/lib/current-user";
import { toast } from "sonner";

export const Route = createFileRoute("/rfq/$rfqId")({
  head: () => ({ meta: [{ title: "RFQ — DOST Caraga" }] }),
  component: RfqDetailPage,
});

/** Statuses before the RFQ goes out, when its 3 suppliers are still being chosen. */
const PRE_SEND = ["Draft", "Pending Supply Officer Countersign", "Pending BAC Signature", "Ready to Send"];

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

const fmtDateTime = (value: string) => (value ? new Date(value).toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" }) : "");
const quoteTotal = (s: RfqSupplier) => s.quoteItems.reduce((sum, qi) => sum + (qi.totalPrice ?? 0), 0);

function RfqDetailPage() {
  const { rfqId } = Route.useParams();
  const navigate = useNavigate();
  const { user } = useCurrentUser();
  const isSuperadmin = user?.tier === "superadmin";
  const canSignAsSupply = Boolean(user?.isSupplyOfficer || isSuperadmin);
  const canSignAsBac = Boolean(user?.isBacChair || user?.isBacViceChair || isSuperadmin);
  const isTwgLead = Boolean(user?.isTwgLead || isSuperadmin);

  const [rfq, setRfq] = useState<Rfq | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [editDoc, setEditDoc] = useState<EditDoc | null>(null);
  const [editItems, setEditItems] = useState<EditItem[]>([]);
  const [savingDetails, setSavingDetails] = useState(false);
  const [quoteFor, setQuoteFor] = useState<string | null>(null);
  const [quoteDraft, setQuoteDraft] = useState<Record<string, string>>({});
  const [quoteFile, setQuoteFile] = useState<File | null>(null);
  const [replacements, setReplacements] = useState<Array<{ payload: RfqSupplierPayload; label: string }>>([]);
  const [twgNotes, setTwgNotes] = useState("");
  const [twgDrafts, setTwgDrafts] = useState<Record<string, Record<string, { complies: boolean | null; remarks: string }>>>({});
  // Accounts holding the BAC Chairman role, plus whoever is designated BAC Chairman in Settings —
  // so the field auto-fills from Settings even when no one has been given that role.
  const { data: bacChairmenByRole = [] } = useSignatories("BAC Chairman");
  const { data: workflowSignatories } = useQuery({
    queryKey: ["workflow-signatories"],
    queryFn: () => apiGetWorkflowSignatories(),
    staleTime: 60_000,
  });
  const designatedBacChairman: Signatory | null = workflowSignatories?.bacChairman
    ? { id: workflowSignatories.bacChairman.id, name: workflowSignatories.bacChairman.name, tier: "regular", position: workflowSignatories.bacChairman.position, roles: [] }
    : null;
  const bacChairmen = designatedBacChairman && !bacChairmenByRole.some((s) => s.id === designatedBacChairman.id)
    ? [designatedBacChairman, ...bacChairmenByRole]
    : bacChairmenByRole;

  async function reload() {
    try {
      const data = await apiGetRfq(rfqId);
      setRfq(data);
      setTwgNotes(data.twgEvaluationNotes);
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
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Action failed.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  const setDocField = <K extends keyof EditDoc>(key: K, value: EditDoc[K]) =>
    setEditDoc((d) => (d ? { ...d, [key]: value } : d));
  const setEditItemField = (id: string, patch: Partial<EditItem>) =>
    setEditItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));

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

  const preSend = PRE_SEND.includes(rfq.status);
  const pendingSuppliers = rfq.suppliers.filter((s) => s.status === "Pending");
  const canvassed = rfq.suppliers.filter((s) => s.status !== "Pending");
  const awaiting = rfq.suppliers.filter((s) => s.status === "Sent");
  const replied = rfq.suppliers.filter((s) => s.status === "Replied");
  const canvassOpen = (rfq.status === "Canvassing" || rfq.status === "TWG Evaluation") && !rfq.abstractOfCanvasId;
  const onRfq = rfq.suppliers.filter((s) => s.status !== "Replaced").map((s) => s.supplierId).filter((id): id is string => !!id);
  const isEquipment = rfq.procurementCategory === "Equipment";
  const twgDone = replied.length > 0 && replied.every((s) => s.twgResult !== null);
  const anyPassed = replied.some((s) => s.twgResult === "Passed");
  const aocReady = isEquipment
    ? rfq.status === "TWG Evaluation" && twgDone && anyPassed && !!rfq.twgEvaluationNotes
    : rfq.status === "Canvassing" && awaiting.length === 0 && replied.length > 0;

  function twgDraftFor(s: RfqSupplier) {
    const saved = Object.fromEntries(s.quoteItems.map((qi) => [qi.rfqItemId, { complies: qi.twgComplies, remarks: qi.twgRemarks }]));
    return { ...saved, ...(twgDrafts[s.id] ?? {}) };
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-5 px-3 py-4 sm:space-y-6 sm:px-6 sm:py-8 lg:px-8">
      <PageHeader
        eyebrow={`PR ${rfq.prNo} · ${rfq.procurementCategory}`}
        title={rfq.rfqNo}
        subtitle={`Request for Quotation${rfq.preparedByName ? ` · Prepared by ${rfq.preparedByName}${rfq.preparedByPosition ? `, ${rfq.preparedByPosition}` : ""}` : ""}`}
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

      {rfq.status === "Cancelled" && (
        <Card className="flex items-start gap-3 border border-destructive/30 bg-destructive/5 p-4 text-sm">
          <Ban className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
          <div>
            <p className="font-semibold text-destructive">This RFQ was cancelled with its Purchase Request.</p>
            <Link to="/purchase-requests/$prId" params={{ prId: rfq.prId }} className="text-primary underline-offset-2 hover:underline">Open PR {rfq.prNo}</Link>
          </div>
        </Card>
      )}

      {/* Flowchart: Generate RFQ -> Supply Officer counter-sign -> BAC Chair / Vice-Chair sign */}
      <Card className="border border-border bg-card p-4">
        <h2 className="mb-3 text-sm font-semibold text-navy">RFQ Signatures</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <SignStep
            label="1 · Supply Officer (counter-sign)"
            signedName={rfq.supplyOfficerSignedName}
            signedAt={rfq.supplyOfficerSignedAt}
            current={rfq.status === "Draft" || rfq.status === "Pending Supply Officer Countersign"}
            canSign={canSignAsSupply}
            waitingFor="the designated Supply Officer"
            busy={busy}
            onSign={() => run(() => apiSignRfq(rfq.id, "supply-officer"), "Counter-signed as Supply Officer.")}
          />
          <SignStep
            label="2 · BAC Chairman or Vice-Chairman"
            signedName={rfq.bacSignedName ? `${rfq.bacSignedName}${rfq.bacSignedRole ? ` (${rfq.bacSignedRole})` : ""}` : ""}
            signedAt={rfq.bacSignedAt}
            current={rfq.status === "Pending BAC Signature"}
            canSign={canSignAsBac}
            waitingFor="the BAC Chairman or Vice-Chairman (either one)"
            busy={busy}
            onSign={() => run(() => apiSignRfq(rfq.id, "bac"), "Signed for the BAC.")}
          />
        </div>
      </Card>

      {/* Draft details — editable until the Supply Officer counter-signs */}
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
                    <SelectItem value="Equipment">Equipment (TWG checks each item)</SelectItem>
                    <SelectItem value="Venue">List of Venue (rated)</SelectItem>
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
                <DatePickerField value={editDoc.openingDate} onChange={(v) => setDocField("openingDate", v)} notBeforeToday />
              </div>
              <div className="space-y-1.5">
                <p className="label-eyebrow">Place of Delivery</p>
                <Input value={editDoc.placeOfDelivery} onChange={(e) => setDocField("placeOfDelivery", e.target.value)} className="border-border" />
              </div>
              <div className="space-y-1.5">
                <p className="label-eyebrow">BAC Chairman</p>
                <PersonPicker
                  value={editDoc.bacChairman}
                  options={bacChairmen}
                  onPick={(name, person) => {
                    setDocField("bacChairman", name);
                    if (person?.position) setDocField("bacChairmanTitle", person.position);
                  }}
                  autoPickSole
                  placeholder="Type the BAC Chairman's name…"
                  emptyText="No BAC Chairman is designated. A Superadmin can set one in Settings."
                  className="h-9 border-border"
                />
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
            <div className="overflow-x-auto">
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
                  {editItems.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="text-center font-semibold text-navy">{item.itemNo}</TableCell>
                      <TableCell>
                        <Input value={item.description} onChange={(e) => setEditItemField(item.id, { description: e.target.value })} className="h-8 border-border" />
                      </TableCell>
                      {/* Unit, quantity and ABC are the approved PR's; only the description can be worded. */}
                      <TableCell className="text-sm">{item.unit}</TableCell>
                      <TableCell className="text-right tabular-nums">{item.qty}</TableCell>
                      <TableCell className="text-right tabular-nums">{item.unitAbc}</TableCell>
                      <TableCell className="text-right tabular-nums">{item.totalAbc}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <p className="border-t border-border p-2 text-xs text-muted-foreground">
              Items, quantities and ABC come from the approved Purchase Request and cannot be added or changed.
            </p>
          </Card>
        </>
      ) : (
        <Card className="overflow-hidden border border-border bg-card">
          <div className="overflow-x-auto">
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
          </div>
        </Card>
      )}

      {/* Flowchart: Filter Supplier based on category -> Choose 3 supplier -> Send RFQ (delivered by the Supply team) */}
      {rfq.status !== "Cancelled" && (
        <Card className="space-y-4 border border-border bg-card p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-navy">Supplier Canvass</h2>
            <span className="text-xs text-muted-foreground">
              {rfq.supplierCategory} suppliers · the Supply team delivers the RFQ; each supplier has 7 calendar days to reply
            </span>
          </div>

          {preSend && (
            <div className="space-y-2">
              <p className="label-eyebrow">Chosen suppliers ({pendingSuppliers.length}/3)</p>
              {pendingSuppliers.length === 0 && <p className="text-xs text-muted-foreground">Choose 3 {rfq.supplierCategory} suppliers from the directory.</p>}
              {pendingSuppliers.map((s) => (
                <div key={s.id} className="flex items-center gap-2 rounded-lg border border-border p-2 text-sm">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-navy">{s.supplierName}</p>
                    <p className="truncate text-xs text-muted-foreground">{[s.supplierContactNo, s.supplierEmail, s.supplierAddress].filter(Boolean).join(" · ") || "No contact details on file"}</p>
                  </div>
                  <Button size="sm" variant="ghost" className="h-7 text-muted-foreground hover:text-destructive" disabled={busy} onClick={() => run(() => apiRemoveRfqSupplier(rfq.id, s.id), "Supplier removed.")} aria-label={`Remove ${s.supplierName}`}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
              {pendingSuppliers.length < 3 && (
                <SupplierPicker
                  category={rfq.supplierCategory}
                  excludeSupplierIds={onRfq}
                  disabled={busy}
                  onPick={(payload, label) => run(() => apiAddRfqSupplier(rfq.id, payload), `${label} added to the canvass.`)}
                />
              )}
              {rfq.status === "Ready to Send" && pendingSuppliers.length === 3 && (
                <Button
                  size="sm"
                  className="gap-1.5"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      const result = await apiSendRfq(rfq.id);
                      toast.success(result.message);
                      await reload();
                    } catch (error) {
                      toast.error(error instanceof Error ? error.message : "Unable to send the RFQ.");
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  <Send className="h-4 w-4" /> Mark RFQ as sent to the 3 suppliers
                </Button>
              )}
              {rfq.status !== "Ready to Send" && pendingSuppliers.length === 3 && (
                <p className="text-xs text-muted-foreground">The RFQ can be sent once the Supply Officer and the BAC have signed.</p>
              )}
            </div>
          )}

          {canvassed.length > 0 && (
            <div className="space-y-2">
              {canvassed.map((s) => (
                <div key={s.id} className={`space-y-2 rounded-lg border p-3 text-sm ${s.status === "Replaced" ? "border-border opacity-60" : "border-border"}`}>
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-navy">
                        {s.supplierName || "Unnamed supplier"}
                        {s.isWinner && <span className="ml-2 rounded-full bg-success/10 px-2 py-0.5 text-[10px] font-semibold uppercase text-success">Winner</span>}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {s.status === "Sent" && s.replyDueAt && `Reply due ${fmtDateTime(s.replyDueAt)}`}
                        {s.status === "Replied" && `Signed quotation recorded ${fmtDateTime(s.repliedAt)}`}
                        {(s.status === "TimedOut" || s.status === "Failed TWG") && (s.remarks || "")}
                        {s.status === "Replaced" && "Replaced by a newly chosen supplier"}
                      </p>
                    </div>
                    {s.twgResult && <StatusBadge status={s.twgResult === "Passed" ? "Passed" : "Failed"} />}
                    <StatusBadge status={s.isOverdue ? "Warning" : s.status} />
                    {s.status === "Replied" && <p className="text-xs font-semibold tabular-nums text-navy">₱{fmtAmount(quoteTotal(s))}</p>}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {s.hasQuotation && (
                      <Button size="sm" variant="outline" className="h-7 gap-1 border-border text-xs" onClick={() => apiDownloadQuotation(rfq.id, s.id, s.quotationName).catch((e) => toast.error(e.message))}>
                        <Download className="h-3.5 w-3.5" /> Signed quotation
                      </Button>
                    )}
                    {s.status === "Sent" && canvassOpen && (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 gap-1 border-border text-xs"
                          onClick={() => {
                            setQuoteFor(quoteFor === s.id ? null : s.id);
                            setQuoteDraft({});
                            setQuoteFile(null);
                          }}
                        >
                          <ClipboardCheck className="h-3.5 w-3.5" /> Record signed quotation
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 gap-1 border-warning/40 text-xs text-warning-foreground hover:bg-warning/10"
                          disabled={busy}
                          onClick={() => {
                            const reason = window.prompt(`Cancel the RFQ sent to ${s.supplierName}? Reason:`, "No reply from the supplier.");
                            if (reason === null) return;
                            run(() => apiCancelRfqSupplier(rfq.id, s.id, reason || undefined), "RFQ to this supplier cancelled. Choose a replacement below.");
                          }}
                        >
                          <XCircle className="h-3.5 w-3.5" /> Cancel (no reply)
                        </Button>
                      </>
                    )}
                  </div>

                  {quoteFor === s.id && s.status === "Sent" && (
                    <div className="space-y-2 rounded-md bg-secondary/40 p-3">
                      <p className="text-xs text-muted-foreground">Enter the unit price for every item and attach the supplier's signed quotation (PDF or photo, up to 10 MB).</p>
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        {rfq.items.map((item) => (
                          <label key={item.id} className="space-y-1 text-xs">
                            <span className="block truncate text-muted-foreground">{item.itemNo}. {item.description} ({item.qty} {item.unit})</span>
                            <Input inputMode="decimal" placeholder="Unit price ₱" value={quoteDraft[item.id] ?? ""} onChange={(e) => setQuoteDraft((d) => ({ ...d, [item.id]: e.target.value }))} className="h-8 border-border" />
                          </label>
                        ))}
                      </div>
                      <Input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={(e) => setQuoteFile(e.target.files?.[0] ?? null)} className="h-9 border-border text-xs" aria-label="Signed quotation file" />
                      <Button
                        size="sm"
                        className="gap-1.5"
                        disabled={busy}
                        onClick={async () => {
                          if (rfq.items.some((item) => !(quoteDraft[item.id] ?? "").trim())) {
                            toast.error("Enter a unit price for every item.");
                            return;
                          }
                          if (!quoteFile) {
                            toast.error("Attach the signed quotation.");
                            return;
                          }
                          const ok = await run(
                            () => apiRecordRfqSupplierQuote(rfq.id, s.id, rfq.items.map((item) => ({ rfq_item_id: item.id, unit_price: parseAmount(quoteDraft[item.id] ?? "") })), quoteFile),
                            "Quotation recorded.",
                          );
                          if (ok) setQuoteFor(null);
                        }}
                      >
                        <Save className="h-4 w-4" /> Save quotation
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Flowchart: "Choose n of supplier" (no reply) / "Choose n of supplier needed" (all failed the TWG check) */}
          {canvassOpen && rfq.openSupplierSlots > 0 && (
            <div className="space-y-2 rounded-lg border border-warning/40 bg-warning/5 p-3">
              <p className="text-sm font-semibold text-navy">
                Choose {rfq.openSupplierSlots} replacement supplier{rfq.openSupplierSlots > 1 ? "s" : ""}
              </p>
              <p className="text-xs text-muted-foreground">
                {rfq.suppliers.some((s) => s.status === "Failed TWG" && !s.replacedBySupplierId)
                  ? "Every supplier failed the TWG check. Choose new suppliers to canvass."
                  : "Suppliers whose RFQ was cancelled for not replying leave a slot. The RFQ goes to each replacement right away."}
              </p>
              {replacements.map((r, i) => (
                <div key={`${r.label}-${i}`} className="flex items-center gap-2 rounded-md bg-card p-2 text-sm">
                  <span className="min-w-0 flex-1 truncate font-medium text-navy">{r.label}</span>
                  <Button size="sm" variant="ghost" className="h-7" onClick={() => setReplacements((cur) => cur.filter((_, j) => j !== i))} aria-label={`Remove ${r.label}`}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
              {replacements.length < rfq.openSupplierSlots && (
                <SupplierPicker
                  category={rfq.supplierCategory}
                  excludeSupplierIds={[...onRfq, ...replacements.map((r) => String(r.payload.supplier_id ?? "")).filter(Boolean)]}
                  actionLabel="Choose"
                  disabled={busy}
                  onPick={(payload, label) => setReplacements((cur) => [...cur, { payload, label }])}
                />
              )}
              {replacements.length > 0 && (
                <Button
                  size="sm"
                  className="gap-1.5"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      const result = await apiChooseReplacementSuppliers(rfq.id, replacements.map((r) => r.payload));
                      setReplacements([]);
                      toast.success(result.message);
                      await reload();
                    } catch (error) {
                      toast.error(error instanceof Error ? error.message : "Unable to add the replacement suppliers.");
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  <Send className="h-4 w-4" /> Mark RFQ as sent to {replacements.length} replacement{replacements.length > 1 ? "s" : ""}
                </Button>
              )}
            </div>
          )}
        </Card>
      )}

      {/* Equipment: TWG Specification evaluation -> Check each equipment with supplier */}
      {isEquipment && rfq.status === "TWG Evaluation" && !rfq.abstractOfCanvasId && (
        <Card className="space-y-4 border border-border bg-card p-4">
          <div>
            <h2 className="text-sm font-semibold text-navy">TWG Evaluation</h2>
            <p className="text-xs text-muted-foreground">
              {isTwgLead
                ? "Record the specification evaluation, then check each quoted equipment item against the specifications, supplier by supplier."
                : "Waiting for the designated TWG Lead to check each supplier's equipment."}
            </p>
          </div>
          <div className="space-y-1.5">
            <p className="label-eyebrow">Specification evaluation notes</p>
            <Textarea rows={3} value={twgNotes} onChange={(e) => setTwgNotes(e.target.value)} disabled={!isTwgLead} className="border-border" />
            {isTwgLead && (
              <Button size="sm" variant="outline" className="gap-1.5 border-border" disabled={busy || !twgNotes.trim()} onClick={() => run(() => apiSaveTwgNotes(rfq.id, twgNotes.trim()), "TWG notes saved.")}>
                <Save className="h-4 w-4" /> Save notes
              </Button>
            )}
          </div>
          {replied.map((s) => {
            const draft = twgDraftFor(s);
            return (
              <div key={s.id} className="space-y-2 rounded-lg border border-border p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-navy">{s.supplierName}</p>
                  {s.twgResult ? <StatusBadge status={s.twgResult === "Passed" ? "Passed" : "Failed"} /> : <span className="text-xs text-muted-foreground">Not checked yet</span>}
                </div>
                {rfq.items.map((item) => {
                  const row = draft[item.id] ?? { complies: null, remarks: "" };
                  const set = (patch: Partial<{ complies: boolean | null; remarks: string }>) =>
                    setTwgDrafts((cur) => ({ ...cur, [s.id]: { ...(cur[s.id] ?? {}), [item.id]: { ...row, ...patch } } }));
                  return (
                    <div key={item.id} className="grid grid-cols-1 items-center gap-2 text-xs sm:grid-cols-[1fr_auto_1fr]">
                      <span className="truncate text-foreground">{item.itemNo}. {item.description}</span>
                      <div className="flex gap-1" role="group" aria-label={`${item.description}: complies?`}>
                        <Button type="button" size="sm" variant={row.complies === true ? "default" : "outline"} className="h-7 border-border text-xs" disabled={!isTwgLead} onClick={() => set({ complies: true })}>
                          Complies
                        </Button>
                        <Button type="button" size="sm" variant={row.complies === false ? "destructive" : "outline"} className="h-7 border-border text-xs" disabled={!isTwgLead} onClick={() => set({ complies: false })}>
                          Does not
                        </Button>
                      </div>
                      <Input placeholder="Remarks" value={row.remarks} onChange={(e) => set({ remarks: e.target.value })} disabled={!isTwgLead} className="h-7 border-border text-xs" />
                    </div>
                  );
                })}
                {isTwgLead && (
                  <Button
                    size="sm"
                    className="gap-1.5"
                    disabled={busy}
                    onClick={async () => {
                      if (rfq.items.some((item) => draft[item.id]?.complies == null)) {
                        toast.error("Mark every item as complying or not.");
                        return;
                      }
                      setBusy(true);
                      try {
                        const result = await apiTwgCheckSupplier(rfq.id, s.id, rfq.items.map((item) => ({ rfq_item_id: item.id, complies: Boolean(draft[item.id]?.complies), remarks: draft[item.id]?.remarks || undefined })));
                        setTwgDrafts((cur) => ({ ...cur, [s.id]: {} }));
                        toast.success(result.message);
                        await reload();
                      } catch (error) {
                        toast.error(error instanceof Error ? error.message : "Unable to save the TWG check.");
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    <ClipboardCheck className="h-4 w-4" /> Save check for {s.supplierName}
                  </Button>
                )}
              </div>
            );
          })}
        </Card>
      )}

      {/* Abstract of Canvas */}
      {(rfq.abstractOfCanvasId || rfq.status === "Canvassing" || rfq.status === "TWG Evaluation") && (
        <Card className="space-y-3 border border-border bg-card p-4">
          <h2 className="text-sm font-semibold text-navy">Abstract of Canvas</h2>
          {rfq.abstractOfCanvasId ? (
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={rfq.abstractOfCanvasStatus ?? ""} />
              <Button asChild size="sm" className="gap-1.5">
                <Link to="/aoc/$aocId" params={{ aocId: rfq.abstractOfCanvasId }}>View Abstract of Canvas</Link>
              </Button>
            </div>
          ) : aocReady ? (
            <>
              <p className="text-xs text-muted-foreground">
                {rfq.procurementCategory === "Venue"
                  ? "Next the TWG Lead, the end-user and the Supply Officer rate each venue; the top-rated venue wins."
                  : isEquipment
                    ? "Built from the suppliers that passed the TWG check; the lowest of them wins."
                    : "The lowest quotation wins."}
              </p>
              <Button size="sm" className="gap-1.5" disabled={busy} onClick={() => run(() => apiGenerateAoc(rfq.id), "Abstract of Canvas generated.")}>
                Generate Abstract of Canvas
              </Button>
            </>
          ) : (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              {isEquipment && rfq.status === "TWG Evaluation"
                ? !rfq.twgEvaluationNotes
                  ? "The TWG Lead must save the specification evaluation notes."
                  : !twgDone
                    ? "The TWG Lead must check every supplier's equipment."
                    : "No supplier passed the TWG check."
                : awaiting.length > 0
                  ? `Waiting on ${awaiting.length} supplier${awaiting.length > 1 ? "s" : ""} to reply (or be cancelled after 7 days).`
                  : "At least one supplier must send a quotation."}
            </div>
          )}
        </Card>
      )}
    </div>
  );
}

function SignStep({
  label,
  signedName,
  signedAt,
  current,
  canSign,
  waitingFor,
  busy,
  onSign,
}: {
  label: string;
  signedName: string;
  signedAt: string;
  current: boolean;
  canSign: boolean;
  waitingFor: string;
  busy: boolean;
  onSign: () => void;
}) {
  const done = !!signedName;
  return (
    <div className={`rounded-lg border p-3 text-xs ${done ? "border-success/30 bg-success/5" : current ? "border-primary/40 bg-primary/5" : "border-border"}`}>
      <p className="flex items-center gap-1.5 font-semibold text-navy">
        {done && <CheckCircle2 className="h-3.5 w-3.5 text-success" />}
        {label}
      </p>
      {done ? (
        <p className="mt-1 text-muted-foreground">
          Signed by {signedName}
          <br />
          {fmtDateTime(signedAt)}
        </p>
      ) : current ? (
        canSign ? (
          <Button size="sm" className="mt-2 h-7 gap-1 text-xs" disabled={busy} onClick={onSign}>
            Sign now
          </Button>
        ) : (
          <p className="mt-1 text-muted-foreground">Waiting for {waitingFor}.</p>
        )
      ) : (
        <p className="mt-1 text-muted-foreground">Awaiting the previous signature</p>
      )}
    </div>
  );
}
