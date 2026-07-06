import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ArrowLeft, Eye, FileSpreadsheet, Loader2, Pencil, Plus, Printer, Save, Send, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { exportPurchaseRequestExcel } from "@/lib/pr-excel";
import {
  apiCreatePurchaseRequest,
  apiGetPurchaseRequest,
  apiSubmitPurchaseRequest,
  apiUpdatePurchaseRequest,
  type PurchaseRequestCreatePayload,
} from "@/lib/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/purchase-requests/new")({
  validateSearch: (search: Record<string, unknown>): { edit?: string } => ({
    edit: typeof search.edit === "string" ? search.edit : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Create Purchase Request — DOST Caraga" },
      { name: "description", content: "Fill out the official DOST Purchase Request form and preview it before submitting." },
    ],
  }),
  component: NewPR,
});

const SERIF = '"Times New Roman", Times, serif';

const OFFICES = [
  { code: "RO", name: "Regional Office" },
  { code: "PMD", name: "Planning & Management Division" },
  { code: "STSD", name: "S&T Services Division" },
  { code: "FAD", name: "Finance & Admin" },
  { code: "ORD", name: "Office of the Director" },
  { code: "ICTU", name: "ICTU" },
];
const FUND_SOURCES = ["GAA 2026 - MOOE", "Trust Fund - SETUP"];
const MODES = ["Shopping", "Small Value Procurement", "Public Bidding", "Negotiated Procurement"];

type FormItem = { id: string; stockNo: string; unit: string; description: string; qty: string; unitCost: string };

const parseNum = (v: string) => {
  const n = Number(String(v).replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : 0;
};
const money = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function newItem(): FormItem {
  return { id: String(Date.now() + Math.random()), stockNo: "", unit: "", description: "", qty: "", unitCost: "" };
}

/* ---- Inline field primitives: render an input while editing, plain text in preview ---- */

type Align = "left" | "center" | "right";
const alignClass: Record<Align, string> = { left: "text-left", center: "text-center", right: "text-right" };

function TextField({
  value,
  onChange,
  editing,
  align = "left",
  bold = false,
  italic = false,
  placeholder,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  editing: boolean;
  align?: Align;
  bold?: boolean;
  italic?: boolean;
  placeholder?: string;
  className?: string;
}) {
  const shared = cn(
    "w-full bg-transparent px-1 py-0.5 leading-snug",
    alignClass[align],
    bold && "font-bold",
    italic && "italic",
    className,
  );
  if (!editing) {
    return <div className={cn(shared, "min-h-[1.4em] whitespace-pre-wrap break-words")}>{value || " "}</div>;
  }
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={cn(
        shared,
        "rounded-sm outline-none placeholder:italic placeholder:text-black/30 hover:bg-amber-50 focus:bg-amber-100 print:hover:bg-transparent",
      )}
    />
  );
}

function NumField({
  value,
  onChange,
  editing,
  align = "right",
  format = false,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  editing: boolean;
  align?: Align;
  format?: boolean;
  placeholder?: string;
}) {
  const shared = cn("w-full bg-transparent px-1 py-0.5 leading-snug tabular-nums", alignClass[align]);
  if (!editing) {
    return (
      <div className={cn(shared, "min-h-[1.4em]")}>{value === "" ? " " : format ? money(parseNum(value)) : value}</div>
    );
  }
  return (
    <input
      inputMode="decimal"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={cn(
        shared,
        "rounded-sm outline-none placeholder:text-black/30 hover:bg-amber-50 focus:bg-amber-100 print:hover:bg-transparent",
      )}
    />
  );
}

function AutoTextarea({
  value,
  onChange,
  editing,
  bold = false,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  editing: boolean;
  bold?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value, editing]);

  const shared = cn("w-full bg-transparent px-1 py-0.5 leading-snug", bold && "font-bold", className);
  if (!editing) {
    return <div className={cn(shared, "min-h-[1.4em] whitespace-pre-wrap break-words")}>{value || " "}</div>;
  }
  return (
    <textarea
      ref={ref}
      rows={1}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        shared,
        "resize-none overflow-hidden rounded-sm outline-none hover:bg-amber-50 focus:bg-amber-100 print:hover:bg-transparent",
      )}
    />
  );
}

function BlendSelect({
  value,
  onChange,
  editing,
  options,
  align = "left",
  render,
}: {
  value: string;
  onChange: (v: string) => void;
  editing: boolean;
  options: { value: string; label: string }[];
  align?: Align;
  render?: (v: string) => string;
}) {
  if (!editing) {
    return <div className={cn("min-h-[1.4em] px-1 py-0.5 leading-snug", alignClass[align])}>{render ? render(value) : value || " "}</div>;
  }
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        "w-full cursor-pointer bg-transparent px-1 py-0.5 leading-snug outline-none hover:bg-amber-50 focus:bg-amber-100",
        alignClass[align],
      )}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

/* ---------------------------------- Page ---------------------------------- */

function NewPR() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { edit: editId } = Route.useSearch();
  const isEditing = Boolean(editId);
  const today = new Date().toISOString().slice(0, 10);

  const { data: existing } = useQuery({
    queryKey: ["purchase-request", editId],
    queryFn: () => apiGetPurchaseRequest(editId!),
    enabled: isEditing,
  });

  const [mode, setMode] = useState<"edit" | "preview">("edit");
  const editing = mode === "edit";

  const [entityName, setEntityName] = useState("DEPARTMENT OF SCIENCE AND TECHNOLOGY - CARAGA");
  const [fundCluster, setFundCluster] = useState("01");
  const [office, setOffice] = useState("RO");
  const [prNo, setPrNo] = useState("");
  const [date, setDate] = useState(today);
  const [rcc, setRcc] = useState("");
  const [fundSource, setFundSource] = useState(FUND_SOURCES[0]);
  const [modeOfProcurement, setModeOfProcurement] = useState(MODES[0]);
  const [purpose, setPurpose] = useState("Subscription to productivity tools for day-to-day use of PSTOs.");

  const [items, setItems] = useState<FormItem[]>(() => [
    {
      id: "seed-1",
      stockNo: "",
      unit: "License",
      description:
        "Office Productivity Tool\nTechnical Specifications:\nFamily license (6 users per license; suitable for non-commercial user)\n1-year subscription per license\nCompatible with Windows 11 or later, macOS, and other standard operating systems\nVAT inclusive",
      qty: "4",
      unitCost: "8500",
    },
    newItem(),
    newItem(),
  ]);

  const [reqName, setReqName] = useState("JENIFER T. VILLAPLAZA");
  const [reqDesig, setReqDesig] = useState("SRS II");
  const [recName, setRecName] = useState("IMELDA S. MEZO");
  const [recDesig, setRecDesig] = useState("ARD-FAS");
  const [appName, setAppName] = useState("ENGR. NOEL M. AJOC");
  const [appDesig, setAppDesig] = useState("Regional Director");

  const [action, setAction] = useState<"draft" | "submit" | null>(null);

  // Prefill the form once when editing an existing draft/returned PR.
  const prefilled = useRef(false);
  useEffect(() => {
    if (!existing || prefilled.current) return;
    prefilled.current = true;
    setOffice(OFFICES.find((o) => o.name === existing.office)?.code ?? office);
    setFundSource(existing.fundSource);
    setModeOfProcurement(existing.modeOfProcurement);
    setPurpose(existing.purpose);
    setPrNo(existing.prNo);
    setItems(
      existing.items.length
        ? existing.items.map((it) => ({
            id: it.id,
            stockNo: "",
            unit: it.uom,
            description: it.description ? `${it.name}\n${it.description}` : it.name,
            qty: String(it.qty),
            unitCost: String(it.unitCost),
          }))
        : [newItem()],
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existing]);

  const grandTotal = items.reduce((s, it) => s + parseNum(it.qty) * parseNum(it.unitCost), 0);

  const mutation = useMutation({
    mutationFn: async ({ payload, submit }: { payload: PurchaseRequestCreatePayload; submit: boolean }) => {
      if (editId) {
        const updated = await apiUpdatePurchaseRequest(editId, payload);
        return submit ? apiSubmitPurchaseRequest(editId) : updated;
      }
      return apiCreatePurchaseRequest({ ...payload, submit });
    },
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ["purchase-requests"] });
      if (editId) await queryClient.invalidateQueries({ queryKey: ["purchase-request", editId] });
      toast.success(
        result.status === "For Recommendation"
          ? "Purchase Request submitted."
          : isEditing
            ? "Purchase Request updated."
            : "Purchase Request saved as draft.",
      );
      navigate({ to: "/purchase-requests/$prId", params: { prId: result.id } });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Unable to save Purchase Request."),
    onSettled: () => setAction(null),
  });

  function updateItem(id: string, patch: Partial<FormItem>) {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }
  function addItem() {
    setItems((prev) => [...prev, newItem()]);
  }
  function removeItem(id: string) {
    setItems((prev) => (prev.length > 1 ? prev.filter((it) => it.id !== id) : prev));
  }

  function buildPayload(): PurchaseRequestCreatePayload | null {
    const mapped = items
      .map((it) => {
        const lines = it.description.split("\n").map((s) => s.trim()).filter(Boolean);
        const name = lines[0] ?? "";
        const description = lines.slice(1).join("\n");
        return { name, description, uom: it.unit.trim() || "unit", qty: parseNum(it.qty), unitCost: parseNum(it.unitCost) };
      })
      .filter((it) => it.name && it.qty > 0);

    if (mapped.length === 0) {
      toast.error("Add at least one item with a description and quantity.");
      return null;
    }
    if (!purpose.trim()) {
      toast.error("Purpose is required.");
      return null;
    }
    return { office, fundSource, modeOfProcurement, purpose: purpose.trim(), items: mapped };
  }

  function saveDraft() {
    const payload = buildPayload();
    if (!payload) return;
    setAction("draft");
    mutation.mutate({ payload, submit: false });
  }
  function submitRequest() {
    const payload = buildPayload();
    if (!payload) return;
    setAction("submit");
    mutation.mutate({ payload, submit: true });
  }

  function exportExcel() {
    const rows = items
      .map((it) => ({
        stockNo: it.stockNo,
        unit: it.unit,
        description: it.description,
        qty: parseNum(it.qty),
        unitCost: parseNum(it.unitCost),
      }))
      .filter((it) => it.description.trim());
    if (rows.length === 0) {
      toast.error("Add at least one item before exporting.");
      return;
    }
    exportPurchaseRequestExcel(
      {
        entityName,
        fundCluster,
        officeName,
        prNo,
        date,
        rcc,
        fundSource,
        purpose,
        items: rows,
        requestedByName: reqName,
        requestedByDesignation: reqDesig,
        recommendingName: recName,
        recommendingDesignation: recDesig,
        approvedByName: appName,
        approvedByDesignation: appDesig,
      },
      prNo || "Purchase-Request",
    ).catch(() => toast.error("Unable to export to Excel."));
  }

  const officeName = OFFICES.find((o) => o.code === office)?.name ?? office;

  const cell = "border border-black align-top";

  return (
    <div className="min-h-full bg-background">
      {/* Toolbar */}
      <div className="no-print sticky top-0 z-10 border-b border-border bg-card/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-2 px-3 py-3 sm:px-6">
          <Button variant="ghost" size="sm" asChild className="gap-1.5 text-muted-foreground">
            <Link to="/purchase-requests">
              <ArrowLeft className="h-4 w-4" /> Back
            </Link>
          </Button>

          {isEditing && (
            <span className="hidden rounded-md bg-secondary px-2 py-1 text-xs font-semibold text-secondary-foreground sm:inline">
              Editing {prNo || "draft"}
            </span>
          )}

          <div className="ml-1 flex rounded-lg border border-border bg-background p-0.5">
            <button
              type="button"
              onClick={() => setMode("edit")}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                editing ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Pencil className="h-3.5 w-3.5" /> Edit
            </button>
            <button
              type="button"
              onClick={() => setMode("preview")}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                !editing ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Eye className="h-3.5 w-3.5" /> Preview
            </button>
          </div>

          <div className="hidden items-center gap-2 sm:flex">
            <span className="label-eyebrow">Mode of Procurement</span>
            <select
              value={modeOfProcurement}
              onChange={(e) => setModeOfProcurement(e.target.value)}
              className="h-9 rounded-md border border-border bg-background px-2 text-sm"
            >
              {MODES.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <Button variant="outline" size="sm" className="gap-1.5 border-border" onClick={exportExcel}>
              <FileSpreadsheet className="h-4 w-4" /> Export Excel
            </Button>
            {!editing && (
              <Button variant="outline" size="sm" className="gap-1.5 border-border" onClick={() => window.print()}>
                <Printer className="h-4 w-4" /> Print
              </Button>
            )}
            <Button variant="outline" size="sm" className="gap-1.5 border-border" onClick={saveDraft} disabled={mutation.isPending}>
              {action === "draft" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {isEditing ? "Save Changes" : "Save Draft"}
            </Button>
            <Button size="sm" className="gap-1.5" onClick={submitRequest} disabled={mutation.isPending}>
              {action === "submit" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Submit
            </Button>
          </div>
        </div>
      </div>

      {/* Document */}
      <div className="w-full overflow-x-auto px-3 py-6 sm:px-6 print:overflow-visible print:p-0">
        <div className="pr-print-root mx-auto w-[816px] max-w-full">
          <div
            className="bg-white text-[12px] text-black shadow-card ring-1 ring-black/5 print:shadow-none print:ring-0"
            style={{ fontFamily: SERIF }}
          >
            {/* Title */}
            <div className="py-2 text-center">
              <h2 className="text-[15px] font-bold uppercase tracking-wide text-black">Purchase Request</h2>
            </div>

            {/* Header block */}
            <table className="w-full border-collapse">
              <colgroup>
                <col className="w-[46%]" />
                <col className="w-[30%]" />
                <col className="w-[24%]" />
              </colgroup>
              <tbody>
                <tr>
                  <td className="align-top" colSpan={2}>
                    <div className="flex items-baseline gap-1">
                      <span className="shrink-0 pl-1 font-semibold">Entity Name:</span>
                      <div className="min-w-0 flex-1">
                        <TextField value={entityName} onChange={setEntityName} editing={editing} />
                      </div>
                    </div>
                  </td>
                  <td className="align-top" colSpan={1}>
                    <div className="flex items-baseline gap-1">
                      <span className="shrink-0 pl-1 font-semibold">Fund Cluster:</span>
                      <div className="min-w-0 flex-1">
                        <TextField value={fundCluster} onChange={setFundCluster} editing={editing} />
                      </div>
                    </div>
                  </td>
                </tr>
                <tr>
                  <td className={cell}>
                    <div className="flex items-baseline gap-1">
                      <span className="shrink-0 pl-1 font-semibold">Office/Section :</span>
                      <div className="min-w-0 flex-1">
                        <BlendSelect
                          value={office}
                          onChange={setOffice}
                          editing={editing}
                          options={OFFICES.map((o) => ({ value: o.code, label: o.name }))}
                          render={() => officeName}
                        />
                      </div>
                    </div>
                  </td>
                  <td className={cell}>
                    <div className="flex items-baseline gap-1">
                      <span className="shrink-0 pl-1 font-semibold">PR No.:</span>
                      <div className="min-w-0 flex-1">
                        <TextField value={prNo} onChange={setPrNo} editing={editing} placeholder="Auto-generated on save" />
                      </div>
                    </div>
                  </td>
                  <td className={cell} rowSpan={2}>
                    <div className="flex items-baseline gap-1">
                      <span className="shrink-0 pl-1 font-semibold">Date:</span>
                      <div className="min-w-0 flex-1">
                        {editing ? (
                          <input
                            type="date"
                            value={date}
                            onChange={(e) => setDate(e.target.value)}
                            className="w-full rounded-sm bg-transparent px-1 py-0.5 outline-none hover:bg-amber-50 focus:bg-amber-100"
                            style={{ fontFamily: SERIF }}
                          />
                        ) : (
                          <div className="min-h-[1.4em] px-1 py-0.5">{date || " "}</div>
                        )}
                      </div>
                    </div>
                  </td>
                </tr>
                <tr>
                  <td className={cell}>
                    <div className="min-h-[1.4em] px-1 py-0.5">{" "}</div>
                  </td>
                  <td className={cell}>
                    <div className="flex items-baseline gap-1">
                      <span className="shrink-0 pl-1 font-semibold">Responsibility Center Code :</span>
                      <div className="min-w-0 flex-1">
                        <TextField value={rcc} onChange={setRcc} editing={editing} />
                      </div>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>

            {/* Item table */}
            <table className="w-full table-fixed border-collapse">
              <colgroup>
                <col className="w-[13%]" />
                <col className="w-[9%]" />
                <col className="w-[44%]" />
                <col className="w-[10%]" />
                <col className="w-[12%]" />
                <col className="w-[12%]" />
              </colgroup>
              <thead>
                <tr>
                  <th className="border border-black px-1 py-1 text-center font-bold">Stock/ Property No.</th>
                  <th className="border border-black px-1 py-1 text-center font-bold">Unit</th>
                  <th className="border border-black px-1 py-1 text-center font-bold">Item Description</th>
                  <th className="border border-black px-1 py-1 text-center font-bold">Quantity</th>
                  <th className="border border-black px-1 py-1 text-center font-bold">Unit Cost</th>
                  <th className="border border-black px-1 py-1 text-center font-bold">Total Cost</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it) => (
                  <tr key={it.id}>
                    <td className={cell}>
                      <TextField value={it.stockNo} onChange={(v) => updateItem(it.id, { stockNo: v })} editing={editing} align="center" />
                    </td>
                    <td className={cell}>
                      <TextField value={it.unit} onChange={(v) => updateItem(it.id, { unit: v })} editing={editing} align="center" />
                    </td>
                    <td className={cell}>
                      <AutoTextarea value={it.description} onChange={(v) => updateItem(it.id, { description: v })} editing={editing} />
                    </td>
                    <td className={cell}>
                      <NumField value={it.qty} onChange={(v) => updateItem(it.id, { qty: v })} editing={editing} align="center" />
                    </td>
                    <td className={cell}>
                      <NumField value={it.unitCost} onChange={(v) => updateItem(it.id, { unitCost: v })} editing={editing} format />
                    </td>
                    <td className={cn(cell, "relative")}>
                      <div className="min-h-[1.4em] px-1 py-0.5 text-right tabular-nums">
                        {parseNum(it.qty) * parseNum(it.unitCost) ? money(parseNum(it.qty) * parseNum(it.unitCost)) : " "}
                      </div>
                      {editing && items.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeItem(it.id)}
                          title="Remove item"
                          className="no-print absolute right-[-1.9rem] top-1 text-red-500 hover:text-red-700"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                <tr>
                  <td className="border border-black" colSpan={4}>
                    {" "}
                  </td>
                  <td className="border border-black px-1 py-0.5 text-center font-bold">TOTAL</td>
                  <td className="border border-black px-1 py-0.5 text-right font-bold tabular-nums">
                    {grandTotal ? money(grandTotal) : " "}
                  </td>
                </tr>
              </tbody>
            </table>

            {editing && (
              <div className="no-print border-x border-b border-black bg-secondary/30 px-2 py-1.5">
                <Button variant="outline" size="sm" onClick={addItem} className="h-7 gap-1.5 border-border" style={{ fontFamily: "var(--font-sans)" }}>
                  <Plus className="h-3.5 w-3.5" /> Add Item Row
                </Button>
              </div>
            )}

            {/* Purpose */}
            <table className="w-full border-collapse">
              <tbody>
                <tr>
                  <td className="border border-black px-1 py-1 align-top">
                    <div className="flex items-baseline gap-1">
                      <span className="shrink-0 font-semibold">Purpose:</span>
                    </div>
                    <div className="mt-1 min-h-[3rem]">
                      <AutoTextarea value={purpose} onChange={setPurpose} editing={editing} />
                    </div>
                    <div className="mt-2 flex items-baseline gap-1">
                      <span className="shrink-0 font-semibold italic">Charged to:</span>
                      <div className="min-w-0 flex-1 italic">
                        <BlendSelect
                          value={fundSource}
                          onChange={setFundSource}
                          editing={editing}
                          options={FUND_SOURCES.map((f) => ({ value: f, label: f }))}
                        />
                      </div>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>

            {/* Signatures — faint guide lines on screen, only the outer box prints */}
            <div className="border-x border-b border-black">
              <table className="w-full border-collapse">
                <colgroup>
                  <col className="w-[16%]" />
                  <col className="w-[28%]" />
                  <col className="w-[28%]" />
                  <col className="w-[28%]" />
                </colgroup>
                <tbody>
                  <tr>
                    <td className="border border-black/20 print:border-transparent">&nbsp;</td>
                    <td className="border border-black/20 print:border-transparent px-1 py-0.5">Requested by:</td>
                    <td className="border border-black/20 print:border-transparent px-1 py-0.5">Recommending Approval:</td>
                    <td className="border border-black/20 print:border-transparent px-1 py-0.5">Approved by:</td>
                  </tr>
                  <tr>
                    <td className="border border-black/20 print:border-transparent px-1 py-0.5 align-top">Signature :</td>
                    <td className="h-12 border border-black/20 print:border-transparent">&nbsp;</td>
                    <td className="h-12 border border-black/20 print:border-transparent">&nbsp;</td>
                    <td className="h-12 border border-black/20 print:border-transparent">&nbsp;</td>
                  </tr>
                  <tr>
                    <td className="border border-black/20 print:border-transparent px-1 py-0.5 align-bottom">Printed Name :</td>
                    <td className="border border-black/20 print:border-transparent align-bottom">
                      <TextField value={reqName} onChange={setReqName} editing={editing} align="center" bold />
                    </td>
                    <td className="border border-black/20 print:border-transparent align-bottom">
                      <TextField value={recName} onChange={setRecName} editing={editing} align="center" bold />
                    </td>
                    <td className="border border-black/20 print:border-transparent align-bottom">
                      <TextField value={appName} onChange={setAppName} editing={editing} align="center" bold />
                    </td>
                  </tr>
                  <tr>
                    <td className="border border-black/20 print:border-transparent px-1 py-0.5 align-top">Designation :</td>
                    <td className="border border-black/20 print:border-transparent align-top">
                      <TextField value={reqDesig} onChange={setReqDesig} editing={editing} align="center" />
                    </td>
                    <td className="border border-black/20 print:border-transparent align-top">
                      <TextField value={recDesig} onChange={setRecDesig} editing={editing} align="center" />
                    </td>
                    <td className="border border-black/20 print:border-transparent align-top">
                      <TextField value={appDesig} onChange={setAppDesig} editing={editing} align="center" />
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {editing && (
            <p className="no-print mx-auto mt-3 max-w-xl text-center text-xs text-muted-foreground">
              Type directly on the form. Highlighted fields are editable — switch to{" "}
              <span className="font-semibold text-foreground">Preview</span> to see the clean, printable version.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
