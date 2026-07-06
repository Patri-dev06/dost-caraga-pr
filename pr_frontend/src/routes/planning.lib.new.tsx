import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ArrowLeft, Eye, FileSpreadsheet, History, ListOrdered, Loader2, Pencil, Plus, Printer, Save, Send, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  fmtAmount,
  getLib,
  libTotals,
  newLibDoc,
  newRowId,
  parseAmount,
  saveLib,
  type LibDoc,
  type LibRow,
  type LibStatus,
} from "@/lib/lib-store";
import { exportLibExcel } from "@/lib/lib-excel";

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
  const shared = "w-full bg-transparent text-right tabular-nums leading-snug";
  if (!editing) return <span className={cn(shared, "inline-block min-h-[1.2em]")}>{value === "" ? " " : fmtAmount(parseAmount(value))}</span>;
  return (
    <input
      inputMode="decimal"
      value={value}
      onChange={(e) => onChange(e.target.value)}
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

/* ------------------------------------- Page ------------------------------------- */

function LibForm() {
  const navigate = useNavigate();
  const { edit: editId } = Route.useSearch();
  const isEditing = Boolean(editId);

  const [mode, setMode] = useState<"edit" | "revise" | "preview">("edit");
  const [doc, setDoc] = useState<LibDoc>(() => newLibDoc());
  const [action, setAction] = useState<LibStatus | "draft" | "revision" | null>(null);

  const submitted = doc.status !== "Draft"; // submitted for approval — normal editing is locked; revision re-opens it
  const editing = mode !== "preview"; // an editing view (edit for draft, revise for submitted) — everything is editable
  const revising = submitted && editing; // revising a submitted LIB → justification required for changed lines

  // Load an existing LIB when editing.
  const loaded = useRef(false);
  useEffect(() => {
    if (!editId || loaded.current) return;
    loaded.current = true;
    const found = getLib(editId);
    if (found) {
      setDoc(found);
      if (found.status !== "Draft") setMode("revise");
    } else toast.error("That LIB could not be found; starting a new one.");
  }, [editId]);

  const set = <K extends keyof LibDoc>(key: K, value: LibDoc[K]) => setDoc((d) => ({ ...d, [key]: value }));
  const setRow = (id: string, patch: Partial<LibRow>) =>
    setDoc((d) => ({ ...d, rows: d.rows.map((r) => (r.id === id ? { ...r, ...patch } : r)) }));
  const addRow = (header: boolean) =>
    setDoc((d) => ({
      ...d,
      rows: [...d.rows, { id: newRowId(), label: "", note: "", indent: header ? 1 : 2, header, approved: "", reprogramming: "", justification: "" }],
    }));
  const addSection = () =>
    setDoc((d) => {
      const count = d.rows.filter((r) => r.header && r.indent === 0).length;
      return {
        ...d,
        rows: [...d.rows, { id: newRowId(), label: `${toRoman(count + 1)}. `, note: "", indent: 0, header: true, approved: "", reprogramming: "", justification: "" }],
      };
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
      rows.splice(insertAt, 0, { id: newRowId(), label: "", note: "", indent: childIndent, header: false, approved: "", reprogramming: "", justification: "" });
      return { ...d, rows };
    });
  const removeRow = (id: string) => setDoc((d) => ({ ...d, rows: d.rows.filter((r) => r.id !== id) }));
  const categories = doc.rows.filter((r) => r.header);

  const totals = libTotals(doc.rows);
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

  function saveRevision() {
    const prev = getLib(doc.id);
    // Any line whose content changed from the last saved version must carry a justification.
    const base = new Map((prev?.rows ?? []).map((r) => [r.id, r]));
    const missing = doc.rows.filter((r) => {
      if (r.header) return false;
      const b = base.get(r.id);
      const changed = b
        ? b.approved !== r.approved || b.reprogramming !== r.reprogramming || b.label !== r.label || b.note !== r.note
        : Boolean(r.label.trim() || r.approved.trim() || r.reprogramming.trim() || r.note.trim()); // new row with content
      return changed && !(r.justification ?? "").trim();
    });
    if (missing.length > 0) {
      toast.error(`Justification is required for every line you changed (${missing.length} missing).`);
      return;
    }

    setAction("revision");
    try {
      const history = [...(doc.history ?? [])];
      if (prev) history.push({ savedAt: prev.updatedAt, status: prev.status, rows: prev.rows });
      saveLib({ ...doc, history });
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
              {submitted ? `Locked · ${doc.status}` : "Draft"}
            </span>
          )}

          <div className="ml-1 flex rounded-lg border border-border bg-background p-0.5">
            <button
              type="button"
              onClick={() => setMode(submitted ? "revise" : "edit")}
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
            {mode === "preview" && (
              <Button variant="outline" size="sm" className="gap-1.5 border-border" onClick={() => window.print()}>
                <Printer className="h-4 w-4" /> Print
              </Button>
            )}
            {submitted ? (
              <Button size="sm" className="gap-1.5" onClick={saveRevision} disabled={action !== null}>
                {action === "revision" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Save Revision
              </Button>
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
                  CY <TextField value={doc.fiscalYear} onChange={(v) => set("fiscalYear", v)} editing={editing} className="inline w-14" align="center" bold />
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
                  <div className={cn("min-w-0 flex-1", editing && "border-b border-black/20")}>
                    {key === "cooperatingAgency" || key === "projectTitle" ? (
                      <AutoTextarea value={String(doc[key])} onChange={(v) => set(key, v as LibDoc[typeof key])} editing={editing} className={key === "projectTitle" ? "underline" : ""} />
                    ) : (
                      <TextField value={String(doc[key])} onChange={(v) => set(key, v as LibDoc[typeof key])} editing={editing} />
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Budget table */}
            <table className="mt-5 w-full border-collapse">
              <colgroup>
                <col className="w-[28%]" />
                <col className="w-[16%]" />
                <col className="w-[14%]" />
                <col className="w-[14%]" />
                <col className="w-[28%]" />
              </colgroup>
              <thead>
                <tr className="align-bottom">
                  <th className={gl} />
                  <th className={gl} />
                  <th className={cn(gl, "px-1 pb-1 text-right font-bold")}>Approved LIB</th>
                  <th className={cn(gl, "px-1 pb-1 text-right font-bold")}>First Reprogramming</th>
                  <th className={cn(gl, "px-1 pb-1 text-center font-bold")}>Justification</th>
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
                    <tr key={r.id} className="group align-top">
                      <td className={cn(gl, "relative py-0.5 pr-2")}>
                        {editing && (
                          <button
                            type="button"
                            onClick={() => removeRow(r.id)}
                            title="Remove row"
                            className="no-print absolute -left-6 top-1 text-red-400 opacity-0 hover:text-red-600 group-hover:opacity-100"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                        <div className={labelCls}>
                          <TextField value={r.label} onChange={(v) => setRow(r.id, { label: v })} editing={editing} bold={r.header && r.indent === 0} />
                        </div>
                      </td>
                      <td className={cn(gl, "py-0.5 pr-2 text-[11px] italic text-black/80")}>
                        <AutoTextarea value={r.note} onChange={(v) => setRow(r.id, { note: v })} editing={editing} />
                      </td>
                      <td className={cn(gl, "px-1 py-0.5")}>
                        {!r.header && <AmountField value={r.approved} onChange={(v) => setRow(r.id, { approved: v })} editing={editing} />}
                      </td>
                      <td className={cn(gl, "px-1 py-0.5")}>
                        {!r.header && <AmountField value={r.reprogramming} onChange={(v) => setRow(r.id, { reprogramming: v })} editing={editing} />}
                      </td>
                      <td className={cn(gl, "px-1 py-0.5 align-top text-[11px] text-black/80")}>
                        {!r.header && (
                          <AutoTextarea value={r.justification ?? ""} onChange={(v) => setRow(r.id, { justification: v })} editing={editing} className="text-center text-[11px]" />
                        )}
                      </td>
                    </tr>
                  );
                })}

                {/* Totals */}
                <tr className="align-top font-bold">
                  <td className={cn(gl, "pt-3 pl-9")}>Sub-Total for MOOE</td>
                  <td className={gl} />
                  <td className={cn(gl, "px-1 pt-3 text-right tabular-nums")}>P&nbsp;&nbsp;{fmtAmount(totals.approved)}</td>
                  <td className={cn(gl, "px-1 pt-3 text-right tabular-nums")}>{fmtAmount(totals.reprogramming)}</td>
                  <td className={gl} />
                </tr>
                <tr className="align-top font-bold">
                  <td className={cn(gl, "pt-2 pl-9")}>GRAND TOTAL:</td>
                  <td className={gl} />
                  <td className={cn("px-1 pt-2 text-right tabular-nums", editing ? "border border-black/20 border-t-black" : "border-t border-black")}>P&nbsp;&nbsp;{fmtAmount(totals.approved)}</td>
                  <td className={cn("px-1 pt-2 text-right tabular-nums", editing ? "border border-black/20 border-t-black" : "border-t border-black")}>{fmtAmount(totals.reprogramming)}</td>
                  <td className={gl} />
                </tr>
              </tbody>
            </table>

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
              <TextField value={doc.chargeableNote} onChange={(v) => set("chargeableNote", v)} editing={editing} className="text-[11px]" />
            </div>

            {/* Signatories */}
            <div className="mt-8 grid grid-cols-2 gap-x-10 gap-y-8">
              <Signatory label="Prepared by:" name={doc.preparedByName} position={doc.preparedByPosition} editing={editing} onName={(v) => set("preparedByName", v)} onPosition={(v) => set("preparedByPosition", v)} />
              <Signatory label="Recommending Approval:" name={doc.recommendingName} position={doc.recommendingPosition} editing={editing} onName={(v) => set("recommendingName", v)} onPosition={(v) => set("recommendingPosition", v)} />
              <Signatory label="Certified Funds Available:" name={doc.certifiedName} position={doc.certifiedPosition} editing={editing} onName={(v) => set("certifiedName", v)} onPosition={(v) => set("certifiedPosition", v)} />
              <Signatory label="Approved by:" name={doc.approvedName} position={doc.approvedPosition} editing={editing} onName={(v) => set("approvedName", v)} onPosition={(v) => set("approvedPosition", v)} />
            </div>
          </div>

          {editing && !submitted && (
            <p className="no-print mx-auto mt-3 max-w-xl text-center text-xs text-muted-foreground">
              Type directly on the form. Highlighted fields are editable — switch to{" "}
              <span className="font-semibold text-foreground">Preview</span> for the clean, printable version.
            </p>
          )}
          {revising && (
            <p className="no-print mx-auto mt-3 max-w-2xl text-center text-xs text-muted-foreground">
              Revision mode — you can edit any field. Every line you change{" "}
              <span className="font-semibold text-foreground">requires a Justification</span> before you can save.
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
                            <th className="px-2 py-1 text-right font-medium">Reprogramming</th>
                            <th className="px-2 py-1 text-left font-medium">Justification</th>
                          </tr>
                        </thead>
                        <tbody>
                          {snap.rows.map((r) => (
                            <tr key={r.id} className="border-t border-border/60">
                              <td className={cn("px-2 py-1", r.indent === 2 && "pl-6", r.header && "font-semibold text-navy")}>{r.label}</td>
                              <td className="px-2 py-1 text-right tabular-nums">{r.header ? "" : fmtAmount(parseAmount(r.approved))}</td>
                              <td className="px-2 py-1 text-right tabular-nums">{r.header ? "" : fmtAmount(parseAmount(r.reprogramming))}</td>
                              <td className="px-2 py-1 text-muted-foreground">{r.justification ?? ""}</td>
                            </tr>
                          ))}
                          <tr className="border-t border-border font-semibold text-navy">
                            <td className="px-2 py-1">Grand Total</td>
                            <td className="px-2 py-1 text-right tabular-nums">{fmtAmount(t.approved)}</td>
                            <td className="px-2 py-1 text-right tabular-nums">{fmtAmount(t.reprogramming)}</td>
                            <td />
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
  onName,
  onPosition,
}: {
  label: string;
  name: string;
  position: string;
  editing: boolean;
  onName: (v: string) => void;
  onPosition: (v: string) => void;
}) {
  return (
    <div>
      <p className="text-[11px]">{label}</p>
      <div className="mt-8">
        <div className={cn("font-bold", editing && "border-b border-black/20")}>
          <TextField value={name} onChange={onName} editing={editing} bold />
        </div>
        <div className={cn("text-[11px]", editing && "border-b border-black/20")}>
          <TextField value={position} onChange={onPosition} editing={editing} className="text-[11px]" />
        </div>
      </div>
    </div>
  );
}
