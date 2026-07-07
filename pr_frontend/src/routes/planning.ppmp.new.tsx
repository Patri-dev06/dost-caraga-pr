import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Eye, Loader2, Pencil, Plus, Printer, Save, Trash2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { getLib, listLibs, libTotals, fmtAmount, parseAmount, type LibDoc } from "@/lib/lib-store";
import { savePpmp, totalPpmpBudgetForLib, type PpmpItemRow } from "@/lib/ppmp-store";

export const Route = createFileRoute("/planning/ppmp/new")({
  validateSearch: (search: Record<string, unknown>): { lib?: string } => ({
    lib: typeof search.lib === "string" ? search.lib : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Create PPMP — DOST Caraga" },
      { name: "description", content: "Create a PPMP based on the approved Line Item Budget." },
    ],
  }),
  component: CreatePpmpPage,
});

const SERIF = '"Times New Roman", Times, serif';

const PROJECT_TYPES = ["Goods", "Infrastructure", "Consulting Services"];
const PROCUREMENT_MODES = [
  "Small Value Procurement",
  "Competitive Bidding",
  "Shopping",
  "Direct Contracting",
  "Repeat Order",
  "Negotiated Procurement",
];
const PRE_PROC_OPTIONS = ["No", "Yes"];

type Align = "left" | "center" | "right";
const alignCls: Record<Align, string> = { left: "text-left", center: "text-center", right: "text-right" };

function TextField({
  value,
  onChange,
  editing,
  align = "left",
  bold,
  italic,
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
  const shared = cn("w-full bg-transparent leading-snug", alignCls[align], bold && "font-bold", italic && "italic", className);
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

function SelectField({
  value,
  onChange,
  options,
  editing,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  editing: boolean;
  className?: string;
}) {
  if (!editing) return <span className={cn("inline-block min-h-[1.2em] w-full text-center leading-snug", className)}>{value || " "}</span>;
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={cn("w-full cursor-pointer rounded-sm bg-transparent px-0.5 text-center leading-snug outline-none hover:bg-amber-50 focus:bg-amber-100", className)}
    >
      {options.map((opt) => (
        <option key={opt} value={opt}>{opt}</option>
      ))}
    </select>
  );
}

function AmountField({
  value,
  onChange,
  editing,
}: {
  value: string;
  onChange: (v: string) => void;
  editing: boolean;
}) {
  const shared = "w-full bg-transparent text-right tabular-nums leading-snug";
  if (!editing) return <span className={cn(shared, "inline-block min-h-[1.2em]")}>{value === "" ? " " : `₱${fmtAmount(parseAmount(value))}`}</span>;
  return (
    <input
      inputMode="decimal"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder="0.00"
      className={cn(shared, "rounded-sm px-0.5 outline-none placeholder:text-black/20 hover:bg-amber-50 focus:bg-amber-100")}
    />
  );
}

function AutoTextarea({
  value,
  onChange,
  editing,
  italic,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  editing: boolean;
  italic?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value, editing]);
  if (!editing) return <div className={cn("min-h-[1.2em] whitespace-pre-wrap break-words leading-snug", italic && "italic", className)}>{value || " "}</div>;
  return (
    <textarea
      ref={ref}
      rows={1}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={cn("w-full resize-none overflow-hidden rounded-sm bg-transparent px-0.5 leading-snug outline-none hover:bg-amber-50 focus:bg-amber-100", italic && "italic", className)}
    />
  );
}

interface PpmpRow {
  id: string;
  isCategory: boolean;
  categoryLabel: string;
  generalDescription: string;
  projectType: string;
  quantitySize: string;
  quantity: string;
  recommendedMode: string;
  preProcConference: string;
  procStart: string;
  procEnd: string;
  deliveryPeriod: string;
  sourceOfFunds: string;
  estimatedBudget: string;
  supportingDocs: string;
  remarks: string;
}

interface PpmpDoc {
  ppmpNo: string;
  fiscalYear: string;
  endUserUnit: string;
  documentType: string;
  preparedByName: string;
  preparedByPosition: string;
  preparedByDate: string;
  budgetOfficerName: string;
  budgetOfficerPosition: string;
  budgetCertifiedDate: string;
  rows: PpmpRow[];
}

function newRow(categoryLabel?: string): PpmpRow {
  return {
    id: crypto.randomUUID(),
    isCategory: false,
    categoryLabel: categoryLabel ?? "",
    generalDescription: "",
    projectType: "Goods",
    quantitySize: "",
    quantity: "1",
    recommendedMode: "Small Value Procurement",
    preProcConference: "No",
    procStart: "",
    procEnd: "",
    deliveryPeriod: "",
    sourceOfFunds: "",
    estimatedBudget: "",
    supportingDocs: "",
    remarks: "",
  };
}

function newCategoryRow(label: string): PpmpRow {
  return { ...newRow(), id: crypto.randomUUID(), isCategory: true, categoryLabel: label };
}

function getLibExpenseCategories(lib: LibDoc): string[] {
  const cats: string[] = [];
  for (const row of lib.rows) {
    if (row.header && row.indent <= 1 && row.label.trim()) {
      cats.push(row.label.trim());
    }
  }
  return cats;
}

function getCategorySubtotal(rows: PpmpRow[], categoryId: string): number {
  let counting = false;
  let total = 0;
  for (const r of rows) {
    if (r.id === categoryId) {
      counting = true;
      continue;
    }
    if (counting) {
      if (r.isCategory) break;
      total += parseAmount(r.estimatedBudget);
    }
  }
  return total;
}

function CreatePpmpPage() {
  const navigate = useNavigate();
  const { lib: libId } = Route.useSearch();
  const [selectedLib, setSelectedLib] = useState<LibDoc | null>(null);
  const [existingPpmpTotal, setExistingPpmpTotal] = useState(0);
  const [mode, setMode] = useState<"edit" | "preview">("edit");
  const [saving, setSaving] = useState(false);
  const loaded = useRef(false);

  const [doc, setDoc] = useState<PpmpDoc>({
    ppmpNo: "3",
    fiscalYear: "2026",
    endUserUnit: "MIS",
    documentType: "Final",
    preparedByName: "",
    preparedByPosition: "",
    preparedByDate: "",
    budgetOfficerName: "",
    budgetOfficerPosition: "",
    budgetCertifiedDate: "",
    rows: [],
  });

  useEffect(() => {
    if (loaded.current) return;
    loaded.current = true;

    let lib: LibDoc | undefined;
    if (libId) lib = getLib(libId);
    if (!lib) {
      const libs = listLibs();
      lib = libs.find((l) => l.status === "Approved");
    }

    if (!lib || lib.status !== "Approved") {
      toast.error("No approved LIB found. Please approve a LIB first.");
      navigate({ to: "/planning/ppmp" });
      return;
    }

    setSelectedLib(lib);
    setExistingPpmpTotal(totalPpmpBudgetForLib(lib.id));

    const categories = getLibExpenseCategories(lib);
    const initialRows: PpmpRow[] = [];
    for (const cat of categories) {
      initialRows.push(newCategoryRow(cat));
    }
    setDoc((d) => ({ ...d, fiscalYear: lib.fiscalYear || "2026", rows: initialRows }));
  }, [libId, navigate]);

  const editing = mode === "edit";

  const set = <K extends keyof PpmpDoc>(key: K, value: PpmpDoc[K]) => setDoc((d) => ({ ...d, [key]: value }));
  const setRow = (id: string, patch: Partial<PpmpRow>) =>
    setDoc((d) => ({ ...d, rows: d.rows.map((r) => (r.id === id ? { ...r, ...patch } : r)) }));
  const removeRow = (id: string) => setDoc((d) => ({ ...d, rows: d.rows.filter((r) => r.id !== id) }));

  const categories = doc.rows.filter((r) => r.isCategory);

  function addLineUnderCategory(categoryId: string) {
    setDoc((d) => {
      const rows = [...d.rows];
      const i = rows.findIndex((r) => r.id === categoryId);
      if (i < 0) return d;
      let insertAt = i + 1;
      for (let j = i + 1; j < rows.length; j++) {
        if (rows[j].isCategory) break;
        insertAt = j + 1;
      }
      rows.splice(insertAt, 0, newRow(rows[i].categoryLabel));
      return { ...d, rows };
    });
  }

  function addCategory() {
    setDoc((d) => ({ ...d, rows: [...d.rows, newCategoryRow("")] }));
  }

  function addLineAtEnd() {
    setDoc((d) => ({ ...d, rows: [...d.rows, newRow()] }));
  }

  const libBudgetTotal = selectedLib ? libTotals(selectedLib.rows).approved : 0;
  const ppmpTotal = useMemo(
    () => doc.rows.filter((r) => !r.isCategory).reduce((sum, r) => sum + parseAmount(r.estimatedBudget), 0),
    [doc.rows],
  );
  const totalUsed = existingPpmpTotal + ppmpTotal;
  const remaining = libBudgetTotal - totalUsed;
  const overBudget = remaining < 0;
  const usagePercent = libBudgetTotal > 0 ? Math.min(100, (totalUsed / libBudgetTotal) * 100) : 0;

  function handleSave() {
    if (!selectedLib) return;

    const dataRows = doc.rows.filter((r) => !r.isCategory);
    if (dataRows.length === 0) {
      toast.error("Add at least one PPMP line item before saving.");
      return;
    }

    const emptyItems = dataRows.filter((r) => !r.generalDescription.trim() && !r.quantitySize.trim());
    if (emptyItems.length > 0) {
      toast.error(`${emptyItems.length} row(s) have no description or item details.`);
      return;
    }

    if (overBudget) {
      toast.error(`Total PPMP usage exceeds the approved LIB (₱${fmtAmount(libBudgetTotal)}).`);
      return;
    }

    setSaving(true);
    try {
      const ppmpRows: PpmpItemRow[] = dataRows.map((r) => ({
        id: r.id,
        expense_category: r.categoryLabel,
        general_description: r.generalDescription,
        item_name: r.quantitySize.split("\n")[0] || r.generalDescription,
        project_type: r.projectType,
        quantity_size: r.quantitySize,
        quantity: parseAmount(r.quantity) || 1,
        recommended_mode: r.recommendedMode,
        pre_procurement_conference: r.preProcConference,
        procurement_start: r.procStart,
        procurement_end: r.procEnd,
        delivery_period: r.deliveryPeriod,
        source_of_funds: r.sourceOfFunds,
        estimated_budget: parseAmount(r.estimatedBudget),
        supporting_documents: r.supportingDocs,
        remarks: r.remarks,
      }));

      savePpmp({
        id: `ppmp-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        libId: selectedLib.id,
        ppmpNo: doc.ppmpNo.trim() || "1",
        fiscalYear: Number(doc.fiscalYear) || 2026,
        endUserUnit: doc.endUserUnit.trim(),
        documentType: doc.documentType as "Indicative" | "Final",
        preparedByName: doc.preparedByName.trim(),
        preparedByPosition: doc.preparedByPosition.trim(),
        preparedByDate: doc.preparedByDate,
        budgetOfficerName: doc.budgetOfficerName.trim(),
        budgetOfficerPosition: doc.budgetOfficerPosition.trim(),
        budgetCertifiedDate: doc.budgetCertifiedDate,
        rows: ppmpRows,
        totalBudget: ppmpTotal,
        createdAt: new Date().toISOString(),
      });

      toast.success("PPMP saved successfully.");
      navigate({ to: "/planning/ppmp" });
    } catch {
      toast.error("Unable to save PPMP.");
    } finally {
      setSaving(false);
    }
  }

  if (!selectedLib) return null;

  return (
    <div className="min-h-full bg-background print:bg-white">
      {/* Toolbar */}
      <div className="no-print sticky top-0 z-10 border-b border-border bg-card/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-[1400px] flex-wrap items-center gap-2 px-3 py-3 sm:px-6">
          <Button variant="ghost" size="sm" asChild className="gap-1.5 text-muted-foreground">
            <Link to="/planning/ppmp">
              <ArrowLeft className="h-4 w-4" /> Back
            </Link>
          </Button>

          <span className="hidden rounded-md bg-secondary px-2 py-1 text-xs font-semibold text-secondary-foreground sm:inline">
            New PPMP
          </span>

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

          <div className="ml-auto flex items-center gap-2">
            {mode === "preview" && (
              <Button variant="outline" size="sm" className="gap-1.5 border-border" onClick={() => window.print()}>
                <Printer className="h-4 w-4" /> Print
              </Button>
            )}
            <Button size="sm" className="gap-1.5" onClick={handleSave} disabled={saving || overBudget}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save PPMP
            </Button>
          </div>
        </div>
      </div>

      {/* Budget bar */}
      <div className="no-print border-b border-border bg-card/50">
        <div className="mx-auto flex w-full max-w-[1400px] flex-wrap items-center gap-4 px-3 py-2.5 sm:px-6">
          <div className="flex items-center gap-4 text-xs">
            <span className="text-muted-foreground">LIB: <strong className="text-navy">₱{fmtAmount(libBudgetTotal)}</strong></span>
            <span className="text-muted-foreground">This PPMP: <strong className={overBudget ? "text-destructive" : "text-navy"}>₱{fmtAmount(ppmpTotal)}</strong></span>
            <span className="text-muted-foreground">Remaining: <strong className={overBudget ? "text-destructive" : "text-success"}>₱{fmtAmount(remaining)}</strong></span>
          </div>
          <div className="ml-auto flex w-32 items-center gap-2">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-secondary">
              <div
                className={cn("h-full rounded-full transition-all", overBudget ? "bg-destructive" : usagePercent > 80 ? "bg-warning" : "bg-primary")}
                style={{ width: `${Math.min(100, usagePercent)}%` }}
              />
            </div>
            <span className="text-[10px] tabular-nums text-muted-foreground">{usagePercent.toFixed(0)}%</span>
          </div>
          {overBudget && (
            <div className="flex w-full items-center gap-1.5 text-xs text-destructive">
              <AlertTriangle className="h-3.5 w-3.5" />
              <span>Over budget by ₱{fmtAmount(Math.abs(remaining))} — reduce items to save.</span>
            </div>
          )}
        </div>
      </div>

      {/* Document */}
      <div className="w-full overflow-x-auto px-3 py-6 sm:px-6 print:overflow-visible print:p-0">
        <div className="pr-print-root mx-auto min-w-[1200px] max-w-[1400px]">
          <div
            className="bg-white px-6 py-8 text-[11px] text-black shadow-card ring-1 ring-black/5 print:shadow-none print:ring-0"
            style={{ fontFamily: SERIF }}
          >
            {/* Header */}
            <div className="text-center">
              <p className="text-[14px] font-bold">
                PROJECT PROCUREMENT MANAGEMENT PLAN (PPMP) NO.{" "}
                <TextField value={doc.ppmpNo} onChange={(v) => set("ppmpNo", v)} editing={editing} className="inline w-12 text-center" />
              </p>
              <div className="mt-2 flex items-center justify-center gap-12">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={doc.documentType === "Indicative"} onChange={() => set("documentType", "Indicative")} disabled={!editing} className="h-3.5 w-3.5" />
                  <span className="text-[12px] font-semibold">INDICATIVE</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={doc.documentType === "Final"} onChange={() => set("documentType", "Final")} disabled={!editing} className="h-3.5 w-3.5" />
                  <span className="text-[12px] font-semibold">FINAL</span>
                </label>
              </div>
            </div>

            {/* Meta fields */}
            <div className="mt-5 space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="shrink-0 font-bold">Fiscal Year :</span>
                <TextField value={doc.fiscalYear} onChange={(v) => set("fiscalYear", v)} editing={editing} className="w-24" bold />
              </div>
              <div className="flex items-center gap-2">
                <span className="shrink-0 font-bold">End-User or Implementing Unit :</span>
                <TextField value={doc.endUserUnit} onChange={(v) => set("endUserUnit", v)} editing={editing} className="w-48" bold />
              </div>
            </div>

            {/* Table */}
            <table className="mt-5 w-full border-collapse border border-black text-[9.5px]">
              <thead>
                {/* Group headers */}
                <tr className="bg-blue-50/80">
                  <th colSpan={5} className="border border-black px-1 py-1.5 text-center text-[10px] font-bold">PROCUREMENT PROJECT DETAILS</th>
                  <th colSpan={3} className="border border-black px-1 py-1.5 text-center text-[10px] font-bold">PROJECTED TIMELINE (MM/YYYY)</th>
                  <th colSpan={2} className="border border-black px-1 py-1.5 text-center text-[10px] font-bold">FUNDING DETAILS</th>
                  <th rowSpan={2} className="w-[6%] border border-black px-1 py-1.5 text-center text-[10px] font-bold align-middle">ATTACHED SUPPORTING<br/>DOCUMENTS</th>
                  <th rowSpan={2} className="w-[6%] border border-black px-1 py-1.5 text-center text-[10px] font-bold align-middle">REMARKS</th>
                </tr>
                {/* Column sub-headers */}
                <tr className="bg-blue-50/50 text-[8.5px]">
                  <th className="w-[16%] border border-black px-1 py-1 text-center font-semibold">
                    General Description and Objective of the Project to be Procured
                  </th>
                  <th className="w-[7%] border border-black px-1 py-1 text-center font-semibold">
                    Type of the Project to be Procured<br/>(whether Goods, Infrastructure and Consulting Services)
                  </th>
                  <th className="w-[13%] border border-black px-1 py-1 text-center font-semibold">
                    Quantity and Size of the Project to be Procured
                  </th>
                  <th className="w-[10%] border border-black px-1 py-1 text-center font-semibold">
                    Recommended Mode of Procurement
                  </th>
                  <th className="w-[6%] border border-black px-1 py-1 text-center font-semibold">
                    Pre-Procurement Conference, if applicable (Yes/No)
                  </th>
                  <th className="w-[6%] border border-black px-1 py-1 text-center font-semibold">
                    Start of Procurement Activity
                  </th>
                  <th className="w-[6%] border border-black px-1 py-1 text-center font-semibold">
                    End of Procurement Activity
                  </th>
                  <th className="w-[7%] border border-black px-1 py-1 text-center font-semibold">
                    Expected Delivery/ Implementation Period
                  </th>
                  <th className="w-[9%] border border-black px-1 py-1 text-center font-semibold">
                    Source of Funds
                  </th>
                  <th className="w-[8%] border border-black px-1 py-1 text-center font-semibold">
                    Estimated Budget / Authorized Budgetary Allocation (PhP)
                  </th>
                </tr>
                {/* Column numbers */}
                <tr className="text-[8px] text-gray-500">
                  <th className="border border-black px-1 py-0.5 text-center">Column 1</th>
                  <th className="border border-black px-1 py-0.5 text-center">Column 2</th>
                  <th className="border border-black px-1 py-0.5 text-center">Column 3</th>
                  <th className="border border-black px-1 py-0.5 text-center">Column 4</th>
                  <th className="border border-black px-1 py-0.5 text-center">Column 5</th>
                  <th className="border border-black px-1 py-0.5 text-center">Column 6</th>
                  <th className="border border-black px-1 py-0.5 text-center">Column 7</th>
                  <th className="border border-black px-1 py-0.5 text-center">Column 8</th>
                  <th className="border border-black px-1 py-0.5 text-center">Column 9</th>
                  <th className="border border-black px-1 py-0.5 text-center">Column 10</th>
                  <th className="border border-black px-1 py-0.5 text-center">Column 11</th>
                  <th className="border border-black px-1 py-0.5 text-center">Column 12</th>
                </tr>
              </thead>
              <tbody>
                {doc.rows.map((r, idx) => {
                  if (r.isCategory) {
                    const subtotal = getCategorySubtotal(doc.rows, r.id);
                    const nextCatIdx = doc.rows.findIndex((row, j) => j > idx && row.isCategory);
                    const hasItems = doc.rows.slice(idx + 1, nextCatIdx === -1 ? undefined : nextCatIdx).some((row) => !row.isCategory);

                    return (
                      <tr key={r.id} className="group">
                        {/* Category header row */}
                        <td colSpan={12} className="relative border border-black px-1 py-1 font-bold uppercase italic">
                          {editing && (
                            <button
                              type="button"
                              onClick={() => removeRow(r.id)}
                              title="Remove category"
                              className="no-print absolute -left-5 top-1 text-red-400 opacity-0 hover:text-red-600 group-hover:opacity-100"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          )}
                          <TextField value={r.categoryLabel} onChange={(v) => setRow(r.id, { categoryLabel: v })} editing={editing} bold placeholder="CATEGORY NAME" className="uppercase italic" />
                        </td>
                      </tr>
                    );
                  }

                  return (
                    <tr key={r.id} className="group align-top">
                      {/* Column 1: General Description */}
                      <td className="relative border border-black px-1 py-0.5">
                        {editing && (
                          <button
                            type="button"
                            onClick={() => removeRow(r.id)}
                            title="Remove row"
                            className="no-print absolute -left-5 top-1 text-red-400 opacity-0 hover:text-red-600 group-hover:opacity-100"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        )}
                        <AutoTextarea value={r.generalDescription} onChange={(v) => setRow(r.id, { generalDescription: v })} editing={editing} />
                      </td>
                      {/* Column 2: Type (Dropdown) */}
                      <td className="border border-black px-0.5 py-0.5 text-center">
                        <SelectField value={r.projectType} onChange={(v) => setRow(r.id, { projectType: v })} options={PROJECT_TYPES} editing={editing} />
                      </td>
                      {/* Column 3: Quantity and Size */}
                      <td className="border border-black px-1 py-0.5">
                        <AutoTextarea value={r.quantitySize} onChange={(v) => setRow(r.id, { quantitySize: v })} editing={editing} italic />
                      </td>
                      {/* Column 4: Recommended Mode (Dropdown) */}
                      <td className="border border-black px-0.5 py-0.5 text-center">
                        <SelectField value={r.recommendedMode} onChange={(v) => setRow(r.id, { recommendedMode: v })} options={PROCUREMENT_MODES} editing={editing} />
                      </td>
                      {/* Column 5: Pre-Proc Conference (Dropdown) */}
                      <td className="border border-black px-0.5 py-0.5 text-center">
                        <SelectField value={r.preProcConference} onChange={(v) => setRow(r.id, { preProcConference: v })} options={PRE_PROC_OPTIONS} editing={editing} />
                      </td>
                      {/* Column 6: Start */}
                      <td className="border border-black px-1 py-0.5 text-center">
                        <TextField value={r.procStart} onChange={(v) => setRow(r.id, { procStart: v })} editing={editing} align="center" placeholder="Jan-26" />
                      </td>
                      {/* Column 7: End */}
                      <td className="border border-black px-1 py-0.5 text-center">
                        <TextField value={r.procEnd} onChange={(v) => setRow(r.id, { procEnd: v })} editing={editing} align="center" placeholder="Jan-26" />
                      </td>
                      {/* Column 8: Delivery Period */}
                      <td className="border border-black px-1 py-0.5 text-center">
                        <TextField value={r.deliveryPeriod} onChange={(v) => setRow(r.id, { deliveryPeriod: v })} editing={editing} align="center" placeholder="02/2026" />
                      </td>
                      {/* Column 9: Source of Funds */}
                      <td className="border border-black px-1 py-0.5">
                        <AutoTextarea value={r.sourceOfFunds} onChange={(v) => setRow(r.id, { sourceOfFunds: v })} editing={editing} />
                      </td>
                      {/* Column 10: Estimated Budget */}
                      <td className="border border-black px-1 py-0.5">
                        <AmountField value={r.estimatedBudget} onChange={(v) => setRow(r.id, { estimatedBudget: v })} editing={editing} />
                      </td>
                      {/* Column 11: Supporting Docs */}
                      <td className="border border-black px-1 py-0.5">
                        <TextField value={r.supportingDocs} onChange={(v) => setRow(r.id, { supportingDocs: v })} editing={editing} />
                      </td>
                      {/* Column 12: Remarks */}
                      <td className="border border-black px-1 py-0.5">
                        <TextField value={r.remarks} onChange={(v) => setRow(r.id, { remarks: v })} editing={editing} />
                      </td>
                    </tr>
                  );
                })}

                {/* Subtotal rows per category */}
                {categories.map((cat) => {
                  const subtotal = getCategorySubtotal(doc.rows, cat.id);
                  if (subtotal === 0 && !doc.rows.some((r, i) => {
                    const catIdx = doc.rows.indexOf(cat);
                    const nextCat = doc.rows.findIndex((row, j) => j > catIdx && row.isCategory);
                    return i > catIdx && (nextCat === -1 || i < nextCat) && !r.isCategory;
                  })) return null;
                  return (
                    <tr key={`subtotal-${cat.id}`} className="font-bold bg-gray-50/50">
                      <td colSpan={9} className="border border-black px-1 py-1 text-right uppercase text-[9px]">
                        SUBTOTAL {cat.categoryLabel}
                      </td>
                      <td className="border border-black px-1 py-1 text-right tabular-nums">
                        ₱{fmtAmount(subtotal)}
                      </td>
                      <td colSpan={2} className="border border-black" />
                    </tr>
                  );
                })}

                {/* Grand Total */}
                <tr className="font-bold">
                  <td colSpan={9} className="border border-black px-1 py-1.5 text-right text-[10px]">TOTAL ESTIMATED BUDGET</td>
                  <td className={cn("border border-black px-1 py-1.5 text-right tabular-nums text-[10px]", overBudget && "text-red-600")}>
                    ₱{fmtAmount(ppmpTotal)}
                  </td>
                  <td colSpan={2} className="border border-black" />
                </tr>
              </tbody>
            </table>

            {/* Add row controls */}
            {editing && (
              <div className="no-print mt-3 flex gap-2" style={{ fontFamily: "var(--font-sans)" }}>
                {categories.length > 0 ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm" className="h-7 gap-1.5 border-border">
                        <Plus className="h-3.5 w-3.5" /> Add Line
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="max-h-72 w-64 overflow-y-auto">
                      <DropdownMenuLabel>Add line under…</DropdownMenuLabel>
                      {categories.map((c) => (
                        <DropdownMenuItem key={c.id} onClick={() => addLineUnderCategory(c.id)}>
                          <span className="truncate">{c.categoryLabel || "(untitled)"}</span>
                        </DropdownMenuItem>
                      ))}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={addLineAtEnd}>At the end</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : (
                  <Button variant="outline" size="sm" onClick={addLineAtEnd} className="h-7 gap-1.5 border-border">
                    <Plus className="h-3.5 w-3.5" /> Add Line
                  </Button>
                )}
                <Button variant="outline" size="sm" onClick={addCategory} className="h-7 gap-1.5 border-border">
                  <Plus className="h-3.5 w-3.5" /> Add Category
                </Button>
              </div>
            )}

            {/* Signatories */}
            <div className="mt-10 grid grid-cols-2 gap-x-12 gap-y-8">
              <Signatory label="Prepared & Submitted by:" name={doc.preparedByName} position={doc.preparedByPosition} date={doc.preparedByDate} editing={editing} onName={(v) => set("preparedByName", v)} onPosition={(v) => set("preparedByPosition", v)} onDate={(v) => set("preparedByDate", v)} />
              <Signatory label="Certified Funds Available:" name={doc.budgetOfficerName} position={doc.budgetOfficerPosition} date={doc.budgetCertifiedDate} editing={editing} onName={(v) => set("budgetOfficerName", v)} onPosition={(v) => set("budgetOfficerPosition", v)} onDate={(v) => set("budgetCertifiedDate", v)} />
            </div>
          </div>

          {editing && (
            <p className="no-print mx-auto mt-3 max-w-xl text-center text-xs text-muted-foreground">
              Type directly on the form. Use dropdowns for Type, Mode, and Pre-Proc fields. Switch to{" "}
              <span className="font-semibold text-foreground">Preview</span> for the clean, printable version.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function Signatory({
  label,
  name,
  position,
  date,
  editing,
  onName,
  onPosition,
  onDate,
}: {
  label: string;
  name: string;
  position: string;
  date: string;
  editing: boolean;
  onName: (v: string) => void;
  onPosition: (v: string) => void;
  onDate: (v: string) => void;
}) {
  return (
    <div>
      <p className="text-[11px]">{label}</p>
      <div className="mt-8">
        <div className={cn("font-bold", editing && "border-b border-black/20")}>
          <TextField value={name} onChange={onName} editing={editing} bold placeholder="Name" />
        </div>
        <div className={cn("text-[10px]", editing && "border-b border-black/20")}>
          <TextField value={position} onChange={onPosition} editing={editing} className="text-[10px]" placeholder="Designation" />
        </div>
        <div className={cn("mt-1 text-[10px]", editing && "border-b border-black/20")}>
          <TextField value={date} onChange={onDate} editing={editing} className="text-[10px]" placeholder="Date" />
        </div>
      </div>
    </div>
  );
}
