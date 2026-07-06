import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ArrowLeft, Eye, FileSpreadsheet, Loader2, Pencil, Plus, Printer, Save, Send, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
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
      className={cn(shared, "rounded-sm border border-black/15 px-0.5 outline-none placeholder:italic placeholder:text-black/30 hover:bg-amber-50 focus:border-amber-300 focus:bg-amber-100")}
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
      className={cn(shared, "rounded-sm border border-black/15 px-0.5 outline-none hover:bg-amber-50 focus:border-amber-300 focus:bg-amber-100")}
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
      className={cn("w-full resize-none overflow-hidden rounded-sm border border-black/15 bg-transparent px-0.5 leading-snug outline-none hover:bg-amber-50 focus:border-amber-300 focus:bg-amber-100", className)}
    />
  );
}

/* ------------------------------------- Page ------------------------------------- */

function LibForm() {
  const navigate = useNavigate();
  const { edit: editId } = Route.useSearch();
  const isEditing = Boolean(editId);

  const [mode, setMode] = useState<"edit" | "preview">("edit");
  const editing = mode === "edit";

  const [doc, setDoc] = useState<LibDoc>(() => newLibDoc());
  const [action, setAction] = useState<LibStatus | "draft" | null>(null);

  // Load an existing LIB when editing.
  const loaded = useRef(false);
  useEffect(() => {
    if (!editId || loaded.current) return;
    loaded.current = true;
    const found = getLib(editId);
    if (found) setDoc(found);
    else toast.error("That LIB could not be found; starting a new one.");
  }, [editId]);

  const set = <K extends keyof LibDoc>(key: K, value: LibDoc[K]) => setDoc((d) => ({ ...d, [key]: value }));
  const setRow = (id: string, patch: Partial<LibRow>) =>
    setDoc((d) => ({ ...d, rows: d.rows.map((r) => (r.id === id ? { ...r, ...patch } : r)) }));
  const addRow = (header: boolean) =>
    setDoc((d) => ({
      ...d,
      rows: [...d.rows, { id: newRowId(), label: "", note: "", indent: header ? 1 : 2, header, approved: "", reprogramming: "" }],
    }));
  const removeRow = (id: string) => setDoc((d) => ({ ...d, rows: d.rows.filter((r) => r.id !== id) }));

  const totals = libTotals(doc.rows);

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

  function handleExport() {
    exportLibExcel(doc).catch(() => toast.error("Unable to export to Excel."));
  }

  return (
    <div className="min-h-full bg-background">
      {/* Toolbar */}
      <div className="no-print sticky top-0 z-10 border-b border-border bg-card/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-2 px-3 py-3 sm:px-6">
          <Button variant="ghost" size="sm" asChild className="gap-1.5 text-muted-foreground">
            <Link to="/planning/lib">
              <ArrowLeft className="h-4 w-4" /> Back
            </Link>
          </Button>

          {isEditing && (
            <span className="hidden rounded-md bg-secondary px-2 py-1 text-xs font-semibold text-secondary-foreground sm:inline">
              Editing · {doc.status}
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

          <div className="ml-auto flex items-center gap-2">
            <Button variant="outline" size="sm" className="gap-1.5 border-border" onClick={handleExport}>
              <FileSpreadsheet className="h-4 w-4" /> Export Excel
            </Button>
            {!editing && (
              <Button variant="outline" size="sm" className="gap-1.5 border-border" onClick={() => window.print()}>
                <Printer className="h-4 w-4" /> Print
              </Button>
            )}
            <Button variant="outline" size="sm" className="gap-1.5 border-border" onClick={() => persist("Draft")} disabled={action !== null}>
              {action === "draft" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {isEditing ? "Save Changes" : "Save as Draft"}
            </Button>
            <Button size="sm" className="gap-1.5" onClick={() => persist("Pending Supervisor Review")} disabled={action !== null}>
              {action === "Pending Supervisor Review" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Submit for Approval
            </Button>
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
              <p className="absolute right-0 top-0 text-[11px] font-semibold">DOST Form 4</p>
              <div className="text-center">
                <p className="text-[11px] font-bold tracking-wide">DEPARTMENT OF SCIENCE AND TECHNOLOGY</p>
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
                  <div className="min-w-0 flex-1">
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
                <col className="w-[42%]" />
                <col className="w-[24%]" />
                <col className="w-[17%]" />
                <col className="w-[17%]" />
              </colgroup>
              <thead>
                <tr className="align-bottom">
                  <th />
                  <th />
                  <th className="pb-1 text-right font-bold">Approved LIB</th>
                  <th className="pb-1 text-right font-bold">First Reprogramming</th>
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
                      <td className="relative py-0.5 pr-2">
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
                      <td className="py-0.5 pr-2 text-[11px] italic text-black/80">
                        <AutoTextarea value={r.note} onChange={(v) => setRow(r.id, { note: v })} editing={editing} />
                      </td>
                      <td className="py-0.5 pl-2">
                        {!r.header && <AmountField value={r.approved} onChange={(v) => setRow(r.id, { approved: v })} editing={editing} />}
                      </td>
                      <td className="py-0.5 pl-2">
                        {!r.header && <AmountField value={r.reprogramming} onChange={(v) => setRow(r.id, { reprogramming: v })} editing={editing} />}
                      </td>
                    </tr>
                  );
                })}

                {/* Totals */}
                <tr className="align-top font-bold">
                  <td className="pt-3 pl-9">Sub-Total for MOOE</td>
                  <td />
                  <td className="pt-3 text-right tabular-nums">P&nbsp;&nbsp;{fmtAmount(totals.approved)}</td>
                  <td className="pt-3 text-right tabular-nums">{fmtAmount(totals.reprogramming)}</td>
                </tr>
                <tr className="align-top font-bold">
                  <td className="pt-2 pl-9">GRAND TOTAL:</td>
                  <td />
                  <td className="border-t border-black pt-2 text-right tabular-nums">P&nbsp;&nbsp;{fmtAmount(totals.approved)}</td>
                  <td className="border-t border-black pt-2 text-right tabular-nums">{fmtAmount(totals.reprogramming)}</td>
                </tr>
              </tbody>
            </table>

            {editing && (
              <div className="no-print mt-2 flex gap-2">
                <Button variant="outline" size="sm" onClick={() => addRow(false)} className="h-7 gap-1.5 border-border" style={{ fontFamily: "var(--font-sans)" }}>
                  <Plus className="h-3.5 w-3.5" /> Add Line
                </Button>
                <Button variant="outline" size="sm" onClick={() => addRow(true)} className="h-7 gap-1.5 border-border" style={{ fontFamily: "var(--font-sans)" }}>
                  <Plus className="h-3.5 w-3.5" /> Add Category
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

          {editing && (
            <p className="no-print mx-auto mt-3 max-w-xl text-center text-xs text-muted-foreground">
              Type directly on the form. Highlighted fields are editable — switch to{" "}
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
      <div className="mt-8 border-black">
        <div className="font-bold">
          <TextField value={name} onChange={onName} editing={editing} bold />
        </div>
        <div className="text-[11px]">
          <TextField value={position} onChange={onPosition} editing={editing} className="text-[11px]" />
        </div>
      </div>
    </div>
  );
}
