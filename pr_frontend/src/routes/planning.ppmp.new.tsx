import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowLeft, ArrowUp, CheckCircle2, Copy, Eye, GripVertical, Loader2, Pencil, Plus, Printer, Save, Trash2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiGetSignatories, type Signatory as SignatoryOption } from "@/lib/api";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { currentLibBudgetTotal, getLib, listLibs, fmtAmount, parseAmount, type LibDoc } from "@/lib/lib-store";
import { getPpmp, savePpmp, totalPpmpBudgetForLib, type PpmpItemRow, type PpmpStatus } from "@/lib/ppmp-store";

export const Route = createFileRoute("/planning/ppmp/new")({
  validateSearch: (search: Record<string, unknown>): { lib?: string; edit?: string } => ({
    lib: typeof search.lib === "string" ? search.lib : undefined,
    edit: typeof search.edit === "string" ? search.edit : undefined,
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
const PPMP_EXCLUDED_LIB_LABELS = new Set(["Fuel Expenses", "Other Professional Services"]);
const MAX_FINAL_PPMP_REVISIONS = 5;
const BLANK_LINES_PER_CATEGORY = 2;

function monthYearOptions(fiscalYear: string): string[] {
  const year = String(Number(fiscalYear) || new Date().getFullYear());
  return ["", ...Array.from({ length: 12 }, (_, i) => `${String(i + 1).padStart(2, "0")}/${year}`)];
}

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

function MainItemField({
  value,
  onChange,
  editing,
}: {
  value: string;
  onChange: (v: string) => void;
  editing: boolean;
}) {
  const style = {
    fontWeight: 900,
    fontStyle: "italic" as const,
    WebkitTextStroke: "0.25px currentColor",
    textShadow: "0.35px 0 currentColor",
  };
  if (!editing) {
    return (
      <span className="inline-block min-h-[1.2em] w-full uppercase leading-snug" style={style}>
        {value || " "}
      </span>
    );
  }
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder="CATEGORY NAME"
      className="w-full rounded-sm bg-transparent px-0.5 uppercase leading-snug outline-none placeholder:italic placeholder:text-black/30 hover:bg-amber-50 focus:bg-amber-100"
      style={style}
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
  const formatTypedAmount = (raw: string) => {
    const cleaned = raw.replace(/[^\d.]/g, "");
    const [wholeRaw = "", decimalRaw] = cleaned.split(".");
    const whole = wholeRaw.replace(/^0+(?=\d)/, "");
    const grouped = whole === "" ? "" : Number(whole).toLocaleString("en-US");
    if (cleaned.includes(".")) return `${grouped || "0"}.${(decimalRaw ?? "").slice(0, 2)}`;
    return grouped;
  };
  return (
    <input
      inputMode="decimal"
      value={value}
      onChange={(e) => onChange(formatTypedAmount(e.target.value))}
      placeholder="0.00"
      className={cn(shared, "rounded-sm px-0.5 outline-none placeholder:text-black/20 hover:bg-amber-50 focus:bg-amber-100")}
    />
  );
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function valueToHtml(value: string): string {
  if (/<[a-z][\s\S]*>/i.test(value)) return value;
  return escapeHtml(value).replace(/\n/g, "<br>");
}

function htmlToPlainText(value: string): string {
  if (typeof document === "undefined") return value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  const div = document.createElement("div");
  div.innerHTML = valueToHtml(value);
  return div.textContent?.trim() ?? "";
}

function firstTextLine(value: string): string {
  const plain = htmlToPlainText(value);
  return plain.split(/\n|\r/)[0]?.trim() || plain;
}

function RichTextField({
  value,
  onChange,
  editing,
  italic,
}: {
  value: string;
  onChange: (v: string) => void;
  editing: boolean;
  italic?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || document.activeElement === el) return;
    el.innerHTML = valueToHtml(value);
  }, [value]);

  const applyBold = () => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    document.execCommand("bold");
    onChange(el.innerHTML);
  };

  if (!editing) {
    return (
      <div
        className={cn("min-h-[1.2em] whitespace-pre-wrap break-words leading-snug", italic && "italic")}
        dangerouslySetInnerHTML={{ __html: valueToHtml(value) || " " }}
      />
    );
  }

  return (
    <div className="group/rich relative">
      <button
        type="button"
        onMouseDown={(event) => {
          event.preventDefault();
          applyBold();
        }}
        title="Bold selected text"
        className="no-print absolute right-0 top-0 z-10 rounded-sm bg-white px-1 text-[9px] font-bold leading-4 opacity-0 shadow-sm ring-1 ring-black/10 hover:bg-amber-100 group-focus-within/rich:opacity-100 group-hover/rich:opacity-100"
      >
        B
      </button>
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        onInput={(event) => onChange(event.currentTarget.innerHTML)}
        onBlur={(event) => onChange(event.currentTarget.innerHTML)}
        onKeyDown={(event) => {
          if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "b") {
            event.preventDefault();
            applyBold();
          }
        }}
        className={cn("min-h-[1.2em] w-full rounded-sm bg-transparent px-0.5 pr-4 leading-snug outline-none hover:bg-amber-50 focus:bg-amber-100", italic && "italic")}
        dangerouslySetInnerHTML={{ __html: valueToHtml(value) }}
      />
    </div>
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
  isSubcategory: boolean;
  categoryLabel: string;
  subcategoryLabel: string;
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

function newRow(categoryLabel?: string, subcategoryLabel?: string): PpmpRow {
  return {
    id: crypto.randomUUID(),
    isCategory: false,
    isSubcategory: false,
    categoryLabel: categoryLabel ?? "",
    subcategoryLabel: subcategoryLabel ?? "",
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

function newSubcategoryRow(categoryLabel: string, subcategoryLabel: string): PpmpRow {
  return { ...newRow(categoryLabel), id: crypto.randomUUID(), isSubcategory: true, subcategoryLabel };
}

function isDataRow(row: PpmpRow): boolean {
  return !row.isCategory && !row.isSubcategory;
}

function isProcurementRow(row: PpmpRow): boolean {
  return isDataRow(row);
}

function getLibExpenseTemplateRows(lib: LibDoc): PpmpRow[] {
  const rows: PpmpRow[] = [];
  const addCategoryWithBlankLines = (label: string) => {
    rows.push(newCategoryRow(label));
    for (let i = 0; i < BLANK_LINES_PER_CATEGORY; i++) {
      rows.push(newRow(label));
    }
  };

  for (const row of lib.rows) {
    const label = row.label.trim();
    if (!label) continue;

    if (row.indent === 0) {
      addCategoryWithBlankLines(label);
      continue;
    }

    if (row.indent === 1) {
      if (PPMP_EXCLUDED_LIB_LABELS.has(label)) {
        continue;
      }
      addCategoryWithBlankLines(label);
      continue;
    }

    // LIB child lines become user-managed PPMP rows, so the template only
    // seeds main categories plus blank editable line items.
  }
  return rows;
}

function formRowsFromSavedItems(items: PpmpItemRow[]): PpmpRow[] {
  const rows: PpmpRow[] = [];
  const categoryIds = new Set<string>();
  const subcategoryKeys = new Set<string>();

  for (const item of items) {
    const [rawCategory, rawSubcategory] = item.expense_category.split(" - ");
    const category = rawCategory?.trim() || "UNCATEGORIZED";
    const subcategory = (item.expense_subcategory || rawSubcategory || "").trim();

    if (!categoryIds.has(category)) {
      rows.push(newCategoryRow(category));
      categoryIds.add(category);
    }

    if (subcategory) {
      const key = `${category}::${subcategory}`;
      if (!subcategoryKeys.has(key)) {
        const subRow = newSubcategoryRow(category, subcategory);
        subRow.generalDescription = item.general_description;
        rows.push(subRow);
        subcategoryKeys.add(key);
      }
    }

    const row = newRow(category, subcategory);
    row.id = item.id || crypto.randomUUID();
    row.generalDescription = subcategory ? "" : item.general_description;
    row.projectType = item.project_type || "Goods";
    row.quantitySize = item.quantity_size || "";
    row.quantity = String(item.quantity || 1);
    row.recommendedMode = item.recommended_mode || "Small Value Procurement";
    row.preProcConference = item.pre_procurement_conference || "No";
    row.procStart = item.procurement_start || "";
    row.procEnd = item.procurement_end || "";
    row.deliveryPeriod = item.delivery_period || "";
    row.sourceOfFunds = item.source_of_funds || "";
    row.estimatedBudget = item.estimated_budget ? String(item.estimated_budget) : "";
    row.supportingDocs = item.supporting_documents || "";
    row.remarks = item.remarks || "";
    rows.push(row);
  }

  return rows;
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
      if (isProcurementRow(r)) total += parseAmount(r.estimatedBudget);
    }
  }
  return total;
}

function getSubcategorySubtotal(rows: PpmpRow[], subcategoryId: string): number {
  let counting = false;
  let total = 0;
  for (const r of rows) {
    if (r.id === subcategoryId) {
      counting = true;
      continue;
    }
    if (counting) {
      if (r.isCategory || r.isSubcategory) break;
      total += parseAmount(r.estimatedBudget);
    }
  }
  return total;
}

function normalizeBudgetLabel(label: string): string {
  return label.trim().replace(/\s+/g, " ").toLowerCase();
}

function latestLibRowBudget(row: LibDoc["rows"][number]): number {
  const latestReprogramming = [...(row.reprogrammings ?? [])].reverse().find((rp) => rp.amount.trim() !== "");
  return parseAmount(latestReprogramming?.amount ?? row.approved);
}

function getLibBudgetLimits(lib: LibDoc): Map<string, number> {
  const limits = new Map<string, number>();
  const addLimit = (label: string, amount: number) => {
    const key = normalizeBudgetLabel(label);
    if (!key || PPMP_EXCLUDED_LIB_LABELS.has(label.trim())) return;
    limits.set(key, (limits.get(key) ?? 0) + amount);
  };

  lib.rows.forEach((row, index) => {
    const label = row.label.trim();
    if (!label) return;

    if (!row.header) {
      addLimit(label, latestLibRowBudget(row));
      return;
    }

    let total = 0;
    for (let i = index + 1; i < lib.rows.length; i++) {
      const child = lib.rows[i];
      if (child.indent <= row.indent) break;
      if (!child.header) total += latestLibRowBudget(child);
    }
    addLimit(label, total);
  });

  return limits;
}

function getPpmpBudgetOverages(rows: PpmpRow[], lib: LibDoc): { label: string; total: number; limit: number; type: "category" | "subcategory" }[] {
  const limits = getLibBudgetLimits(lib);
  const overages: { label: string; total: number; limit: number; type: "category" | "subcategory" }[] = [];

  for (const row of rows) {
    if (row.isCategory) {
      const label = row.categoryLabel.trim();
      const limit = limits.get(normalizeBudgetLabel(label));
      if (limit == null) continue;
      const total = getCategorySubtotal(rows, row.id);
      if (total > limit) overages.push({ label, total, limit, type: "category" });
    }

    if (row.isSubcategory) {
      const label = row.subcategoryLabel.trim();
      const limit = limits.get(normalizeBudgetLabel(label));
      if (limit == null) continue;
      const total = getSubcategorySubtotal(rows, row.id);
      if (total > limit) overages.push({ label, total, limit, type: "subcategory" });
    }
  }

  return overages;
}

function getPpmpBudgetOverageRowIds(rows: PpmpRow[], lib: LibDoc): Set<string> {
  const limits = getLibBudgetLimits(lib);
  const rowIds = new Set<string>();

  rows.forEach((row, index) => {
    if (!isProcurementRow(row)) return;

    const { categoryId, subcategoryId } = currentGroupIds(rows, index);
    const category = categoryId ? rows.find((r) => r.id === categoryId) : undefined;
    const subcategory = subcategoryId ? rows.find((r) => r.id === subcategoryId) : undefined;

    if (subcategory?.subcategoryLabel.trim()) {
      const limit = limits.get(normalizeBudgetLabel(subcategory.subcategoryLabel));
      if (limit != null && getSubcategorySubtotal(rows, subcategory.id) > limit) {
        rowIds.add(row.id);
        return;
      }
    }

    if (category?.categoryLabel.trim()) {
      const limit = limits.get(normalizeBudgetLabel(category.categoryLabel));
      if (limit != null && getCategorySubtotal(rows, category.id) > limit) {
        rowIds.add(row.id);
      }
    }
  });

  return rowIds;
}

function categoryHasDataRows(rows: PpmpRow[], categoryId: string): boolean {
  const catIdx = rows.findIndex((row) => row.id === categoryId);
  if (catIdx < 0) return false;
  const nextCat = rows.findIndex((row, j) => j > catIdx && row.isCategory);
  return rows.some((row, i) => i > catIdx && (nextCat === -1 || i < nextCat) && isProcurementRow(row));
}

function subcategoryHasDataRows(rows: PpmpRow[], subcategoryId: string): boolean {
  const subIdx = rows.findIndex((row) => row.id === subcategoryId);
  if (subIdx < 0) return false;
  const nextGroup = rows.findIndex((row, j) => j > subIdx && (row.isCategory || row.isSubcategory));
  return rows.some((row, i) => i > subIdx && (nextGroup === -1 || i < nextGroup) && isDataRow(row));
}

function getActiveSubcategory(rows: PpmpRow[], index: number): PpmpRow | undefined {
  let active: PpmpRow | undefined;
  for (let i = index; i >= 0; i--) {
    const row = rows[i];
    if (row.isCategory) return undefined;
    if (row.isSubcategory) {
      active = row;
      break;
    }
  }
  return active;
}

function countSubcategoryDataRows(rows: PpmpRow[], subcategoryId: string): number {
  const subIdx = rows.findIndex((row) => row.id === subcategoryId);
  if (subIdx < 0) return 0;
  let count = 0;
  for (let i = subIdx + 1; i < rows.length; i++) {
    if (rows[i].isCategory || rows[i].isSubcategory) break;
    if (isDataRow(rows[i])) count += 1;
  }
  return count;
}

function isFirstDataRowInSubcategory(rows: PpmpRow[], index: number, subcategoryId: string): boolean {
  const subIdx = rows.findIndex((row) => row.id === subcategoryId);
  if (subIdx < 0 || index <= subIdx) return false;
  for (let i = subIdx + 1; i < index; i++) {
    if (rows[i].isCategory || rows[i].isSubcategory) break;
    if (isDataRow(rows[i])) return false;
  }
  return isDataRow(rows[index]);
}

function currentContext(rows: PpmpRow[], index: number): { categoryLabel: string; subcategoryLabel: string } {
  let categoryLabel = "";
  let subcategoryLabel = "";
  for (let i = 0; i <= index; i++) {
    const row = rows[i];
    if (row.isCategory) {
      categoryLabel = row.categoryLabel;
      subcategoryLabel = "";
    } else if (row.isSubcategory) {
      subcategoryLabel = row.subcategoryLabel;
    }
  }
  return { categoryLabel, subcategoryLabel };
}

function currentGroupIds(rows: PpmpRow[], index: number): { categoryId?: string; subcategoryId?: string } {
  let categoryId: string | undefined;
  let subcategoryId: string | undefined;
  for (let i = 0; i <= index; i++) {
    const row = rows[i];
    if (row.isCategory) {
      categoryId = row.id;
      subcategoryId = undefined;
    } else if (row.isSubcategory) {
      subcategoryId = row.id;
    }
  }
  return { categoryId, subcategoryId };
}

function endsSubcategoryBlock(rows: PpmpRow[], index: number): string | undefined {
  const { subcategoryId } = currentGroupIds(rows, index);
  if (!subcategoryId || !subcategoryHasDataRows(rows, subcategoryId)) return undefined;
  const next = rows[index + 1];
  return !next || next.isCategory || next.isSubcategory ? subcategoryId : undefined;
}

function endsCategoryBlock(rows: PpmpRow[], index: number): string | undefined {
  const { categoryId } = currentGroupIds(rows, index);
  if (!categoryId) return undefined;
  const category = rows.find((row) => row.id === categoryId);
  if (!category || /^\s*[IVXLCDM]+\./i.test(category.categoryLabel)) return undefined;
  const next = rows[index + 1];
  return !next || next.isCategory ? categoryId : undefined;
}

function categoryBlockBounds(rows: PpmpRow[], categoryId: string): { start: number; end: number } | null {
  const start = rows.findIndex((row) => row.id === categoryId && row.isCategory);
  if (start < 0) return null;
  const nextCategory = rows.findIndex((row, index) => index > start && row.isCategory);
  return { start, end: nextCategory === -1 ? rows.length : nextCategory };
}

function CreatePpmpPage() {
  const navigate = useNavigate();
  const { lib: libId, edit: editId } = Route.useSearch();
  const [selectedLib, setSelectedLib] = useState<LibDoc | null>(null);
  const [existingPpmpTotal, setExistingPpmpTotal] = useState(0);
  const [workflowStatus, setWorkflowStatus] = useState<PpmpStatus>("Draft");
  const [revisionCount, setRevisionCount] = useState(0);
  const [mode, setMode] = useState<"edit" | "preview">("edit");
  const [savingAction, setSavingAction] = useState<"draft" | "submit" | "approve" | null>(null);
  const [draggedCategoryId, setDraggedCategoryId] = useState<string | null>(null);
  const [dragOverCategoryId, setDragOverCategoryId] = useState<string | null>(null);
  const loaded = useRef(false);

  // Approved accounts (status = Active), offered as signatory choices.
  const [signatories, setSignatories] = useState<SignatoryOption[]>([]);
  useEffect(() => {
    apiGetSignatories()
      .then(setSignatories)
      .catch(() => setSignatories([]));
  }, []);

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

    const existingPpmp = editId ? getPpmp(editId) : undefined;

    let lib: LibDoc | undefined;
    if (libId) lib = getLib(libId);
    if (!lib && existingPpmp?.libId) lib = getLib(existingPpmp.libId);
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
    setExistingPpmpTotal(Math.max(0, totalPpmpBudgetForLib(lib.id) - (existingPpmp?.totalBudget ?? 0)));

    if (existingPpmp) {
      setWorkflowStatus(existingPpmp.status);
      setRevisionCount(existingPpmp.revisionCount);
      if (existingPpmp.status === "Approved") setMode("preview");
      setDoc({
        ppmpNo: existingPpmp.ppmpNo,
        fiscalYear: String(existingPpmp.fiscalYear || lib.fiscalYear || "2026"),
        endUserUnit: existingPpmp.endUserUnit,
        documentType: existingPpmp.documentType,
        preparedByName: existingPpmp.preparedByName,
        preparedByPosition: existingPpmp.preparedByPosition,
        preparedByDate: existingPpmp.preparedByDate,
        budgetOfficerName: existingPpmp.budgetOfficerName,
        budgetOfficerPosition: existingPpmp.budgetOfficerPosition,
        budgetCertifiedDate: existingPpmp.budgetCertifiedDate,
        rows: Array.isArray(existingPpmp.formRows) && existingPpmp.formRows.length > 0
          ? (existingPpmp.formRows as unknown as PpmpRow[])
          : formRowsFromSavedItems(existingPpmp.rows),
      });
      return;
    }

    const initialRows = getLibExpenseTemplateRows(lib);
    setDoc((d) => ({ ...d, fiscalYear: lib.fiscalYear || "2026", rows: initialRows }));
  }, [editId, libId, navigate]);

  const approvedLocked = workflowStatus === "Approved";
  const editing = mode === "edit" && !approvedLocked;

  const set = <K extends keyof PpmpDoc>(key: K, value: PpmpDoc[K]) => setDoc((d) => ({ ...d, [key]: value }));
  const setRow = (id: string, patch: Partial<PpmpRow>) =>
    setDoc((d) => ({ ...d, rows: d.rows.map((r) => (r.id === id ? { ...r, ...patch } : r)) }));
  const removeRow = (id: string) => setDoc((d) => ({ ...d, rows: d.rows.filter((r) => r.id !== id) }));
  const duplicateRow = (id: string) =>
    setDoc((d) => {
      const index = d.rows.findIndex((row) => row.id === id);
      if (index < 0) return d;
      const copy = { ...d.rows[index], id: crypto.randomUUID() };
      const rows = [...d.rows];
      rows.splice(index + 1, 0, copy);
      return { ...d, rows };
    });
  const moveCategoryBlock = (categoryId: string, direction: "up" | "down") =>
    setDoc((d) => {
      const rows = [...d.rows];
      const bounds = categoryBlockBounds(rows, categoryId);
      if (!bounds) return d;

      if (direction === "up") {
        const previousCategoryIndex = rows.findLastIndex((row, index) => index < bounds.start && row.isCategory);
        if (previousCategoryIndex < 0) return d;
        const block = rows.splice(bounds.start, bounds.end - bounds.start);
        rows.splice(previousCategoryIndex, 0, ...block);
        return { ...d, rows };
      }

      const nextCategoryIndex = bounds.end < rows.length && rows[bounds.end]?.isCategory ? bounds.end : -1;
      if (nextCategoryIndex < 0) return d;
      const nextBounds = categoryBlockBounds(rows, rows[nextCategoryIndex].id);
      if (!nextBounds) return d;
      const block = rows.splice(bounds.start, bounds.end - bounds.start);
      const insertAt = nextBounds.end - block.length;
      rows.splice(insertAt, 0, ...block);
      return { ...d, rows };
    });
  const reorderCategoryBlock = (sourceCategoryId: string, targetCategoryId: string) =>
    setDoc((d) => {
      if (sourceCategoryId === targetCategoryId) return d;
      const rows = [...d.rows];
      const sourceBounds = categoryBlockBounds(rows, sourceCategoryId);
      const targetBounds = categoryBlockBounds(rows, targetCategoryId);
      if (!sourceBounds || !targetBounds) return d;

      const movingDown = sourceBounds.start < targetBounds.start;
      const block = rows.splice(sourceBounds.start, sourceBounds.end - sourceBounds.start);
      const adjustedTargetBounds = categoryBlockBounds(rows, targetCategoryId);
      if (!adjustedTargetBounds) return d;
      rows.splice(movingDown ? adjustedTargetBounds.end : adjustedTargetBounds.start, 0, ...block);
      return { ...d, rows };
    });

  const categories = doc.rows.filter((r) => r.isCategory);
  const subcategories = doc.rows.filter((r) => r.isSubcategory);

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
      const previousSubcategory = rows
        .slice(i + 1, insertAt)
        .reverse()
        .find((row) => row.isSubcategory);
      rows.splice(insertAt, 0, newRow(rows[i].categoryLabel, previousSubcategory?.subcategoryLabel));
      return { ...d, rows };
    });
  }

  function addSubcategoryUnderCategory(categoryId: string) {
    setDoc((d) => {
      const rows = [...d.rows];
      const i = rows.findIndex((r) => r.id === categoryId);
      if (i < 0) return d;
      let insertAt = i + 1;
      for (let j = i + 1; j < rows.length; j++) {
        if (rows[j].isCategory) break;
        insertAt = j + 1;
      }
      rows.splice(insertAt, 0, newSubcategoryRow(rows[i].categoryLabel, ""));
      return { ...d, rows };
    });
  }

  function addLineUnderSubcategory(subcategoryId: string) {
    setDoc((d) => {
      const rows = [...d.rows];
      const i = rows.findIndex((r) => r.id === subcategoryId);
      if (i < 0) return d;
      let insertAt = i + 1;
      for (let j = i + 1; j < rows.length; j++) {
        if (rows[j].isCategory || rows[j].isSubcategory) break;
        insertAt = j + 1;
      }
      const context = currentContext(rows, i);
      rows.splice(insertAt, 0, newRow(context.categoryLabel, rows[i].subcategoryLabel));
      return { ...d, rows };
    });
  }

  function addCategory() {
    setDoc((d) => ({ ...d, rows: [...d.rows, newCategoryRow("")] }));
  }

  function addLineAtEnd() {
    setDoc((d) => {
      const context = d.rows.length > 0 ? currentContext(d.rows, d.rows.length - 1) : { categoryLabel: "", subcategoryLabel: "" };
      return { ...d, rows: [...d.rows, newRow(context.categoryLabel, context.subcategoryLabel)] };
    });
  }

  const libBudgetTotal = useMemo(() => (selectedLib ? currentLibBudgetTotal(selectedLib) : 0), [selectedLib]);
  const deliveryMonthYearOptions = useMemo(() => monthYearOptions(doc.fiscalYear), [doc.fiscalYear]);
  const ppmpTotal = useMemo(
    () => doc.rows.filter(isProcurementRow).reduce((sum, r) => sum + parseAmount(r.estimatedBudget), 0),
    [doc.rows],
  );
  const budgetOverages = useMemo(() => (selectedLib ? getPpmpBudgetOverages(doc.rows, selectedLib) : []), [doc.rows, selectedLib]);
  const budgetOverageRowIds = useMemo(() => (selectedLib ? getPpmpBudgetOverageRowIds(doc.rows, selectedLib) : new Set<string>()), [doc.rows, selectedLib]);
  const hasBudgetOverages = budgetOverages.length > 0;
  const totalUsed = existingPpmpTotal + ppmpTotal;
  const remaining = libBudgetTotal - totalUsed;
  const overBudget = remaining < 0;
  const usagePercent = libBudgetTotal > 0 ? Math.min(100, (totalUsed / libBudgetTotal) * 100) : 0;

  function incrementPpmpNo(value: string): string {
    const match = value.trim().match(/^(.*?)(\d+)(\D*)$/);
    if (!match) return value.trim() ? `${value.trim()}-1` : "1";
    return `${match[1]}${Number(match[2]) + 1}${match[3]}`;
  }

  function startRevision() {
    if (doc.documentType === "Final" && revisionCount >= MAX_FINAL_PPMP_REVISIONS) {
      toast.error(`Final PPMP has reached the maximum of ${MAX_FINAL_PPMP_REVISIONS} revisions.`);
      return;
    }

    setDoc((d) => ({ ...d, ppmpNo: incrementPpmpNo(d.ppmpNo) }));
    setRevisionCount((count) => count + 1);
    setWorkflowStatus("Draft");
    setMode("edit");
    toast.success("Revision started. PPMP No. has been incremented.");
  }

  function persistPpmp(status: PpmpStatus) {
    if (!selectedLib) return;

    const dataRows = doc.rows.filter(isProcurementRow);
    if (dataRows.length === 0) {
      toast.error("Add at least one PPMP line item before saving.");
      return;
    }

    const emptyItems = dataRows.filter((r) => !r.generalDescription.trim() && !htmlToPlainText(r.quantitySize));
    if (emptyItems.length > 0) {
      toast.error(`${emptyItems.length} row(s) have no description or item details.`);
      return;
    }

    if (overBudget) {
      toast.error(`Total PPMP usage exceeds the approved LIB (₱${fmtAmount(libBudgetTotal)}).`);
      return;
    }

    if (hasBudgetOverages) {
      const overage = budgetOverages[0];
      toast.error(`${overage.label} exceeds its LIB budget: ₱${fmtAmount(overage.total)} / ₱${fmtAmount(overage.limit)}.`);
      return;
    }

    setSavingAction(status === "Draft" ? "draft" : status === "Approved" ? "approve" : "submit");
    try {
      const existingPpmp = editId ? getPpmp(editId) : undefined;
      let activeCategory = "";
      let activeSubcategory = "";
      let activeSubcategoryDescription = "";
      const ppmpRows: PpmpItemRow[] = doc.rows.flatMap((r) => {
        if (r.isCategory) {
          activeCategory = r.categoryLabel;
          activeSubcategory = "";
          activeSubcategoryDescription = "";
          return [];
        }
        if (r.isSubcategory) {
          activeSubcategory = r.subcategoryLabel;
          activeSubcategoryDescription = r.generalDescription;
          return [];
        }
        const category = activeCategory || r.categoryLabel;
        const subcategory = activeSubcategory || r.subcategoryLabel;
        const generalDescription = activeSubcategoryDescription || r.generalDescription;
        return [{
          id: r.id,
          expense_category: subcategory ? `${category} - ${subcategory}` : category,
          expense_subcategory: subcategory,
          general_description: generalDescription,
          item_name: firstTextLine(r.quantitySize) || generalDescription,
          project_type: r.projectType,
          quantity_size: r.quantitySize,
          quantity: parseAmount(r.quantity) || 1,
          recommended_mode: r.recommendedMode,
          pre_procurement_conference: r.preProcConference,
          procurement_start: r.procStart,
          procurement_end: r.procEnd,
          delivery_period: r.deliveryPeriod,
          source_of_funds: "",
          estimated_budget: parseAmount(r.estimatedBudget),
          supporting_documents: r.supportingDocs,
          remarks: r.remarks,
        }];
      });

      savePpmp({
        id: existingPpmp?.id ?? `ppmp-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        libId: selectedLib.id,
        ppmpNo: doc.ppmpNo.trim() || "1",
        status,
        revisionCount,
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
        formRows: doc.rows as unknown as Record<string, unknown>[],
        totalBudget: ppmpTotal,
        createdAt: existingPpmp?.createdAt ?? new Date().toISOString(),
      });

      setWorkflowStatus(status);
      toast.success(
        status === "Draft"
          ? "PPMP saved as draft."
          : status === "Approved"
            ? "PPMP approved."
            : "PPMP submitted to Budget Officer.",
      );
      if (status === "Approved") {
        setMode("preview");
      } else {
        navigate({ to: "/planning/ppmp" });
      }
    } catch {
      toast.error("Unable to save PPMP.");
    } finally {
      setSavingAction(null);
    }
  }

  if (!selectedLib) return null;

  const documentActionButtonClass = "h-7 gap-1.5 border border-black/10 bg-white text-slate-800 shadow-sm hover:bg-slate-50 hover:text-slate-950 dark:border-black/10 dark:bg-white dark:text-slate-800 dark:hover:bg-slate-50 dark:hover:text-slate-950";

  return (
    <div className="min-h-full bg-background print:bg-white">
      <style>{`
        @media print {
          @page {
            size: landscape;
            margin: 10mm;
          }
        }
      `}</style>
      {/* Toolbar */}
      <div className="no-print sticky top-0 z-10 border-b border-border bg-card/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-[1400px] flex-wrap items-center gap-2 px-3 py-3 sm:px-6">
          <Button variant="ghost" size="sm" asChild className="gap-1.5 text-muted-foreground">
            <Link to="/planning/ppmp">
              <ArrowLeft className="h-4 w-4" /> Back
            </Link>
          </Button>

          <span className="hidden rounded-md bg-secondary px-2 py-1 text-xs font-semibold text-secondary-foreground sm:inline">
            {editId ? `${workflowStatus}${revisionCount > 0 ? ` · Rev ${revisionCount}` : ""}` : "New PPMP"}
          </span>

          <div className="ml-1 flex rounded-lg border border-border bg-background p-0.5">
            <button
              type="button"
              onClick={() => {
                if (approvedLocked) startRevision();
                else setMode("edit");
              }}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                mode === "edit" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Pencil className="h-3.5 w-3.5" /> {approvedLocked ? "Revise" : "Edit"}
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
            {workflowStatus === "Submitted to Budget Officer" && (
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 border-emerald-500/50 bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/15 dark:text-emerald-300"
                onClick={() => persistPpmp("Approved")}
                disabled={savingAction !== null || overBudget || hasBudgetOverages}
              >
                {savingAction === "approve" ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                Approve
              </Button>
            )}
            <Button variant="outline" size="sm" className="gap-1.5 border-border" onClick={() => persistPpmp("Draft")} disabled={approvedLocked || savingAction !== null || overBudget || hasBudgetOverages}>
              {savingAction === "draft" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save Draft
            </Button>
            <Button size="sm" className="gap-1.5" onClick={() => persistPpmp("Submitted to Budget Officer")} disabled={approvedLocked || savingAction !== null || overBudget || hasBudgetOverages}>
              {savingAction === "submit" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Submit to Budget Officer
            </Button>
          </div>
        </div>
      </div>

      {/* Budget bar */}
      <div className="no-print border-b border-border bg-card/50">
        <div className="mx-auto flex w-full max-w-[1400px] flex-wrap items-center gap-4 px-3 py-2.5 sm:px-6">
          <div className="flex items-center gap-4 text-xs">
            <span className="text-muted-foreground">LIB: <strong className="text-navy">₱{fmtAmount(libBudgetTotal)}</strong></span>
            <span className="text-muted-foreground">This PPMP: <strong className={overBudget || hasBudgetOverages ? "text-destructive" : "text-navy"}>₱{fmtAmount(ppmpTotal)}</strong></span>
            <span className="text-muted-foreground">Remaining: <strong className={overBudget || hasBudgetOverages ? "text-destructive" : "text-success"}>₱{fmtAmount(remaining)}</strong></span>
          </div>
          <div className="ml-auto flex w-32 items-center gap-2">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-secondary">
              <div
                className={cn("h-full rounded-full transition-all", overBudget || hasBudgetOverages ? "bg-destructive" : usagePercent > 80 ? "bg-warning" : "bg-primary")}
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
          {hasBudgetOverages && (
            <div className="flex w-full flex-wrap items-center gap-x-2 gap-y-1 text-xs text-destructive">
              <AlertTriangle className="h-3.5 w-3.5" />
              <span>
                {budgetOverages[0].label} exceeds LIB budget: ₱{fmtAmount(budgetOverages[0].total)} / ₱{fmtAmount(budgetOverages[0].limit)}
              </span>
              {budgetOverages.length > 1 && <span>+{budgetOverages.length - 1} more</span>}
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
                  const endedSubcategoryId = endsSubcategoryBlock(doc.rows, idx);
                  const endedCategoryId = endsCategoryBlock(doc.rows, idx);
                  const endedSubcategory = endedSubcategoryId ? doc.rows.find((row) => row.id === endedSubcategoryId) : undefined;
                  const endedCategory = endedCategoryId ? doc.rows.find((row) => row.id === endedCategoryId) : undefined;
                  const trailingSubtotalRows = (
                    <>
                      {endedSubcategory && (
                        <tr className="font-bold bg-gray-50/50">
                          <td colSpan={9} className="border border-black px-1 py-1 text-right uppercase text-[9px]">
                            SUBTOTAL {endedSubcategory.subcategoryLabel}
                          </td>
                          <td className="border border-black px-1 py-1 text-right tabular-nums">
                            ₱{fmtAmount(getSubcategorySubtotal(doc.rows, endedSubcategory.id))}
                          </td>
                          <td colSpan={2} className="border border-black" />
                        </tr>
                      )}
                      {endedCategory && (
                        <tr className="bg-gray-50/50 font-bold italic">
                          <td className="border border-black px-1 py-1 uppercase text-[9px]">
                            SUBTOTAL {endedCategory.categoryLabel}
                          </td>
                          <td colSpan={8} className="border border-black" />
                          <td className="border border-black px-1 py-1 text-right tabular-nums">
                            ₱{fmtAmount(getCategorySubtotal(doc.rows, endedCategory.id))}
                          </td>
                          <td colSpan={2} className="border border-black" />
                        </tr>
                      )}
                    </>
                  );

                  if (r.isCategory) {
                    return (
                      <Fragment key={r.id}>
                        <tr
                          className={cn("group", dragOverCategoryId === r.id && draggedCategoryId !== r.id && "bg-amber-100")}
                          onDragOver={(event) => {
                            if (!editing || !draggedCategoryId || draggedCategoryId === r.id) return;
                            event.preventDefault();
                            setDragOverCategoryId(r.id);
                          }}
                          onDragLeave={() => {
                            if (dragOverCategoryId === r.id) setDragOverCategoryId(null);
                          }}
                          onDrop={(event) => {
                            event.preventDefault();
                            const sourceId = event.dataTransfer.getData("text/plain") || draggedCategoryId;
                            if (editing && sourceId) reorderCategoryBlock(sourceId, r.id);
                            setDraggedCategoryId(null);
                            setDragOverCategoryId(null);
                          }}
                        >
                          {/* Category header row */}
                          <td colSpan={12} className="relative border border-black px-1 py-1 font-bold uppercase italic">
                            {editing && (
                              <div className="no-print absolute -right-24 top-1/2 z-50 flex -translate-y-1/2 items-center gap-0.5 rounded-sm bg-white px-1 py-0.5 opacity-80 shadow-md ring-1 ring-black/15 transition-opacity group-hover:opacity-100">
                                <button
                                  type="button"
                                  draggable
                                  onDragStart={(event) => {
                                    setDraggedCategoryId(r.id);
                                    event.dataTransfer.effectAllowed = "move";
                                    event.dataTransfer.setData("text/plain", r.id);
                                  }}
                                  onDragEnd={() => {
                                    setDraggedCategoryId(null);
                                    setDragOverCategoryId(null);
                                  }}
                                  title="Drag category"
                                  className="cursor-grab rounded-sm p-0.5 text-black active:cursor-grabbing hover:bg-amber-100"
                                >
                                  <GripVertical className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => moveCategoryBlock(r.id, "up")}
                                  title="Move category up"
                                  className="rounded-sm p-0.5 text-gray-600 hover:bg-amber-100 hover:text-black"
                                >
                                  <ArrowUp className="h-3 w-3" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => moveCategoryBlock(r.id, "down")}
                                  title="Move category down"
                                  className="rounded-sm p-0.5 text-gray-600 hover:bg-amber-100 hover:text-black"
                                >
                                  <ArrowDown className="h-3 w-3" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => removeRow(r.id)}
                                  title="Remove category"
                                  className="rounded-sm p-0.5 text-red-500 hover:bg-red-50 hover:text-red-700"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </button>
                              </div>
                            )}
                            <MainItemField value={r.categoryLabel} onChange={(v) => setRow(r.id, { categoryLabel: v })} editing={editing} />
                          </td>
                        </tr>
                        {trailingSubtotalRows}
                      </Fragment>
                    );
                  }

                  if (r.isSubcategory) {
                    return (
                      <Fragment key={r.id}>
                        <tr className="group">
                          <td className="relative border border-black px-1 py-1 italic">
                            {editing && (
                              <div className="no-print absolute -left-11 top-1 z-50 flex items-center gap-0.5 rounded-sm bg-white px-1 py-0.5 opacity-0 shadow-sm ring-1 ring-black/15 group-hover:opacity-100">
                                <button
                                  type="button"
                                  onClick={() => duplicateRow(r.id)}
                                  title="Duplicate row"
                                  className="rounded-sm text-gray-700 hover:bg-amber-100 hover:text-black"
                                >
                                  <Copy className="h-3 w-3" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => removeRow(r.id)}
                                  title="Remove sub item"
                                  className="text-red-400 hover:text-red-600"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </button>
                              </div>
                            )}
                            <TextField value={r.subcategoryLabel} onChange={(v) => setRow(r.id, { subcategoryLabel: v })} editing={editing} italic placeholder="Sub item name" />
                          </td>
                          <td colSpan={11} className="border border-black" />
                        </tr>
                        {trailingSubtotalRows}
                      </Fragment>
                    );
                  }

                  const activeSubcategory = getActiveSubcategory(doc.rows, idx);
                  const showSharedDescription = Boolean(activeSubcategory && isFirstDataRowInSubcategory(doc.rows, idx, activeSubcategory.id));
                  const sharedDescriptionRowSpan = activeSubcategory ? countSubcategoryDataRows(doc.rows, activeSubcategory.id) : 1;

                  return (
                    <Fragment key={r.id}>
                      <tr className="group align-top">
                        {/* Column 1: General Description */}
                        {activeSubcategory ? (
                          showSharedDescription && (
                            <td rowSpan={Math.max(1, sharedDescriptionRowSpan)} className="relative border border-black px-1 py-0.5 align-top">
                              <AutoTextarea
                                value={activeSubcategory.generalDescription}
                                onChange={(v) => setRow(activeSubcategory.id, { generalDescription: v })}
                                editing={editing}
                                italic
                                className="min-h-[4.8em]"
                              />
                            </td>
                          )
                        ) : (
                          <td className="relative border border-black px-1 py-0.5">
                            {editing && (
                              <div className="no-print absolute -left-11 top-1 z-50 flex items-center gap-0.5 rounded-sm bg-white px-1 py-0.5 opacity-0 shadow-sm ring-1 ring-black/15 group-hover:opacity-100">
                                <button
                                  type="button"
                                  onClick={() => duplicateRow(r.id)}
                                  title="Duplicate row"
                                  className="rounded-sm text-gray-700 hover:bg-amber-100 hover:text-black"
                                >
                                  <Copy className="h-3 w-3" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => removeRow(r.id)}
                                  title="Remove row"
                                  className="text-red-400 hover:text-red-600"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </button>
                              </div>
                            )}
                            <AutoTextarea value={r.generalDescription} onChange={(v) => setRow(r.id, { generalDescription: v })} editing={editing} />
                          </td>
                        )}
                        {/* Column 2: Type (Dropdown) */}
                        <td className="relative border border-black px-0.5 py-0.5 text-center">
                          {editing && activeSubcategory && (
                            <div className="no-print absolute -left-11 top-1 z-50 flex items-center gap-0.5 rounded-sm bg-white px-1 py-0.5 opacity-0 shadow-sm ring-1 ring-black/15 group-hover:opacity-100">
                              <button
                                type="button"
                                onClick={() => duplicateRow(r.id)}
                                title="Duplicate row"
                                className="rounded-sm text-gray-700 hover:bg-amber-100 hover:text-black"
                              >
                                <Copy className="h-3 w-3" />
                              </button>
                              <button
                                type="button"
                                onClick={() => removeRow(r.id)}
                                title="Remove row"
                                className="text-red-400 hover:text-red-600"
                              >
                                <Trash2 className="h-3 w-3" />
                              </button>
                            </div>
                          )}
                          <SelectField value={r.projectType} onChange={(v) => setRow(r.id, { projectType: v })} options={PROJECT_TYPES} editing={editing} />
                        </td>
                        {/* Column 3: Quantity and Size */}
                        <td className="border border-black px-1 py-0.5">
                          <RichTextField value={r.quantitySize} onChange={(v) => setRow(r.id, { quantitySize: v })} editing={editing} italic />
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
                          <SelectField value={r.procStart} onChange={(v) => setRow(r.id, { procStart: v })} options={deliveryMonthYearOptions} editing={editing} />
                        </td>
                        {/* Column 7: End */}
                        <td className="border border-black px-1 py-0.5 text-center">
                          <SelectField value={r.procEnd} onChange={(v) => setRow(r.id, { procEnd: v })} options={deliveryMonthYearOptions} editing={editing} />
                        </td>
                        {/* Column 8: Delivery Period */}
                        <td className="border border-black px-1 py-0.5 text-center">
                          <SelectField value={r.deliveryPeriod} onChange={(v) => setRow(r.id, { deliveryPeriod: v })} options={deliveryMonthYearOptions} editing={editing} />
                        </td>
                        {/* Column 9: Source of Funds */}
                        <td className="border border-black" />
                        {/* Column 10: Estimated Budget */}
                        <td
                          className={cn(
                            "border border-black px-1 py-0.5",
                            budgetOverageRowIds.has(r.id) && "bg-red-100 text-red-950 ring-2 ring-inset ring-red-500 print:bg-red-100",
                          )}
                        >
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
                      {trailingSubtotalRows}
                    </Fragment>
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
                      <Button variant="outline" size="sm" className={documentActionButtonClass}>
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
                      {subcategories.length > 0 && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuLabel>Subcategories</DropdownMenuLabel>
                          {subcategories.map((s) => (
                            <DropdownMenuItem key={s.id} onClick={() => addLineUnderSubcategory(s.id)}>
                              <span className="truncate">{s.subcategoryLabel || "(untitled subcategory)"}</span>
                            </DropdownMenuItem>
                          ))}
                        </>
                      )}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={addLineAtEnd}>At the end</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : (
                  <Button variant="outline" size="sm" onClick={addLineAtEnd} className={documentActionButtonClass}>
                    <Plus className="h-3.5 w-3.5" /> Add Line
                  </Button>
                )}
                {categories.length > 0 && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm" className={documentActionButtonClass}>
                        <Plus className="h-3.5 w-3.5" /> Add Subcategory
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="max-h-72 w-64 overflow-y-auto">
                      <DropdownMenuLabel>Add subcategory under…</DropdownMenuLabel>
                      {categories.map((c) => (
                        <DropdownMenuItem key={c.id} onClick={() => addSubcategoryUnderCategory(c.id)}>
                          <span className="truncate">{c.categoryLabel || "(untitled)"}</span>
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
                <Button variant="outline" size="sm" onClick={addCategory} className={documentActionButtonClass}>
                  <Plus className="h-3.5 w-3.5" /> Add Category
                </Button>
              </div>
            )}

            {/* Signatories */}
            <div className="mt-10 grid grid-cols-2 gap-x-12 gap-y-8">
              <Signatory label="Prepared & Submitted by:" name={doc.preparedByName} position={doc.preparedByPosition} date={doc.preparedByDate} editing={editing} options={signatories} onName={(v) => set("preparedByName", v)} onPosition={(v) => set("preparedByPosition", v)} onDate={(v) => set("preparedByDate", v)} />
              <Signatory label="Certified Funds Available:" name={doc.budgetOfficerName} position={doc.budgetOfficerPosition} date={doc.budgetCertifiedDate} editing={editing} options={signatories} onName={(v) => set("budgetOfficerName", v)} onPosition={(v) => set("budgetOfficerPosition", v)} onDate={(v) => set("budgetCertifiedDate", v)} />
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
  options,
  onName,
  onPosition,
  onDate,
}: {
  label: string;
  name: string;
  position: string;
  date: string;
  editing: boolean;
  options: SignatoryOption[];
  onName: (v: string) => void;
  onPosition: (v: string) => void;
  onDate: (v: string) => void;
}) {
  // Keep the current name selectable even if that account is no longer among the
  // approved options (e.g. a previously-picked signatory was deactivated).
  const items = name && !options.some((o) => o.name === name) ? [{ id: -1, name, tier: "regular" as const, position: null }, ...options] : options;
  // Picking a signatory fills the name and auto-fills the position captured at sign-up.
  const pick = (n: string) => {
    onName(n);
    const chosen = options.find((o) => o.name === n);
    if (chosen?.position) onPosition(chosen.position);
  };
  return (
    <div>
      <p className="text-[11px]">{label}</p>
      <div className="mt-8">
        {editing ? (
          <div style={{ fontFamily: "var(--font-sans)" }}>
            <Select value={name || undefined} onValueChange={pick}>
              <SelectTrigger className="h-8 border-black/20 font-bold">
                <SelectValue placeholder="Select signatory…" />
              </SelectTrigger>
              <SelectContent>
                {items.length === 0 ? (
                  <div className="px-2 py-1.5 text-sm text-muted-foreground">No approved accounts yet</div>
                ) : (
                  items.map((o) => (
                    <SelectItem key={o.name} value={o.name}>
                      {o.name}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
            <div className="mt-1 border-b border-black/20 text-[10px]">
              <TextField value={position} onChange={onPosition} editing className="text-[10px]" placeholder="Designation" />
            </div>
            <div className="mt-1 border-b border-black/20 text-[10px]">
              <TextField value={date} onChange={onDate} editing className="text-[10px]" placeholder="Date" />
            </div>
          </div>
        ) : (
          <>
            <div className="font-bold">
              <TextField value={name} onChange={onName} editing={false} bold placeholder="Name" />
            </div>
            <div className="text-[10px]">
              <TextField value={position} onChange={onPosition} editing={false} className="text-[10px]" placeholder="Designation" />
            </div>
            <div className="mt-1 text-[10px]">
              <TextField value={date} onChange={onDate} editing={false} className="text-[10px]" placeholder="Date" />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
