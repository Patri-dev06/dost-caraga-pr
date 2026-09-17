import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Download, Eye, FileSpreadsheet, Loader2, Pencil, Plus, Printer, Save, SendHorizontal, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { apiGetPurchaseRequest, apiCreateRfq, apiUpdateRfq, apiGetRfq, apiSubmitRfq, type Rfq, type RfqCreatePayload } from "@/lib/api";
import { fmtAmount, parseAmount } from "@/lib/lib-store";
import { exportRfqExcel } from "@/lib/rfq-excel";
import type { PurchaseRequest } from "@/lib/mock-data";

export const Route = createFileRoute("/rfq/new")({
  validateSearch: (search: Record<string, unknown>): { pr?: string; rfqId?: string } => ({
    pr: typeof search.pr === "string" ? search.pr : undefined,
    rfqId: typeof search.rfqId === "string" ? search.rfqId : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Generate RFQ — DOST Caraga" },
      { name: "description", content: "Generate a Request for Quotation from a Purchase Request." },
    ],
  }),
  component: CreateRfqPage,
});

const SERIF = '"Times New Roman", Times, serif';

type Align = "left" | "center" | "right";
const alignCls: Record<Align, string> = { left: "text-left", center: "text-center", right: "text-right" };

function TextField({
  value,
  onChange,
  editing,
  align = "left",
  bold,
  underline,
  placeholder,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  editing: boolean;
  align?: Align;
  bold?: boolean;
  underline?: boolean;
  placeholder?: string;
  className?: string;
}) {
  const shared = cn("w-full bg-transparent leading-snug", alignCls[align], bold && "font-bold", underline && "underline", className);
  if (!editing) return <span className={cn(shared, "inline-block min-h-[1.2em] whitespace-pre-wrap break-words")}>{value || " "}</span>;
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={cn(shared, "rounded-sm px-0.5 outline-none placeholder:italic placeholder:text-black/30 hover:bg-amber-50 focus:bg-amber-100")}
    />
  );
}

function AutoTextarea({
  value,
  onChange,
  editing,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  editing: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value, editing]);
  if (!editing) return <div className={cn("min-h-[1.2em] whitespace-pre-wrap break-words leading-snug", className)}>{value || " "}</div>;
  return (
    <textarea
      ref={ref}
      rows={1}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={cn("w-full resize-none overflow-hidden rounded-sm bg-transparent px-0.5 leading-snug outline-none hover:bg-amber-50 focus:bg-amber-100", className)}
    />
  );
}

// Right-aligned amount cell. While focused it shows the raw digits for easy
// editing; when blurred (or read-only) it shows the grouped "8,000.00" form.
// parseAmount tolerates the commas either way.
function AmountInput({
  value,
  onChange,
  editing,
}: {
  value: string;
  onChange: (v: string) => void;
  editing: boolean;
}) {
  const [focused, setFocused] = useState(false);
  if (!editing) return <span>{value ? fmtAmount(parseAmount(value)) : " "}</span>;
  return (
    <input
      inputMode="decimal"
      value={focused || value === "" ? value : fmtAmount(parseAmount(value))}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-sm bg-transparent px-0.5 text-right tabular-nums outline-none hover:bg-amber-50 focus:bg-amber-100"
    />
  );
}

interface RfqFormItem {
  id: string;
  itemNo: number;
  qty: string;
  unit: string;
  description: string;
  unitAbc: string;
  totalAbc: string;
  unitPrice: string;
  total: string;
}

interface RfqFormDoc {
  quotationNo: string;
  rfqDate: string;
  placeOfDelivery: string;
  estimatedBudget: string;
  prNo: string;
  openingDate: string;
  bacChairman: string;
  bacChairmanTitle: string;
  purpose: string;
  fundSource: string;
  items: RfqFormItem[];
  supplierName: string;
  supplierAddress: string;
  supplierBy: string;
  supplierContactNo: string;
  supplierTin: string;
  canvasser: string;
  bacAction: string;
}

function newItem(itemNo: number): RfqFormItem {
  return {
    id: crypto.randomUUID(),
    itemNo,
    qty: "",
    unit: "",
    description: "",
    unitAbc: "",
    totalAbc: "",
    unitPrice: "",
    total: "",
  };
}

function todayStr() {
  const d = new Date();
  return `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}/${d.getFullYear()}`;
}

function docFromRfq(rfq: Rfq): RfqFormDoc {
  return {
    quotationNo: rfq.quotationNo,
    rfqDate: rfq.rfqDate,
    placeOfDelivery: rfq.placeOfDelivery,
    estimatedBudget: String(rfq.estimatedBudget),
    prNo: rfq.prNo,
    openingDate: rfq.openingDate,
    bacChairman: rfq.bacChairman,
    bacChairmanTitle: rfq.bacChairmanTitle,
    purpose: rfq.purpose,
    fundSource: rfq.fundSource,
    items: rfq.items.map((it) => ({
      id: it.id,
      itemNo: it.itemNo,
      qty: String(it.qty),
      unit: it.unit,
      description: it.description,
      unitAbc: String(it.unitAbc),
      totalAbc: String(it.totalAbc),
      unitPrice: it.unitPrice,
      total: it.total,
    })),
    supplierName: rfq.supplierName,
    supplierAddress: rfq.supplierAddress,
    supplierBy: rfq.supplierBy,
    supplierContactNo: rfq.supplierContactNo,
    supplierTin: rfq.supplierTin,
    canvasser: rfq.canvasser,
    bacAction: rfq.bacAction,
  };
}

function CreateRfqPage() {
  const navigate = useNavigate();
  const { pr: prId, rfqId } = Route.useSearch();
  const [sourcePr, setSourcePr] = useState<PurchaseRequest | null>(null);
  const [existingRfq, setExistingRfq] = useState<Rfq | null>(null);
  const [mode, setMode] = useState<"edit" | "preview">("edit");
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(!!prId || !!rfqId);
  const loaded = useRef(false);

  const [doc, setDoc] = useState<RfqFormDoc>({
    quotationNo: "",
    rfqDate: todayStr(),
    placeOfDelivery: "BUTUAN CITY",
    estimatedBudget: "",
    prNo: "",
    openingDate: "",
    bacChairman: "MERIAM B. BOUQUIA",
    bacChairmanTitle: "Chairman, Bids & Awards Committee",
    purpose: "",
    fundSource: "",
    items: [],
    supplierName: "",
    supplierAddress: "",
    supplierBy: "",
    supplierContactNo: "",
    supplierTin: "",
    canvasser: "",
    bacAction: "",
  });

  useEffect(() => {
    if (loaded.current) return;
    loaded.current = true;

    if (rfqId) {
      (async () => {
        try {
          const rfq = await apiGetRfq(rfqId);
          setExistingRfq(rfq);
          setDoc(docFromRfq(rfq));
          if (rfq.status !== "Draft" && rfq.status !== "Returned") setMode("preview");
        } catch {
          toast.error("Could not load RFQ.");
          navigate({ to: "/rfq" });
        } finally {
          setLoading(false);
        }
      })();
      return;
    }

    if (!prId) {
      setLoading(false);
      return;
    }

    function populateFromPr(pr: PurchaseRequest) {
      setSourcePr(pr);

      const items: RfqFormItem[] = pr.items.map((item, i) => ({
        id: crypto.randomUUID(),
        itemNo: i + 1,
        qty: String(item.qty),
        unit: item.uom,
        description: item.description ? `${item.name}\n${item.description}` : item.name,
        unitAbc: String(item.unitCost),
        totalAbc: String(item.qty * item.unitCost),
        unitPrice: "",
        total: "",
      }));

      const totalBudget = pr.items.reduce((sum, item) => sum + item.qty * item.unitCost, 0);

      setDoc((d) => ({
        ...d,
        quotationNo: pr.prNo.replace("PR-", ""),
        prNo: pr.prNo,
        estimatedBudget: String(totalBudget),
        purpose: pr.purpose,
        fundSource: pr.fundSource,
        items,
      }));
    }

    (async () => {
      try {
        const pr = await apiGetPurchaseRequest(prId);
        populateFromPr(pr);
      } catch {
        toast.error("Could not load Purchase Request.");
        navigate({ to: "/rfq" });
      } finally {
        setLoading(false);
      }
    })();
  }, [prId, rfqId, navigate]);

  const editable = mode === "edit" && (!existingRfq || existingRfq.status === "Draft" || existingRfq.status === "Returned");
  const readOnlyLoaded = !!existingRfq && existingRfq.status !== "Draft" && existingRfq.status !== "Returned";

  const set = <K extends keyof RfqFormDoc>(key: K, value: RfqFormDoc[K]) => setDoc((d) => ({ ...d, [key]: value }));
  const setItem = (id: string, patch: Partial<RfqFormItem>) =>
    setDoc((d) => ({ ...d, items: d.items.map((it) => (it.id === id ? { ...it, ...patch } : it)) }));
  const removeItem = (id: string) =>
    setDoc((d) => ({ ...d, items: d.items.filter((it) => it.id !== id).map((it, i) => ({ ...it, itemNo: i + 1 })) }));

  function addItem() {
    setDoc((d) => ({ ...d, items: [...d.items, newItem(d.items.length + 1)] }));
  }

  useMemo(() => doc.items.reduce((sum, it) => sum + parseAmount(it.totalAbc), 0), [doc.items]);

  function buildPayload(): RfqCreatePayload {
    return {
      purchase_request_id: (prId || existingRfq?.prId) as string,
      quotation_no: doc.quotationNo,
      rfq_date: doc.rfqDate,
      opening_date: doc.openingDate,
      place_of_delivery: doc.placeOfDelivery,
      estimated_budget: parseAmount(doc.estimatedBudget),
      bac_chairman: doc.bacChairman,
      bac_chairman_title: doc.bacChairmanTitle,
      purpose: doc.purpose,
      fund_source_snapshot: doc.fundSource,
      supplier_name: doc.supplierName,
      supplier_address: doc.supplierAddress,
      supplier_by: doc.supplierBy,
      supplier_contact_no: doc.supplierContactNo,
      supplier_tin: doc.supplierTin,
      canvasser: doc.canvasser,
      bac_action: doc.bacAction,
      items: doc.items.map((it) => ({
        item_no: it.itemNo,
        description: it.description,
        uom: it.unit,
        quantity: Number(it.qty) || 0,
        unit_abc: parseAmount(it.unitAbc),
        total_abc: parseAmount(it.totalAbc),
        unit_price: parseAmount(it.unitPrice),
        total_price: parseAmount(it.total),
      })),
    };
  }

  async function handleSave() {
    if (doc.items.length === 0) {
      toast.error("Add at least one item.");
      return;
    }

    setSaving(true);
    try {
      if (existingRfq) {
        await apiUpdateRfq(existingRfq.id, buildPayload());
        toast.success("RFQ updated successfully.");
      } else {
        await apiCreateRfq(buildPayload());
        toast.success("RFQ saved successfully.");
      }
      navigate({ to: "/rfq" });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to save RFQ.");
    } finally {
      setSaving(false);
    }
  }

  async function handleSubmit() {
    if (!existingRfq) return;
    setSubmitting(true);
    try {
      await apiSubmitRfq(existingRfq.id);
      toast.success("RFQ submitted for recommendation.");
      navigate({ to: "/rfq" });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to submit RFQ.");
    } finally {
      setSubmitting(false);
    }
  }

  function handleExportExcel() {
    exportRfqExcel(
      {
        quotationNo: doc.quotationNo,
        rfqDate: doc.rfqDate,
        placeOfDelivery: doc.placeOfDelivery,
        estimatedBudget: parseAmount(doc.estimatedBudget),
        prNo: doc.prNo,
        openingDate: doc.openingDate,
        bacChairman: doc.bacChairman,
        bacChairmanTitle: doc.bacChairmanTitle,
        purpose: doc.purpose,
        fundSource: doc.fundSource,
        items: doc.items.map((it) => ({
          itemNo: it.itemNo,
          qty: Number(it.qty) || 0,
          unit: it.unit,
          description: it.description,
          unitAbc: parseAmount(it.unitAbc),
          totalAbc: parseAmount(it.totalAbc),
          unitPrice: it.unitPrice,
          total: it.total,
        })),
        canvasser: doc.canvasser,
        bacAction: doc.bacAction,
      },
      `RFQ-${doc.quotationNo || "draft"}`,
    );
  }

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <span className="ml-2 text-sm text-muted-foreground">Loading…</span>
      </div>
    );
  }

  const editing = editable;

  return (
    <div className="min-h-full bg-background print:bg-white">
      {/* Toolbar */}
      <div className="no-print sticky top-0 z-10 border-b border-border bg-card/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-2 px-3 py-3 sm:px-6">
          <Button variant="ghost" size="sm" asChild className="gap-1.5 text-muted-foreground">
            <Link to="/rfq">
              <ArrowLeft className="h-4 w-4" /> Back
            </Link>
          </Button>

          <span className="hidden rounded-md bg-secondary px-2 py-1 text-xs font-semibold text-secondary-foreground sm:inline">
            {existingRfq ? `${existingRfq.rfqNo} · ${existingRfq.status}` : "New RFQ"}
          </span>

          {!readOnlyLoaded && (
            <div className="ml-1 flex rounded-lg border border-border bg-background p-0.5">
              <button
                type="button"
                onClick={() => setMode("edit")}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                  mode === "edit" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Pencil className="h-3.5 w-3.5" /> Edit
              </button>
              <button
                type="button"
                onClick={() => setMode("preview")}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                  mode === "preview" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Eye className="h-3.5 w-3.5" /> Preview
              </button>
            </div>
          )}

          <div className="ml-auto flex items-center gap-2">
            <Button variant="outline" size="sm" className="gap-1.5 border-border" onClick={handleExportExcel}>
              <FileSpreadsheet className="h-4 w-4" /> Export Excel
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5 border-border" onClick={() => window.print()}>
              <Download className="h-4 w-4" /> Export PDF
            </Button>
            {mode === "preview" && (
              <Button variant="outline" size="sm" className="gap-1.5 border-border" onClick={() => window.print()}>
                <Printer className="h-4 w-4" /> Print
              </Button>
            )}
            {!readOnlyLoaded && (
              <Button size="sm" className="gap-1.5" onClick={handleSave} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {existingRfq ? "Save Changes" : "Save RFQ"}
              </Button>
            )}
            {existingRfq?.status === "Draft" && (
              <Button size="sm" variant="outline" className="gap-1.5 border-border" onClick={handleSubmit} disabled={submitting}>
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <SendHorizontal className="h-4 w-4" />}
                Submit
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Document */}
      <div className="w-full overflow-x-auto px-3 py-6 sm:px-6 print:overflow-visible print:p-0">
        <div className="pr-print-root mx-auto w-[850px] max-w-full">
          <div
            className="bg-white px-10 py-8 text-[11px] text-black shadow-card ring-1 ring-black/5 print:shadow-none print:ring-0"
            style={{ fontFamily: SERIF }}
          >
            {/* Letterhead */}
            <div className="text-center text-[11px] leading-snug">
              <p className="italic">Republic of the Philippines</p>
              <p className="font-bold">DEPARTMENT OF SCIENCE AND TECHNOLOGY</p>
              <p>Caraga Regional Office No. 13</p>
              <p>CSU Campus, Ampayon, Butuan City</p>
              <p>Telephone No.: (085) 226-3831</p>
              <p>Email Address: supply@caraga.dost.gov.ph</p>
            </div>

            <h1 className="mt-5 text-center text-[14px] font-bold">REQUEST FOR QUOTATION</h1>

            {/* Meta fields — right aligned */}
            <div className="mt-4 flex justify-end">
              <div className="space-y-0.5 text-[11px]">
                <div className="flex items-center gap-2">
                  <span className="w-36 text-right">Quotation No.:</span>
                  <span className="inline-block w-40 border-b border-black">
                    <TextField value={doc.quotationNo} onChange={() => {}} editing={false} bold />
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-36 text-right">RFQ Date:</span>
                  <span className="inline-block w-40 border-b border-black">
                    <TextField value={doc.rfqDate} onChange={() => {}} editing={false} bold />
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-36 text-right">Place of Delivery:</span>
                  <span className="inline-block w-40 border-b border-black">
                    <TextField value={doc.placeOfDelivery} onChange={() => {}} editing={false} bold />
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-36 text-right">Estimated Budget:</span>
                  <span className="inline-block w-40 border-b border-black">
                    <TextField value={doc.estimatedBudget ? `₱ ${fmtAmount(parseAmount(doc.estimatedBudget))}` : ""} onChange={() => {}} editing={false} bold />
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-36 text-right">Purchase Request No.:</span>
                  <span className="inline-block w-40 border-b border-black">
                    <TextField value={doc.prNo} onChange={() => {}} editing={false} bold />
                  </span>
                </div>
              </div>
            </div>

            {/* Letter body */}
            <div className="mt-5 space-y-2 text-[11px] leading-relaxed">
              <p>Sir/Madam:</p>
              <div className="pl-6">
                <p>
                  Please quote us your government price/s for the item/s listed below which will be opened on{" "}
                  <span className="inline-block w-40 border-b border-black">
                    <TextField value={doc.openingDate} onChange={(v) => set("openingDate", v)} editing={editing} placeholder="date" />
                  </span>
                </p>
                <p className="mt-1">
                  May we have your quotation on or before the scheduled opening of bids together with the following documents, viz:
                </p>
                <ol className="mt-1 list-inside space-y-0.5 pl-4">
                  <li>1. Valid PhilGeps Registration;</li>
                  <li>2. Valid Mayor's / Business Permit, and</li>
                  <li>3. Tax Clearance Certificate</li>
                </ol>
                <p className="mt-1">Thank you.</p>
              </div>
            </div>

            {/* Signatory */}
            <div className="mt-4 text-right text-[11px]">
              <p>Very truly yours,</p>
              <div className="mt-5">
                <div className="inline-block text-left">
                  <p className="font-bold">
                    <TextField value={doc.bacChairman} onChange={(v) => set("bacChairman", v)} editing={editing} bold />
                  </p>
                  <p className="italic text-[10px]">
                    <TextField value={doc.bacChairmanTitle} onChange={(v) => set("bacChairmanTitle", v)} editing={editing} className="text-[10px] italic" />
                  </p>
                </div>
              </div>
            </div>

            {/* Table intro */}
            <p className="mt-5 text-[10px]">This office is in the market for the following:</p>

            {/* Items table */}
            <table className="mt-2 w-full border-collapse border border-black text-[10px]">
              <thead>
                <tr className="bg-gray-50 font-bold">
                  <th className="w-[6%] border border-black px-1 py-1.5 text-center">Item<br/>No.</th>
                  <th className="w-[6%] border border-black px-1 py-1.5 text-center">QTY</th>
                  <th className="w-[8%] border border-black px-1 py-1.5 text-center">UNIT</th>
                  <th className="w-[30%] border border-black px-1 py-1.5 text-center">ITEM DESCRIPTION</th>
                  <th className="w-[10%] border border-black px-1 py-1.5 text-center">UNIT ABC</th>
                  <th className="w-[10%] border border-black px-1 py-1.5 text-center">TOTAL ABC</th>
                  <th className="w-[10%] border border-black px-1 py-1.5 text-center">UNIT PRICE</th>
                  <th className="w-[10%] border border-black px-1 py-1.5 text-center">TOTAL</th>
                </tr>
              </thead>
              <tbody>
                {doc.items.map((item) => (
                  <tr key={item.id} className="group align-top">
                    <td className="border border-black px-1 py-1 text-center font-bold">{item.itemNo}</td>
                    <td className="border border-black px-1 py-1 text-center">
                      <TextField value={item.qty} onChange={(v) => setItem(item.id, { qty: v })} editing={editing} align="center" />
                    </td>
                    <td className="border border-black px-1 py-1 text-center">
                      <TextField value={item.unit} onChange={(v) => setItem(item.id, { unit: v })} editing={editing} align="center" />
                    </td>
                    <td className="relative border border-black px-1 py-1">
                      {editing && (
                        <button
                          type="button"
                          onClick={() => removeItem(item.id)}
                          title="Remove item"
                          className="no-print absolute -left-5 top-1 text-red-400 opacity-0 hover:text-red-600 group-hover:opacity-100"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      )}
                      <AutoTextarea value={item.description} onChange={(v) => setItem(item.id, { description: v })} editing={editing} />
                    </td>
                    <td className="border border-black px-1 py-1 text-right tabular-nums">
                      <AmountInput value={item.unitAbc} onChange={(v) => setItem(item.id, { unitAbc: v })} editing={editing} />
                    </td>
                    <td className="border border-black px-1 py-1 text-right tabular-nums">
                      <AmountInput value={item.totalAbc} onChange={(v) => setItem(item.id, { totalAbc: v })} editing={editing} />
                    </td>
                    <td className="border border-black px-1 py-1 text-right tabular-nums">
                      <AmountInput value={item.unitPrice} onChange={(v) => setItem(item.id, { unitPrice: v })} editing={editing} />
                    </td>
                    <td className="border border-black px-1 py-1 text-right tabular-nums">
                      <AmountInput value={item.total} onChange={(v) => setItem(item.id, { total: v })} editing={editing} />
                    </td>
                  </tr>
                ))}

                {/* Empty rows for spacing if few items */}
                {doc.items.length < 10 &&
                  Array.from({ length: Math.max(0, 3 - doc.items.length) }).map((_, i) => (
                    <tr key={`empty-${i}`}>
                      <td className="border border-black px-1 py-3">&nbsp;</td>
                      <td className="border border-black px-1 py-3" />
                      <td className="border border-black px-1 py-3" />
                      <td className="border border-black px-1 py-3" />
                      <td className="border border-black px-1 py-3" />
                      <td className="border border-black px-1 py-3" />
                      <td className="border border-black px-1 py-3" />
                      <td className="border border-black px-1 py-3" />
                    </tr>
                  ))}
              </tbody>
            </table>

            {/* Add item button */}
            {editing && (
              <div className="no-print mt-2" style={{ fontFamily: "var(--font-sans)" }}>
                <Button variant="outline" size="sm" onClick={addItem} className="h-7 gap-1.5 border-border">
                  <Plus className="h-3.5 w-3.5" /> Add Item Row
                </Button>
              </div>
            )}

            {/* Notes */}
            <div className="mt-3 text-[10px]">
              <p>-FOB DOST- Caraga CSU Campus, Ampayon</p>
              <p>-VAT Inclusive</p>
            </div>

            {/* Purpose & Fund Source */}
            <div className="mt-4 border border-black p-2 text-[11px]">
              <p><strong>Purpose:</strong></p>
              <div className="mt-0.5">
                <AutoTextarea value={doc.purpose} onChange={(v) => set("purpose", v)} editing={editing} />
              </div>
              <p className="mt-2">
                <strong>Fund Source:</strong>{" "}
                <TextField value={doc.fundSource} onChange={(v) => set("fundSource", v)} editing={editing} className="inline" />
              </p>
            </div>

            {/* Supplier section */}
            <div className="mt-6 flex gap-8">
              {/* Left: Procurement/BAC */}
              <div className="flex-1 space-y-4 text-[11px]">
                <div>
                  <p className="font-bold">Procurement Unit/Canvasser</p>
                  <div className="mt-3 border-b border-black">
                    <TextField value={doc.canvasser} onChange={(v) => set("canvasser", v)} editing={editing} placeholder="Name" />
                  </div>
                </div>
                <div>
                  <p className="font-bold">BAC Action:</p>
                  <div className="mt-1 border-b border-black">
                    <TextField value={doc.bacAction} onChange={(v) => set("bacAction", v)} editing={editing} />
                  </div>
                </div>
              </div>

              {/* Right: Supplier info */}
              <div className="flex-1 space-y-1 text-[11px]">
                <p className="font-bold text-right">Quotation Submitted by:</p>
                <div className="mt-1 space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="w-48 text-right text-[10px]">Name of Company/Establishment:</span>
                    <span className="flex-1 border-b border-black">
                      <TextField value={doc.supplierName} onChange={(v) => set("supplierName", v)} editing={editing} />
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-48 text-right text-[10px]">Address:</span>
                    <span className="flex-1 border-b border-black">
                      <TextField value={doc.supplierAddress} onChange={(v) => set("supplierAddress", v)} editing={editing} />
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-48 text-right text-[10px]">By:</span>
                    <span className="flex-1 border-b border-black">
                      <TextField value={doc.supplierBy} onChange={(v) => set("supplierBy", v)} editing={editing} />
                    </span>
                  </div>
                  <p className="text-right text-[9px] italic text-gray-500">(Printed Name and Signature)</p>
                  <div className="flex items-center gap-2">
                    <span className="w-48 text-right text-[10px]">Date:</span>
                    <span className="flex-1 border-b border-black">
                      <TextField value="" onChange={() => {}} editing={false} />
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-48 text-right text-[10px]">Contact No.:</span>
                    <span className="flex-1 border-b border-black">
                      <TextField value={doc.supplierContactNo} onChange={(v) => set("supplierContactNo", v)} editing={editing} />
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-48 text-right text-[10px]">TIN No.:</span>
                    <span className="flex-1 border-b border-black">
                      <TextField value={doc.supplierTin} onChange={(v) => set("supplierTin", v)} editing={editing} />
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {editing && (
            <p className="no-print mx-auto mt-3 max-w-xl text-center text-xs text-muted-foreground">
              {sourcePr
                ? "Items are auto-populated from the Purchase Request. Edit fields as needed, then switch to "
                : "Edit fields as needed, then switch to "}
              <span className="font-semibold text-foreground">Preview</span> for the clean, printable version.
            </p>
          )}
          {readOnlyLoaded && existingRfq && (
            <p className="no-print mx-auto mt-3 max-w-xl text-center text-xs text-muted-foreground">
              This RFQ is <span className="font-semibold text-foreground">{existingRfq.status}</span> and can no longer be edited.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
