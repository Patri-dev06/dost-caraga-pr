import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ArrowLeft, FileSpreadsheet, Loader2, Lock, Printer, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { DatePickerField } from "@/components/app/date-picker-field";
import { PersonPicker } from "@/components/app/person-picker";
import { useSignatories } from "@/lib/signatories";
import { formatLongDate } from "@/lib/date-format";
import { apiGetPurchaseRequest, apiCreateRfq, apiGetWorkflowSignatories, type RfqCreatePayload, type Signatory } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";
import { fmtAmount, parseAmount } from "@/lib/lib-store";
import { exportRfqExcel } from "@/lib/rfq-excel";
import type { PurchaseRequest } from "@/lib/mock-data";

export const Route = createFileRoute("/rfq/new")({
  validateSearch: (search: Record<string, unknown>): { pr?: string } => ({
    pr: typeof search.pr === "string" ? search.pr : undefined,
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
  align = "left",
  bold,
  placeholder,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  align?: Align;
  bold?: boolean;
  placeholder?: string;
  className?: string;
}) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={cn(
        "w-full rounded-sm bg-transparent px-0.5 leading-snug outline-none placeholder:italic placeholder:text-black/30 hover:bg-amber-50 focus:bg-amber-100",
        alignCls[align],
        bold && "font-bold",
        className,
      )}
    />
  );
}

function AutoTextarea({ value, onChange, className }: { value: string; onChange: (v: string) => void; className?: string }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);
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

function AmountInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [focused, setFocused] = useState(false);
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
}

interface RfqFormDoc {
  quotationNo: string;
  rfqDate: string;
  placeOfDelivery: string;
  estimatedBudget: string;
  prNo: string;
  procurementCategory: string;
  openingDate: string;
  bacChairman: string;
  bacChairmanTitle: string;
  purpose: string;
  fundSource: string;
  items: RfqFormItem[];
  canvasser: string;
  bacAction: string;
}

function todayStr() {
  const d = new Date();
  return `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}/${d.getFullYear()}`;
}

function CreateRfqPage() {
  const navigate = useNavigate();
  const { pr: prId } = Route.useSearch();
  const [sourcePr, setSourcePr] = useState<PurchaseRequest | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(!!prId);
  const loaded = useRef(false);

  const [doc, setDoc] = useState<RfqFormDoc>({
    quotationNo: "",
    rfqDate: todayStr(),
    placeOfDelivery: "BUTUAN CITY",
    estimatedBudget: "",
    prNo: "",
    procurementCategory: "Goods",
    openingDate: "",
    bacChairman: "", // filled in from the Settings-designated BAC Chairman once it loads
    bacChairmanTitle: "Chairman, Bids & Awards Committee",
    purpose: "",
    fundSource: "",
    items: [],
    canvasser: "",
    bacAction: "",
  });

  useEffect(() => {
    if (loaded.current || !prId) {
      setLoading(false);
      return;
    }
    loaded.current = true;

    (async () => {
      try {
        const pr = await apiGetPurchaseRequest(prId);
        setSourcePr(pr);

        const items: RfqFormItem[] = pr.items.map((item, i) => ({
          id: crypto.randomUUID(),
          itemNo: i + 1,
          qty: String(item.qty),
          unit: item.uom,
          description: item.description ? `${item.name}\n${item.description}` : item.name,
          unitAbc: String(item.unitCost),
          totalAbc: String(item.qty * item.unitCost),
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
      } catch {
        toast.error("Could not load Purchase Request.");
        navigate({ to: "/rfq" });
      } finally {
        setLoading(false);
      }
    })();
  }, [prId, navigate]);

  const set = <K extends keyof RfqFormDoc>(key: K, value: RfqFormDoc[K]) => setDoc((d) => ({ ...d, [key]: value }));
  // Accounts holding the BAC Chairman role, plus whoever is designated BAC Chairman in Settings —
  // so the field auto-fills from Settings even when no one has been given that role.
  const { data: bacChairmenByRole = [], isLoading: loadingChairmen } = useSignatories("BAC Chairman");
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
  const setItem = (id: string, patch: Partial<RfqFormItem>) =>
    setDoc((d) => ({ ...d, items: d.items.map((it) => (it.id === id ? { ...it, ...patch } : it)) }));

  function buildPayload(): RfqCreatePayload {
    return {
      purchase_request_id: prId as string,
      procurement_category: doc.procurementCategory,
      quotation_no: doc.quotationNo,
      rfq_date: doc.rfqDate,
      opening_date: doc.openingDate,
      place_of_delivery: doc.placeOfDelivery,
      estimated_budget: parseAmount(doc.estimatedBudget),
      bac_chairman: doc.bacChairman,
      bac_chairman_title: doc.bacChairmanTitle,
      purpose: doc.purpose,
      fund_source_snapshot: doc.fundSource,
      canvasser: doc.canvasser,
      bac_action: doc.bacAction,
      items: doc.items.map((it) => ({
        item_no: it.itemNo,
        description: it.description,
        uom: it.unit,
        quantity: Number(it.qty) || 0,
        unit_abc: parseAmount(it.unitAbc),
        total_abc: parseAmount(it.totalAbc),
      })),
    };
  }

  async function handleSave() {
    if (!prId) return;
    if (doc.items.length === 0) {
      toast.error("This Purchase Request has no items to canvass.");
      return;
    }

    setSaving(true);
    try {
      const rfq = await apiCreateRfq(buildPayload());
      toast.success("RFQ created. Next: complete the BAC signing chain before canvassing suppliers.");
      navigate({ to: "/rfq/$rfqId", params: { rfqId: rfq.id } });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to save RFQ.");
    } finally {
      setSaving(false);
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
        openingDate: formatLongDate(doc.openingDate),
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
          unitPrice: "",
          total: "",
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
        <span className="ml-2 text-sm text-muted-foreground">Loading Purchase Request…</span>
      </div>
    );
  }

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
            New RFQ
          </span>

          <div className="ml-2 flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground">Category:</span>
            <Select value={doc.procurementCategory} onValueChange={(v) => set("procurementCategory", v)}>
              <SelectTrigger className="h-8 w-[140px] border-border text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Goods">Goods</SelectItem>
                <SelectItem value="Equipment">Equipment</SelectItem>
                <SelectItem value="Venue" disabled>Venue (not yet supported)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <Button variant="outline" size="sm" className="gap-1.5 border-border" onClick={handleExportExcel}>
              <FileSpreadsheet className="h-4 w-4" /> Export Excel
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5 border-border" onClick={() => window.print()} title="Print the RFQ, or save it as a PDF from the print dialog">
              <Printer className="h-4 w-4" /> Print
            </Button>
            <Button size="sm" className="gap-1.5" onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save RFQ
            </Button>
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
                    <TextField value={doc.quotationNo} onChange={(v) => set("quotationNo", v)} bold />
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-36 text-right">RFQ Date:</span>
                  <span className="inline-block w-40 border-b border-black">
                    <TextField value={doc.rfqDate} onChange={(v) => set("rfqDate", v)} bold />
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-36 text-right">Place of Delivery:</span>
                  <span className="inline-block w-40 border-b border-black">
                    <TextField value={doc.placeOfDelivery} onChange={(v) => set("placeOfDelivery", v)} bold />
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-36 text-right">Estimated Budget:</span>
                  <span className="inline-block w-40 border-b border-black">
                    <AmountInput value={doc.estimatedBudget} onChange={(v) => set("estimatedBudget", v)} />
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-36 text-right">Purchase Request No.:</span>
                  <span className="inline-block w-40 border-b border-black">
                    <TextField value={doc.prNo} onChange={() => {}} bold />
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
                    <DatePickerField variant="inline" value={doc.openingDate} onChange={(v) => set("openingDate", v)} placeholder="pick a date" notBeforeToday />
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
                    <PersonPicker
                      variant="inline"
                      value={doc.bacChairman}
                      options={bacChairmen}
                      loading={loadingChairmen}
                      onPick={(name, person) => {
                        set("bacChairman", name);
                        if (person?.position) set("bacChairmanTitle", person.position);
                      }}
                      autoPickSole
                      placeholder="Type the BAC Chairman's name…"
                      emptyText="No BAC Chairman is designated. A Superadmin can set one in Settings."
                      className="h-auto justify-start text-[11px] font-bold uppercase"
                    />
                  </p>
                  <p className="italic text-[10px]">
                    <TextField value={doc.bacChairmanTitle} onChange={(v) => set("bacChairmanTitle", v)} className="text-[10px] italic" />
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
                  <th className="w-[8%] border border-black px-1 py-1.5 text-center">Item<br/>No.</th>
                  <th className="w-[8%] border border-black px-1 py-1.5 text-center">QTY</th>
                  <th className="w-[10%] border border-black px-1 py-1.5 text-center">UNIT</th>
                  <th className="w-[44%] border border-black px-1 py-1.5 text-center">ITEM DESCRIPTION</th>
                  <th className="w-[15%] border border-black px-1 py-1.5 text-center">UNIT ABC</th>
                  <th className="w-[15%] border border-black px-1 py-1.5 text-center">TOTAL ABC</th>
                </tr>
              </thead>
              <tbody>
                {doc.items.map((item) => (
                  <tr key={item.id} className="group align-top">
                    <td className="border border-black px-1 py-1 text-center font-bold">{item.itemNo}</td>
                    {/* Quantity, unit and ABC are the approved PR's; only the description (specs) can be worded. */}
                    <td className="border border-black px-1 py-1 text-center">{item.qty}</td>
                    <td className="border border-black px-1 py-1 text-center">{item.unit}</td>
                    <td className="border border-black px-1 py-1">
                      <AutoTextarea value={item.description} onChange={(v) => setItem(item.id, { description: v })} />
                    </td>
                    <td className="border border-black px-1 py-1 text-right tabular-nums">{fmtAmount(parseAmount(item.unitAbc))}</td>
                    <td className="border border-black px-1 py-1 text-right tabular-nums">{fmtAmount(parseAmount(item.totalAbc))}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <p className="no-print mt-1.5 flex items-center gap-1 text-[10px] text-muted-foreground" style={{ fontFamily: "var(--font-sans)" }}>
              <Lock className="h-3 w-3" /> Items, quantities and ABC come from the approved Purchase Request and cannot be added or changed here.
            </p>

            {/* Notes */}
            <div className="mt-3 text-[10px]">
              <p>-FOB DOST- Caraga CSU Campus, Ampayon</p>
              <p>-VAT Inclusive</p>
            </div>

            {/* Purpose & Fund Source */}
            <div className="mt-4 border border-black p-2 text-[11px]">
              <p><strong>Purpose:</strong></p>
              <div className="mt-0.5">
                <AutoTextarea value={doc.purpose} onChange={(v) => set("purpose", v)} />
              </div>
              <p className="mt-2">
                <strong>Fund Source:</strong>{" "}
                <TextField value={doc.fundSource} onChange={(v) => set("fundSource", v)} className="inline" />
              </p>
            </div>

            <div className="mt-6 text-[11px]">
              <p className="font-bold">Procurement Unit/Canvasser</p>
              <div className="mt-3 max-w-sm border-b border-black">
                <TextField value={doc.canvasser} onChange={(v) => set("canvasser", v)} placeholder="Name" />
              </div>
            </div>
          </div>

          <p className="no-print mx-auto mt-3 max-w-xl text-center text-xs text-muted-foreground">
            {sourcePr ? "Items are auto-populated from the Purchase Request. " : ""}
            After saving, you'll sign the RFQ as BAC Chair → BAC Vice-Chair → Supply Officer, then canvass 3 suppliers.
          </p>
        </div>
      </div>
    </div>
  );
}
