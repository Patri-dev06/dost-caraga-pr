import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { ExternalLink, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { StatusBadge } from "@/components/app/status-badge";
import type { MonitoringRow } from "@/lib/api";
import { MONITORING_COLUMNS, MONITORING_COLUMN_SECTIONS, splitEntries } from "@/lib/monitoring-columns";
import { cn } from "@/lib/utils";

/**
 * One PR's whole Monitoring Sheet row, readable at once: every column grouped by where it sits in
 * the flow (PR, RFQ, AOC, PO, delivery, inspection, issuance, payment), nothing cut off. Empty
 * fields are folded away unless asked for.
 */
export function MonitoringEntryPanel({
  row,
  onClose,
  onEdit,
}: {
  row: MonitoringRow | null;
  onClose: () => void;
  onEdit?: (row: MonitoringRow) => void;
}) {
  const [showEmpty, setShowEmpty] = useState(false);

  return (
    <Sheet open={row !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-xl">
        {row && (
          <>
            <SheetHeader className="shrink-0 border-b border-border px-5 py-4 pr-12 text-left">
              <div className="flex flex-wrap items-center gap-2">
                <SheetTitle className="text-navy">{row.prNo ?? `PR #${row.prId}`}</SheetTitle>
                {row.prStatus && <StatusBadge status={row.prStatus} />}
              </div>
              <SheetDescription className="line-clamp-2">{row.purpose || "No purpose stated"}</SheetDescription>
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <Button asChild size="sm" variant="outline" className="h-8 gap-1.5 border-border">
                  <Link to="/purchase-requests/$prId" params={{ prId: row.prId }}>
                    <ExternalLink className="h-3.5 w-3.5" /> Open PR
                  </Link>
                </Button>
                {row.canEdit && onEdit && (
                  <Button size="sm" className="h-8 gap-1.5" onClick={() => onEdit(row)}>
                    <Pencil className="h-3.5 w-3.5" /> Edit entry
                  </Button>
                )}
                <label className="ml-auto flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
                  <input type="checkbox" checked={showEmpty} onChange={(e) => setShowEmpty(e.target.checked)} className="h-3.5 w-3.5 accent-primary" />
                  Show empty fields
                </label>
              </div>
            </SheetHeader>

            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-5 py-4">
              {MONITORING_COLUMN_SECTIONS.map((section) => {
                const fields = MONITORING_COLUMNS.filter((c) => c.section === section).map((c) => ({ column: c, value: c.get(row) }));
                const shown = showEmpty ? fields : fields.filter((f) => f.value);
                return (
                  <section key={section}>
                    <p className="mb-1.5 flex items-baseline justify-between text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {section}
                      <span className="font-normal normal-case tabular-nums">{fields.filter((f) => f.value).length} of {fields.length} filled</span>
                    </p>
                    {shown.length === 0 ? (
                      <p className="rounded-md border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">Nothing recorded yet.</p>
                    ) : (
                      <dl className="divide-y divide-border rounded-md border border-border">
                        {shown.map(({ column, value }, i) => (
                          <div key={i} className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-3 px-3 py-2 text-sm">
                            <dt className="text-xs text-muted-foreground">
                              {column.label}
                              {column.field && <span className="ml-1 text-[10px] text-primary/70" title="Kept by the Supply team">•</span>}
                            </dt>
                            <dd className={cn("min-w-0 break-words", value ? "text-navy" : "text-muted-foreground/60")}>
                              {!value ? (
                                "—"
                              ) : column.list ? (
                                <ul className="space-y-0.5">
                                  {splitEntries(value).map((entry, j) => <li key={j}>{entry}</li>)}
                                </ul>
                              ) : (
                                <span className="whitespace-pre-wrap">{value}</span>
                              )}
                            </dd>
                          </div>
                        ))}
                      </dl>
                    )}
                  </section>
                );
              })}
              <p className="text-[11px] text-muted-foreground"><span className="text-primary/70">•</span> Kept by the Supply team; the rest are filled in by the system.</p>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
