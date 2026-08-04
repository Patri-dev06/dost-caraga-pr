import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ArrowLeft, CheckCircle2, Eye, FileSpreadsheet, History, ListOrdered, Loader2, Pencil, Plus, Printer, Save, Send, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiGetSignatories, type Signatory as SignatoryOption } from "@/lib/api";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  fmtAmount,
  getLib,
  isReprogrammingTotalBalanced,
  libTotals,
  maxRounds,
  MAX_REVISIONS,
  newLibDoc,
  newRowId,
  parseAmount,
  reprogrammingTotalDifference,
  reprogLabel,
  saveLib,
  type LibDoc,
  type LibReprogramming,
  type LibRow,
  type LibStatus,
} from "@/lib/lib-store";
import { exportLibExcel } from "@/lib/lib-excel";
import { useCurrentUser } from "@/lib/current-user";

export const Route = createFileRoute("/planning/lib/new")({
  validateSearch: (search: Record<string, unknown>): { edit?: string } => ({
    edit: typeof search.edit === "string" ? search.edit : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Create Line Item Budget — DOST Caraga" },
      { name: "description", content: "Prepare the DOST Form 4 Project Line-Item Budget and preview it before submitting." },
    ],
  }),
  component: LibForm,
});

const SERIF = '"Times New Roman", Times, serif';

function reprogrammingDifferenceText(diff: number): string {
  return `${diff > 0 ? "Over" : "Short"} by ₱${fmtAmount(Math.abs(diff))}`;
}

function toRoman(num: number): string {
  const map: [number, string][] = [
    [1000, "M"], [900, "CM"], [500, "D"], [400, "CD"], [100, "C"], [90, "XC"],
    [50, "L"], [40, "XL"], [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"],
  ];
  let out = "";
  let n = num;
  for (const [value, sym] of map) {
    while (n >= value) {
      out += sym;
      n -= value;
    }
  }
  return out;
}

/* ---- inline editable primitives (amber highlight while editing, plain in preview) ---- */

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
  if (!editing) return <span className={cn(shared, "inline-block min-h-[1.2em] whitespace-pre-wrap break-words")}>{value || " "}</span>;
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={cn(shared, "rounded-sm px-0.5 outline-none placeholder:italic placeholder:text-black/30 hover:bg-amber-50 focus:bg-amber-100")}
    />
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
  const [focused, setFocused] = useState(false);
  const shared = "w-full bg-transparent text-center tabular-nums leading-snug";
  if (!editing) return <span className={cn(shared, "inline-block min-h-[1.2em]")}>{value === "" ? " " : fmtAmount(parseAmount(value))}</span>;
  // While focused, show raw digits for easy editing; when blurred, show the
  // grouped "8,000.00" form. parseAmount tolerates the commas either way.
  return (
    <input
      inputMode="decimal"
      value={focused || value === "" ? value : fmtAmount(parseAmount(value))}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      // Numbers only: keep digits, commas and the decimal point; drop anything else.
      onChange={(e) => onChange(e.target.value.replace(/[^0-9.,]/g, ""))}
      className={cn(shared, "rounded-sm px-0.5 outline-none hover:bg-amber-50 focus:bg-amber-100")}
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
  if (!editing) return <div className={cn("min-h-[1.2em] whitespace-pre-wrap break-words leading-snug", className)}>{value || " "}</div>;
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

/* The per-row "+" — opens its add options on hover (and click), inserting below
   this row. A category only takes lines; titles and lines can start anything. */
function AddRowMenu({
  row,
  onLine,
  onCategory,
  onTitle,
}: {
  row: LibRow;
  onLine: () => void;
  onCategory: () => void;
  onTitle: () => void;
}) {
  const [open, setOpen] = useState(false);
  const canBranch = !(row.header && row.indent === 1);
  return (
    // Non-modal: a modal menu locks body scroll and sets pointer-events:none,
    // which shifts the page and drops the row hover this toolbar depends on.
    <DropdownMenu open={open} onOpenChange={setOpen} modal={false}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          title="Add below…"
          onMouseEnter={() => setOpen(true)}
          className="text-emerald-500 hover:text-emerald-700"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        onMouseLeave={() => setOpen(false)}
        onCloseAutoFocus={(e) => e.preventDefault()}
        style={{ fontFamily: "var(--font-sans)" }}
      >
        <DropdownMenuItem onClick={onLine}>
          <Plus className="h-3.5 w-3.5" /> Add Line
        </DropdownMenuItem>
        {canBranch && (
          <>
            <DropdownMenuItem onClick={onCategory}>
              <Plus className="h-3.5 w-3.5" /> Add Category
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onTitle}>
              <ListOrdered className="h-3.5 w-3.5" /> Add Title
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/* ------------------------------------- Page ------------------------------------- */

function LibForm() {
  const navigate = useNavigate();
  const { edit: editId } = Route.useSearch();
  const isEditing = Boolean(editId);

  const [mode, setMode] = useState<"edit" | "revise" | "preview">("edit");
  const [doc, setDoc] = useState<LibDoc>(() => newLibDoc());
  const [action, setAction] = useState<LibStatus | "draft" | "revision" | null>(null);
  const [reviseRound, setReviseRound] = useState<number | null>(null); // 0-based index of the reprogramming round being edited
  const [missingIds, setMissingIds] = useState<Set<string>>(new Set()); // rows flagged for a missing justification
  const rowRefs = useRef<Record<string, HTMLTableRowElement | null>>({}); // to scroll to a flagged row

  // Approved accounts, offered as signatory choices. A user is "approved by the
  // superadmin" once their account status is Active (see /signatories endpoint).
  const [signatories, setSignatories] = useState<SignatoryOption[]>([]);
  useEffect(() => {
    apiGetSignatories()
      .then(setSignatories)
      .catch(() => setSignatories([]));
  }, []);

  // "Prepared by" is always the signed-in user — auto-fill their name and
  // position on a brand-new LIB (never overwrite an existing/loaded document).
  const { user: currentUser } = useCurrentUser();
  useEffect(() => {
    if (isEditing || !currentUser) return;
    setDoc((d) =>
      d.preparedByName || d.preparedByPosition
        ? d
        : { ...d, preparedByName: currentUser.name, preparedByPosition: currentUser.position },
    );
  }, [currentUser, isEditing]);

  const submitted = doc.status !== "Draft"; // approved/submitted — the Approved LIB figures and labels are locked
  const preview = mode === "preview";
  const fullEdit = !submitted && !preview; // draft: every field is editable
  const revising = submitted && reviseRound !== null && !preview; // a reprogramming round is open for editing
  const editing = fullEdit || revising; // any input-editing view (drives the faint guide grid)
  const rounds = maxRounds(doc.rows); // number of reprogramming columns currently shown
  const roundIdx = Array.from({ length: rounds }, (_, i) => i);

  // Load an existing LIB when editing.
  const loaded = useRef(false);
  useEffect(() => {
    if (!editId || loaded.current) return;
    loaded.current = true;
    const found = getLib(editId);
    if (found) {
      setDoc(found);
      if (found.status !== "Draft") setMode("preview"); // approved LIBs open read-only; "Revise" starts a new round
    } else toast.error("That LIB could not be found; starting a new one.");
  }, [editId]);

  const set = <K extends keyof LibDoc>(key: K, value: LibDoc[K]) => setDoc((d) => ({ ...d, [key]: value }));
  const setRow = (id: string, patch: Partial<LibRow>) =>
    setDoc((d) => ({ ...d, rows: d.rows.map((r) => (r.id === id ? { ...r, ...patch } : r)) }));
  const setReprog = (id: string, roundIndex: number, patch: Partial<LibReprogramming>) =>
    setDoc((d) => ({
      ...d,
      rows: d.rows.map((r) => {
        if (r.id !== id) return r;
        // Pad up to the target round so any row (including headers that carry an
        // amount) can receive a reprogramming value even if it had no slot yet.
        const reps = [...r.reprogrammings];
        while (reps.length <= roundIndex) reps.push({ amount: "", justification: "" });
        reps[roundIndex] = { ...reps[roundIndex], ...patch };
        return { ...r, reprogrammings: reps };
      }),
    }));
  // Drop a row's "missing justification" flag once it has been addressed.
  const clearMissing = (id: string) =>
    setMissingIds((s) => {
      if (!s.has(id)) return s;
      const next = new Set(s);
      next.delete(id);
      return next;
    });
  // A blank row is padded to match the number of reprogramming rounds currently
  // shown, so a line added mid-revision gets an editable amount + justification
  // cell in the active round. Drafts have 0 rounds, so this stays empty there.
  const blankRow = (header: boolean, indent: 0 | 1 | 2, label = ""): LibRow => ({
    id: newRowId(),
    label,
    note: "",
    indent,
    header,
    approved: "",
    reprogrammings: Array.from({ length: rounds }, () => ({ amount: "", justification: "" })),
  });
  const addRow = (header: boolean) => setDoc((d) => ({ ...d, rows: [...d.rows, blankRow(header, header ? 1 : 2)] }));
  const addSection = () =>
    setDoc((d) => {
      const count = d.rows.filter((r) => r.header && r.indent === 0).length;
      return { ...d, rows: [...d.rows, blankRow(true, 0, `${toRoman(count + 1)}. `)] };
    });
  const addLineToCategory = (categoryId: string) =>
    setDoc((d) => {
      const rows = [...d.rows];
      const i = rows.findIndex((r) => r.id === categoryId);
      if (i < 0) return d;
      const cat = rows[i];
      const childIndent = (Math.min(2, cat.indent + 1) as 0 | 1 | 2);
      // Insert after the last row that belongs to this category (deeper indent than the header).
      let insertAt = i + 1;
      for (let j = i + 1; j < rows.length; j++) {
        if (rows[j].indent <= cat.indent) break;
        insertAt = j + 1;
      }
      rows.splice(insertAt, 0, blankRow(false, childIndent));
      return { ...d, rows };
    });
  const removeRow = (id: string) => setDoc((d) => ({ ...d, rows: d.rows.filter((r) => r.id !== id) }));
  // Insert a fresh row directly below the given one. `insertAfter` splices in a
  // row built by `make`, using the reference row for context (indent, numbering).
  const insertAfter = (id: string, make: (ref: LibRow, all: LibRow[]) => LibRow) =>
    setDoc((d) => {
      const rows = [...d.rows];
      const i = rows.findIndex((r) => r.id === id);
      if (i < 0) return d;
      rows.splice(i + 1, 0, make(rows[i], rows));
      return { ...d, rows };
    });
  // Add a line below: under a category header we nest one level deeper; next to a
  // normal line we keep the same indent.
  const addLineAfter = (id: string) =>
    insertAfter(id, (ref) => blankRow(false, ref.header ? (Math.min(2, ref.indent + 1) as 0 | 1 | 2) : ref.indent));
  const addCategoryAfter = (id: string) => insertAfter(id, () => blankRow(true, 1));
  const addTitleAfter = (id: string) =>
    insertAfter(id, (_ref, all) => {
      const count = all.filter((r) => r.header && r.indent === 0).length;
      return blankRow(true, 0, `${toRoman(count + 1)}. `);
    });
  const categories = doc.rows.filter((r) => r.header);

  const totals = libTotals(doc.rows);
  const reprogrammingBalance = roundIdx.map((i) => {
    const difference = reprogrammingTotalDifference(doc.rows, i);
    return {
      roundIndex: i,
      difference,
      balanced: isReprogrammingTotalBalanced(doc.rows, i),
    };
  });
  const unbalancedReprogrammings = reprogrammingBalance.filter((r) => !r.balanced);
  // Excel-style guide grid: faint cell lines while editing, invisible in preview/print.
  const gl = editing ? "border border-black/20" : "";

  function persist(status: LibStatus) {
    setAction(status === "Draft" ? "draft" : status);
    try {
      saveLib({ ...doc, status });
      toast.success(status === "Draft" ? "Line Item Budget saved as draft." : "Line Item Budget submitted for approval.");
      navigate({ to: "/planning/lib" });
    } catch {
      toast.error("Unable to save the Line Item Budget.");
    } finally {
      setAction(null);
    }
  }

  function approveCurrentLib() {
    // A LIB can only be approved when every reprogramming round still totals the
    // Approved LIB figure — reprogramming reallocates line items, it must never
    // change the grand total. Block approval (and report each offending round).
    if (unbalancedReprogrammings.length > 0) {
      const detail = unbalancedReprogrammings
        .map((r) => `${reprogLabel(r.roundIndex)} is ${reprogrammingDifferenceText(r.difference).toLowerCase()}`)
        .join("; ");
      toast.error(`Cannot approve — every reprogramming must equal the Approved LIB total of ₱${fmtAmount(totals.approved)}. ${detail}.`);
      return;
    }
    setAction("Approved");
    try {
      const approved = saveLib({ ...doc, status: "Approved" });
      setDoc(approved);
      setMode("preview");
      toast.success("Line Item Budget approved.");
    } catch {
      toast.error("Unable to approve the Line Item Budget.");
    } finally {
      setAction(null);
    }
  }

  // Begin a new reprogramming round: add a column pre-filled from the previous
  // figures (Approved for the first round) so unchanged lines simply carry over.
  function startRevision() {
    if (doc.revision >= MAX_REVISIONS) {
      toast.error(`This LIB has reached the maximum of ${MAX_REVISIONS} revisions.`);
      return;
    }
    const newRound = doc.revision; // 0-based index of the round being added
    setDoc((d) => ({
      ...d,
      rows: d.rows.map((r) => {
        // Every row (headers included, since they may carry an amount now) gets a
        // new round pre-filled from the previous figure, so unchanged lines carry over.
        const prevAmount = newRound === 0 ? r.approved : r.reprogrammings[newRound - 1]?.amount ?? "";
        return { ...r, reprogrammings: [...r.reprogrammings, { amount: prevAmount, justification: "" }] };
      }),
    }));
    setReviseRound(newRound);
    setMode("revise");
  }

  function saveRevision() {
    if (reviseRound === null) return;
    // Every line whose amount changed from the previous round (Approved, for the first round) needs a justification.
    const missing = doc.rows.filter((r) => {
      const cur = r.reprogrammings[reviseRound];
      if (!cur) return false;
      const baseline = reviseRound === 0 ? r.approved : r.reprogrammings[reviseRound - 1]?.amount ?? "";
      const changed = parseAmount(cur.amount) !== parseAmount(baseline);
      return changed && !(cur.justification ?? "").trim();
    });
    if (missing.length > 0) {
      // Flag the offending rows and scroll to the first one so it's obvious.
      setMissingIds(new Set(missing.map((r) => r.id)));
      toast.error(`Justification is required for every line you added or changed (${missing.length} missing).`);
      requestAnimationFrame(() => rowRefs.current[missing[0].id]?.scrollIntoView({ behavior: "smooth", block: "center" }));
      return;
    }
    setMissingIds(new Set());

    const difference = reprogrammingTotalDifference(doc.rows, reviseRound);
    if (!isReprogrammingTotalBalanced(doc.rows, reviseRound)) {
      toast.error(`${reprogLabel(reviseRound)} must equal the Approved LIB total. ${reprogrammingDifferenceText(difference)}.`);
      return;
    }

    setAction("revision");
    try {
      const prev = getLib(doc.id);
      const history = [...(doc.history ?? [])];
      if (prev) history.push({ savedAt: prev.updatedAt, status: prev.status, rows: prev.rows });
      saveLib({ ...doc, revision: doc.revision + 1, history });
      toast.success("Revision saved.");
      navigate({ to: "/planning/lib" });
    } catch {
      toast.error("Unable to save the revision.");
    } finally {
      setAction(null);
    }
  }

  function handleExport() {
    exportLibExcel(doc).catch(() => toast.error("Unable to export to Excel."));
  }

  const [historyOpen, setHistoryOpen] = useState(false);
  const history = doc.history ?? [];

  return (
    <div className="min-h-full bg-background print:bg-white">
      {/* Toolbar */}
      <div className="no-print sticky top-0 z-10 border-b border-border bg-card/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-2 px-3 py-3 sm:px-6">
          <Button variant="ghost" size="sm" asChild className="gap-1.5 text-muted-foreground">
            <Link to="/planning/lib">
              <ArrowLeft className="h-4 w-4" /> Back
            </Link>
          </Button>

          {isEditing && (
            <span
              className={cn(
                "hidden rounded-md px-2 py-1 text-xs font-semibold sm:inline",
                submitted ? "bg-warning/15 text-warning-foreground" : "bg-secondary text-secondary-foreground",
              )}
            >
              {submitted ? `Locked · ${doc.status}${doc.revision > 0 ? ` · Rev ${doc.revision}` : ""}` : "Draft"}
            </span>
          )}

          {revising && reviseRound !== null && (
            <span className="hidden rounded-md bg-primary/15 px-2 py-1 text-xs font-semibold text-primary sm:inline">
              Editing {reprogLabel(reviseRound)}
            </span>
          )}

          <div className="ml-1 flex rounded-lg border border-border bg-background p-0.5">
            <button
              type="button"
              onClick={() => {
                if (!submitted) {
                  setMode("edit");
                } else if (reviseRound === null) {
                  startRevision();
                } else {
                  setMode("revise");
                }
              }}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                mode !== "preview" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Pencil className="h-3.5 w-3.5" /> {submitted ? "Revise" : "Edit"}
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

          {submitted && (
            <Button variant="outline" size="sm" className="gap-1.5 border-border" onClick={() => setHistoryOpen(true)}>
              <History className="h-4 w-4" /> History{history.length > 0 && ` (${history.length})`}
            </Button>
          )}

          <div className="ml-auto flex items-center gap-2">
            <Button variant="outline" size="sm" className="gap-1.5 border-border" onClick={handleExport}>
              <FileSpreadsheet className="h-4 w-4" /> Export Excel
            </Button>
            {submitted && doc.status !== "Approved" && (
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 border-emerald-500/50 bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/15 dark:text-emerald-300"
                onClick={approveCurrentLib}
                disabled={action !== null || unbalancedReprogrammings.length > 0}
                title={
                  unbalancedReprogrammings.length > 0
                    ? `Reprogramming must equal the Approved LIB total of ₱${fmtAmount(totals.approved)} before this can be approved.`
                    : undefined
                }
              >
                {action === "Approved" ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                Approve
              </Button>
            )}
            {mode === "preview" && (
              <Button variant="outline" size="sm" className="gap-1.5 border-border" onClick={() => window.print()}>
                <Printer className="h-4 w-4" /> Print
              </Button>
            )}
            {submitted ? (
              reviseRound !== null && (
                <Button size="sm" className="gap-1.5" onClick={saveRevision} disabled={action !== null}>
                  {action === "revision" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Save Revision
                </Button>
              )
            ) : (
              <>
                <Button variant="outline" size="sm" className="gap-1.5 border-border" onClick={() => persist("Draft")} disabled={action !== null}>
                  {action === "draft" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  {isEditing ? "Save Changes" : "Save as Draft"}
                </Button>
                <Button size="sm" className="gap-1.5" onClick={() => persist("Pending Supervisor Review")} disabled={action !== null}>
                  {action === "Pending Supervisor Review" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  Submit for Approval
                </Button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Document */}
      <div className="w-full overflow-x-auto px-3 py-6 sm:px-6 print:overflow-visible print:p-0">
        <div className="pr-print-root mx-auto w-[820px] max-w-full">
          <div
            className="bg-white px-10 py-8 text-[12px] text-black shadow-card ring-1 ring-black/5 print:shadow-none print:ring-0"
            style={{ fontFamily: SERIF }}
          >
            {/* Header */}
            <div className="relative mb-4">
              <img src="/dost-seal.svg" alt="DOST" className="absolute left-0 top-0 h-12 w-12" />
              <div className="text-center">
                <p className="text-[11px] font-bold">DOST Form 4</p>
                <p className="mt-3 text-[11px] font-bold tracking-wide">DEPARTMENT OF SCIENCE AND TECHNOLOGY</p>
                <p className="mt-0.5 text-[12px] font-bold">Project Line-Item Budget</p>
                <p className="mt-0.5 text-[12px] font-bold">
                  CY <TextField value={doc.fiscalYear} onChange={(v) => set("fiscalYear", v)} editing={fullEdit} className="inline w-14" align="center" bold />
                </p>
              </div>
            </div>

            {/* Header fields */}
            <div className="space-y-0.5">
              {(
                [
                  ["Program Title", "programTitle"],
                  ["Project Title", "projectTitle"],
                  ["Implementing Agency", "implementingAgency"],
                  ["Total Duration", "totalDuration"],
                  ["Cooperating Agency", "cooperatingAgency"],
                  ["Project Leader", "projectLeader"],
                  ["Monitoring Agency", "monitoringAgency"],
                ] as [string, keyof LibDoc][]
              ).map(([label, key]) => (
                <div key={key} className="flex items-start gap-2">
                  <span className="w-36 shrink-0 font-bold">{label}</span>
                  <span className="shrink-0 font-bold">:</span>
                  <div className={cn("min-w-0 flex-1", fullEdit && "border-b border-black/20")}>
                    {key === "cooperatingAgency" || key === "projectTitle" ? (
                      <AutoTextarea value={String(doc[key])} onChange={(v) => set(key, v as LibDoc[typeof key])} editing={fullEdit} className={key === "projectTitle" ? "underline" : ""} />
                    ) : (
                      <TextField value={String(doc[key])} onChange={(v) => set(key, v as LibDoc[typeof key])} editing={fullEdit} />
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Budget table */}
            <table className="mt-5 w-full table-fixed border-collapse">
              <colgroup>
                <col style={{ width: "26%" }} />
                <col style={{ width: "15%" }} />
                {roundIdx.map((i) => (
                  <col key={i} style={{ width: "14%" }} />
                ))}
                {rounds > 0 && <col style={{ width: `${Math.max(15, 59 - 14 * rounds)}%` }} />}
              </colgroup>
              <thead>
                <tr className="align-bottom">
                  <th className={gl} />
                  <th className={cn(gl, "px-2 pb-2 text-center font-bold")}>Approved LIB</th>
                  {roundIdx.map((i) => (
                    <th key={i} className={cn(gl, "px-2 pb-2 text-center font-bold")}>
                      {reprogLabel(i)}
                    </th>
                  ))}
                  {rounds > 0 && <th className={cn(gl, "px-2 pb-2 text-center font-bold")}>Justification</th>}
                </tr>
              </thead>
              <tbody>
                {doc.rows.map((r) => {
                  const pad = r.indent === 0 ? "pl-0" : r.indent === 1 ? "pl-4" : "pl-9";
                  const labelCls = cn(
                    pad,
                    r.header && r.indent === 0 && "font-bold",
                    r.header && r.indent === 1 && "font-semibold",
                    !r.header && r.indent === 2 && "italic",
                  );
                  return (
                    <tr
                      key={r.id}
                      ref={(el) => {
                        rowRefs.current[r.id] = el;
                      }}
                      className={cn("group align-top", missingIds.has(r.id) && "bg-red-50")}
                    >
                      <td className={cn(gl, "relative py-1.5 pr-2")}>
                        {editing && (
                          <div className="no-print absolute -left-12 top-1 z-20 flex items-center gap-1 opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 has-[[data-state=open]]:opacity-100">
                            <AddRowMenu
                              row={r}
                              onLine={() => addLineAfter(r.id)}
                              onCategory={() => addCategoryAfter(r.id)}
                              onTitle={() => addTitleAfter(r.id)}
                            />
                            <button
                              type="button"
                              onClick={() => removeRow(r.id)}
                              title="Remove row"
                              className="text-red-400 hover:text-red-600"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        )}
                        <div className={labelCls}>
                          <TextField value={r.label} onChange={(v) => setRow(r.id, { label: v })} editing={editing} bold={r.header && r.indent === 0} />
                        </div>
                      </td>
                      <td className={cn(gl, "px-2 py-1.5")}>
                        <AmountField value={r.approved} onChange={(v) => setRow(r.id, { approved: v })} editing={fullEdit} />
                      </td>
                      {roundIdx.map((i) => (
                        <td key={i} className={cn(gl, "px-2 py-1.5")}>
                          <AmountField
                            value={r.reprogrammings[i]?.amount ?? ""}
                            onChange={(v) => setReprog(r.id, i, { amount: v })}
                            editing={revising && i === reviseRound}
                          />
                        </td>
                      ))}
                      {rounds > 0 && (
                        <td
                          className={cn(
                            gl,
                            "px-2 py-1.5 pl-3 align-top text-[11px] text-black/80",
                            missingIds.has(r.id) && "ring-1 ring-inset ring-red-400",
                          )}
                        >
                          <AutoTextarea
                            value={r.reprogrammings[rounds - 1]?.justification ?? ""}
                            onChange={(v) => {
                              setReprog(r.id, rounds - 1, { justification: v });
                              if (v.trim()) clearMissing(r.id);
                            }}
                            editing={revising}
                            className="text-left text-[11px]"
                          />
                        </td>
                      )}
                    </tr>
                  );
                })}

                {/* Totals */}
                <tr className="align-top font-bold">
                  <td className={cn(gl, "pt-4 pl-9")}>Sub-Total for MOOE</td>
                  <td className={cn(gl, "px-2 pt-4 text-center tabular-nums")}>P&nbsp;&nbsp;{fmtAmount(totals.approved)}</td>
                  {roundIdx.map((i) => {
                    const balance = reprogrammingBalance[i];
                    const unbalanced = balance && !balance.balanced;
                    return (
                      <td
                        key={i}
                        className={cn(
                          gl,
                          "px-2 pt-4 text-center tabular-nums",
                          unbalanced && "bg-red-50 text-red-700",
                        )}
                      >
                        {fmtAmount(totals.reprogrammings[i] ?? 0)}
                        {unbalanced && (
                          <div className="no-print mt-0.5 text-[9px] font-normal leading-tight">
                            {reprogrammingDifferenceText(balance.difference)}
                          </div>
                        )}
                      </td>
                    );
                  })}
                  {rounds > 0 && <td className={gl} />}
                </tr>
                <tr className="align-top font-bold">
                  <td className={cn(gl, "pt-3 pl-9")}>GRAND TOTAL:</td>
                  <td className={cn("px-2 pt-3 text-center tabular-nums", editing ? "border border-black/20 border-t-black" : "border-t border-black")}>P&nbsp;&nbsp;{fmtAmount(totals.approved)}</td>
                  {roundIdx.map((i) => {
                    const balance = reprogrammingBalance[i];
                    const unbalanced = balance && !balance.balanced;
                    return (
                      <td
                        key={i}
                        className={cn(
                          "px-2 pt-3 text-center tabular-nums",
                          editing ? "border border-black/20 border-t-black" : "border-t border-black",
                          unbalanced && "bg-red-50 text-red-700",
                        )}
                      >
                        {fmtAmount(totals.reprogrammings[i] ?? 0)}
                        {unbalanced && (
                          <div className="no-print mt-0.5 text-[9px] font-normal leading-tight">
                            {reprogrammingDifferenceText(balance.difference)}
                          </div>
                        )}
                      </td>
                    );
                  })}
                  {rounds > 0 && <td className={gl} />}
                </tr>
              </tbody>
            </table>

            {unbalancedReprogrammings.length > 0 && (
              <div className="no-print mt-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700" style={{ fontFamily: "var(--font-sans)" }}>
                Reprogramming must only reallocate line items. The total must remain ₱{fmtAmount(totals.approved)}.{" "}
                {unbalancedReprogrammings.map((r) => `${reprogLabel(r.roundIndex)} is ${reprogrammingDifferenceText(r.difference).toLowerCase()}`).join("; ")}.
              </div>
            )}

            {editing && (
              <div className="no-print mt-2 flex gap-2" style={{ fontFamily: "var(--font-sans)" }}>
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
                        <DropdownMenuItem key={c.id} onClick={() => addLineToCategory(c.id)} className={c.indent >= 1 ? "pl-6" : undefined}>
                          <span className="truncate">{c.label || "(untitled category)"}</span>
                        </DropdownMenuItem>
                      ))}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => addRow(false)}>At the end (no category)</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : (
                  <Button variant="outline" size="sm" onClick={() => addRow(false)} className="h-7 gap-1.5 border-border">
                    <Plus className="h-3.5 w-3.5" /> Add Line
                  </Button>
                )}
                <Button variant="outline" size="sm" onClick={() => addRow(true)} className="h-7 gap-1.5 border-border">
                  <Plus className="h-3.5 w-3.5" /> Add Category
                </Button>
                <Button variant="outline" size="sm" onClick={addSection} className="h-7 gap-1.5 border-border">
                  <ListOrdered className="h-3.5 w-3.5" /> Add Title
                </Button>
              </div>
            )}

            {/* Notes */}
            <div className="mt-6 border-t border-dashed border-black/40 pt-2 text-[11px]">
              <p className="font-bold italic">(To be filled-up by DOST)</p>
              <TextField value={doc.chargeableNote} onChange={(v) => set("chargeableNote", v)} editing={fullEdit} className="text-[11px]" />
            </div>

            {/* Signatories */}
            <div className="mt-8 grid grid-cols-2 gap-x-10 gap-y-8">
              <Signatory label="Prepared by:" name={doc.preparedByName} position={doc.preparedByPosition} editing={fullEdit} auto options={signatories} onName={(v) => set("preparedByName", v)} onPosition={(v) => set("preparedByPosition", v)} />
              <Signatory label="Recommending Approval:" name={doc.recommendingName} position={doc.recommendingPosition} editing={fullEdit} options={signatories} onName={(v) => set("recommendingName", v)} onPosition={(v) => set("recommendingPosition", v)} />
              <Signatory label="Certified Funds Available:" name={doc.certifiedName} position={doc.certifiedPosition} editing={fullEdit} options={signatories} onName={(v) => set("certifiedName", v)} onPosition={(v) => set("certifiedPosition", v)} />
              <Signatory label="Approved by:" name={doc.approvedName} position={doc.approvedPosition} editing={fullEdit} options={signatories} onName={(v) => set("approvedName", v)} onPosition={(v) => set("approvedPosition", v)} />
            </div>
          </div>

          {/* Bottom actions — mirror the toolbar so users can act once they finish the form. */}
          {fullEdit && (
            <div className="no-print mt-4 flex flex-wrap items-center justify-end gap-2">
              <Button variant="outline" size="sm" className="gap-1.5 border-border" onClick={() => setMode("preview")}>
                <Eye className="h-4 w-4" /> Preview
              </Button>
              <Button variant="outline" size="sm" className="gap-1.5 border-border" onClick={() => persist("Draft")} disabled={action !== null}>
                {action === "draft" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {isEditing ? "Save Changes" : "Save as Draft"}
              </Button>
              <Button size="sm" className="gap-1.5" onClick={() => persist("Pending Supervisor Review")} disabled={action !== null}>
                {action === "Pending Supervisor Review" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Submit for Approval
              </Button>
            </div>
          )}

          {fullEdit && (
            <p className="no-print mx-auto mt-3 max-w-xl text-center text-xs text-muted-foreground">
              Type directly on the form. Highlighted fields are editable — switch to{" "}
              <span className="font-semibold text-foreground">Preview</span> for the clean, printable version.
            </p>
          )}
          {revising && reviseRound !== null && (
            <p className="no-print mx-auto mt-3 max-w-2xl text-center text-xs text-muted-foreground">
              Revision mode — the original approved figures are locked, but you can still{" "}
              <span className="font-semibold text-foreground">add or remove lines</span>. Edit the{" "}
              <span className="font-semibold text-foreground">{reprogLabel(reviseRound)}</span> column and its{" "}
              <span className="font-semibold text-foreground">Justification</span>; every line you add or change requires a
              justification before you can save.
            </p>
          )}
          {submitted && preview && (
            <p className="no-print mx-auto mt-3 max-w-2xl text-center text-xs text-muted-foreground">
              {doc.revision >= MAX_REVISIONS ? (
                <>This LIB has reached the maximum of {MAX_REVISIONS} revisions.</>
              ) : (
                <>
                  This LIB is approved and locked. Click <span className="font-semibold text-foreground">Revise</span> to open a new{" "}
                  <span className="font-semibold text-foreground">{reprogLabel(doc.revision)}</span> column ({doc.revision} of {MAX_REVISIONS} used).
                </>
              )}
            </p>
          )}
        </div>
      </div>

      {/* Revision history */}
      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Revision history</DialogTitle>
          </DialogHeader>
          {history.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No previous revisions yet. Each time you save a revision, the earlier version is snapshotted here.
            </p>
          ) : (
            <div className="space-y-6">
              {[...history].reverse().map((snap, idx) => {
                const t = libTotals(snap.rows);
                const sr = maxRounds(snap.rows);
                const sIdx = Array.from({ length: sr }, (_, i) => i);
                return (
                  <div key={`${snap.savedAt}-${idx}`} className="rounded-lg border border-border">
                    <div className="flex items-center justify-between gap-2 border-b border-border bg-secondary/40 px-3 py-2">
                      <p className="text-sm font-semibold text-navy">
                        Version {history.length - idx} · <span className="font-normal text-muted-foreground">{snap.status}</span>
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(snap.savedAt).toLocaleString("en-PH", { year: "numeric", month: "short", day: "2-digit", hour: "numeric", minute: "2-digit" })}
                      </p>
                    </div>
                    <div className="overflow-x-auto p-2">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-muted-foreground">
                            <th className="px-2 py-1 text-left font-medium">Object of Expenditure</th>
                            <th className="px-2 py-1 text-right font-medium">Approved LIB</th>
                            {sIdx.map((i) => (
                              <th key={i} className="px-2 py-1 text-right font-medium">
                                {reprogLabel(i)}
                              </th>
                            ))}
                            {sr > 0 && <th className="px-2 py-1 text-left font-medium">Justification</th>}
                          </tr>
                        </thead>
                        <tbody>
                          {snap.rows.map((r) => (
                            <tr key={r.id} className="border-t border-border/60">
                              <td className={cn("px-2 py-1", r.indent === 2 && "pl-6", r.header && "font-semibold text-navy")}>{r.label}</td>
                              <td className="px-2 py-1 text-right tabular-nums">{r.approved ? fmtAmount(parseAmount(r.approved)) : ""}</td>
                              {sIdx.map((i) => (
                                <td key={i} className="px-2 py-1 text-right tabular-nums">
                                  {r.reprogrammings[i]?.amount ? fmtAmount(parseAmount(r.reprogrammings[i]!.amount)) : ""}
                                </td>
                              ))}
                              {sr > 0 && <td className="px-2 py-1 text-muted-foreground">{r.reprogrammings[sr - 1]?.justification ?? ""}</td>}
                            </tr>
                          ))}
                          <tr className="border-t border-border font-semibold text-navy">
                            <td className="px-2 py-1">Grand Total</td>
                            <td className="px-2 py-1 text-right tabular-nums">{fmtAmount(t.approved)}</td>
                            {sIdx.map((i) => (
                              <td key={i} className="px-2 py-1 text-right tabular-nums">
                                {fmtAmount(t.reprogrammings[i] ?? 0)}
                              </td>
                            ))}
                            {sr > 0 && <td />}
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Signatory({
  label,
  name,
  position,
  editing,
  options,
  auto,
  onName,
  onPosition,
}: {
  label: string;
  name: string;
  position: string;
  editing: boolean;
  options: SignatoryOption[];
  auto?: boolean; // fixed to the signed-in user (Prepared by) — shown read-only, no dropdown
  onName: (v: string) => void;
  onPosition: (v: string) => void;
}) {
  // "Prepared by" is the signed-in user: render the auto-filled name/position as
  // plain text (no picker), both while editing and in preview.
  if (auto) {
    return (
      <div>
        <p className="text-[11px]">{label}</p>
        <div className="mt-8">
          <div className="font-bold">
            <TextField value={name} onChange={onName} editing={false} bold />
          </div>
          <div className="text-[11px]">
            <TextField value={position} onChange={onPosition} editing={false} className="text-[11px]" />
          </div>
        </div>
      </div>
    );
  }
  // Show the current name in the list even if that account is no longer among
  // the approved options (e.g. a previously-picked signatory was deactivated).
  const items = name && !options.some((o) => o.name === name) ? [{ id: -1, name, tier: "regular" as const, position: null }, ...options] : options;
  // Picking a signatory fills the name and auto-fills the position they entered at sign-up.
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
            <div className="mt-1 border-b border-black/20 text-[11px]">
              <TextField value={position} onChange={onPosition} editing placeholder="Position" className="text-[11px]" />
            </div>
          </div>
        ) : (
          <>
            <div className="font-bold">
              <TextField value={name} onChange={onName} editing={false} bold />
            </div>
            <div className="text-[11px]">
              <TextField value={position} onChange={onPosition} editing={false} className="text-[11px]" />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
