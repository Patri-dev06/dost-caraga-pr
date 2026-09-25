import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BookOpen, ChevronDown, FileText, Paperclip } from "lucide-react";
import { Card } from "@/components/ui/card";
import { apiGetPrSupportingDocuments, type PrSupportingDocument } from "@/lib/api";
import { fmtAmount } from "@/lib/lib-store";
import { cn } from "@/lib/utils";

type PpmpLine = { item_name?: string; general_description?: string; expense_category?: string; quantity?: number; recommended_mode?: string; procurement_start?: string; procurement_end?: string; estimated_budget?: number };
type LibLine = { label?: string; note?: string; indent?: number; header?: boolean; approved?: number; current?: number };

const dateText = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("en-PH", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }) : "";

/**
 * The PR's Supplementary Documents (SD): the PPMP it is charged to and the LIB behind it, attached
 * as frozen copies when the PR was submitted, so approvers see exactly what it was filed against.
 * Which other SDs a PR needs is still to be clarified — see App\Services\PrSupportingDocuments.
 */
export function PrSupportingDocuments({ prId, submitted }: { prId: string; submitted: boolean }) {
  const { data = [], isLoading, error } = useQuery({
    queryKey: ["pr-supporting-documents", prId],
    queryFn: () => apiGetPrSupportingDocuments(prId),
  });

  if (isLoading) return <Card className="border border-border p-6 text-sm text-muted-foreground">Fetching data, kindly wait.</Card>;
  if (error) return <Card className="border border-border p-6 text-sm text-muted-foreground">{error instanceof Error ? error.message : "Unable to load supporting documents."}</Card>;

  if (data.length === 0) {
    return (
      <Card className="border border-dashed border-border bg-secondary/20 p-10 text-center">
        <Paperclip className="mx-auto mb-2 h-6 w-6 text-muted-foreground/60" />
        <p className="text-sm font-semibold text-navy">No supporting documents attached</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {submitted
            ? "This PR was submitted before supporting documents were attached automatically, or it is not charged to a PPMP."
            : "The PPMP this PR is charged to, and the LIB behind it, are attached automatically when the PR is submitted."}
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Attached when the PR was submitted, as copies of the documents at that time. A later revision of the PPMP does not change them.
      </p>
      {data.map((sd) => (
        <SupportingDocumentCard key={sd.id} sd={sd} />
      ))}
    </div>
  );
}

function SupportingDocumentCard({ sd }: { sd: PrSupportingDocument }) {
  const [open, setOpen] = useState(false);
  const Icon = sd.type === "LIB" ? BookOpen : FileText;

  return (
    <Card className="overflow-hidden border border-border">
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-start gap-3 p-4 text-left hover:bg-secondary/30" aria-expanded={open}>
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-navy">
            <span className="mr-1.5 rounded bg-secondary px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-muted-foreground">SD · {sd.type}</span>
            {sd.reference}
          </p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {sd.typeLabel}
            {sd.title ? ` · ${sd.title}` : ""}
          </p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Attached {dateText(sd.attachedAt)}
            {sd.attachedBy ? ` by ${sd.attachedBy}` : ""}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-sm font-semibold tabular-nums text-navy">₱{fmtAmount(sd.total)}</p>
          <ChevronDown className={cn("ml-auto mt-1 h-4 w-4 text-muted-foreground transition-transform", open && "rotate-180")} />
        </div>
      </button>
      {open && <div className="border-t border-border">{sd.type === "LIB" ? <LibCopy snapshot={sd.snapshot} /> : <PpmpCopy snapshot={sd.snapshot} />}</div>}
    </Card>
  );
}

function Facts({ facts }: { facts: [string, unknown][] }) {
  const shown = facts.filter(([, v]) => v !== null && v !== undefined && v !== "");
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-2 px-4 py-3 text-xs sm:grid-cols-4">
      {shown.map(([label, value]) => (
        <div key={label} className="min-w-0">
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="truncate font-medium text-navy">{String(value)}</dd>
        </div>
      ))}
    </dl>
  );
}

function PpmpCopy({ snapshot }: { snapshot: Record<string, unknown> }) {
  const items = (snapshot.items as PpmpLine[] | undefined) ?? [];
  return (
    <div>
      <Facts
        facts={[
          ["Fiscal year", snapshot.fiscal_year],
          ["Type", snapshot.document_type],
          ["Class", snapshot.ppmp_class],
          ["End-user unit", snapshot.end_user_unit],
          ["Status when attached", snapshot.status],
          ["Prepared by", snapshot.prepared_by],
          ["Funds certified by", snapshot.certified_by],
          ["Certified on", snapshot.certified_date],
        ]}
      />
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="bg-secondary/40 text-left text-muted-foreground">
              <th className="px-4 py-2 font-semibold">Item</th>
              <th className="px-2 py-2 font-semibold">Category</th>
              <th className="px-2 py-2 text-right font-semibold">Qty</th>
              <th className="px-2 py-2 font-semibold">Mode</th>
              <th className="px-2 py-2 font-semibold">Schedule</th>
              <th className="px-4 py-2 text-right font-semibold">Estimated budget</th>
            </tr>
          </thead>
          <tbody>
            {items.map((line, i) => (
              <tr key={i} className="border-t border-border">
                <td className="px-4 py-1.5 font-medium text-navy">{line.item_name || line.general_description}</td>
                <td className="px-2 py-1.5 text-muted-foreground">{line.expense_category}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{line.quantity}</td>
                <td className="px-2 py-1.5">{line.recommended_mode}</td>
                <td className="px-2 py-1.5 whitespace-nowrap">{[line.procurement_start, line.procurement_end].filter(Boolean).join(" – ")}</td>
                <td className="px-4 py-1.5 text-right tabular-nums">₱{fmtAmount(Number(line.estimated_budget ?? 0))}</td>
              </tr>
            ))}
            <tr className="border-t border-border bg-secondary/30 font-semibold">
              <td colSpan={5} className="px-4 py-2 text-right">Total</td>
              <td className="px-4 py-2 text-right tabular-nums text-navy">₱{fmtAmount(Number(snapshot.total ?? 0))}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

function LibCopy({ snapshot }: { snapshot: Record<string, unknown> }) {
  const rows = (snapshot.rows as LibLine[] | undefined) ?? [];
  const reprogrammed = rows.some((r) => (r.current ?? 0) !== (r.approved ?? 0));
  return (
    <div>
      <Facts
        facts={[
          ["Program", snapshot.program_title],
          ["Calendar year", snapshot.fiscal_year],
          ["Project leader", snapshot.project_leader],
          ["Implementing agency", snapshot.implementing_agency],
          ["Duration", snapshot.total_duration],
          ["Status when attached", snapshot.status],
          ["Approved by", snapshot.approved_by],
          ["Reprogramming", Number(snapshot.revision ?? 0) > 0 ? `Revision ${snapshot.revision}` : "None"],
        ]}
      />
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="bg-secondary/40 text-left text-muted-foreground">
              <th className="px-4 py-2 font-semibold">Line item</th>
              <th className="px-4 py-2 text-right font-semibold">Approved</th>
              {reprogrammed && <th className="px-4 py-2 text-right font-semibold">After reprogramming</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} className={cn("border-t border-border", row.header && "bg-secondary/20 font-semibold")}>
                <td className="px-4 py-1.5 text-navy" style={{ paddingLeft: `${1 + (row.indent ?? 0) * 1.25}rem` }}>
                  {row.label}
                  {row.note && <span className="ml-1 font-normal text-muted-foreground">({row.note})</span>}
                </td>
                <td className="px-4 py-1.5 text-right tabular-nums">{row.approved ? `₱${fmtAmount(row.approved)}` : ""}</td>
                {reprogrammed && <td className="px-4 py-1.5 text-right tabular-nums">{row.current ? `₱${fmtAmount(row.current)}` : ""}</td>}
              </tr>
            ))}
            <tr className="border-t border-border bg-secondary/30 font-semibold">
              <td className="px-4 py-2 text-right">Total</td>
              <td className="px-4 py-2 text-right tabular-nums text-navy">₱{fmtAmount(Number(snapshot.total ?? 0))}</td>
              {reprogrammed && <td />}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
