import { Link } from "@tanstack/react-router";
import { Eye, Pencil, SearchX } from "lucide-react";
import type { MonitoringRow } from "@/lib/api";
import { MONITORING_COLUMNS } from "@/lib/monitoring-columns";
import { MonitoringCell } from "@/components/app/monitoring-cell";
import { cn } from "@/lib/utils";

/**
 * The Procurement Monitoring Sheet's table, on the Purchase Requests page. Every row gets a leading
 * "view" button that opens the whole entry (`onView`); rows the viewer may edit also get the Supply
 * team's pencil (`onEdit`). Long and list cells open their full text on click.
 */
export function MonitoringTable({
  rows,
  emptyMessage = "No Purchase Requests yet.",
  emptyHint,
  onEdit,
  onView,
}: {
  rows: MonitoringRow[];
  emptyMessage?: string;
  emptyHint?: string;
  onEdit?: (row: MonitoringRow) => void;
  onView?: (row: MonitoringRow) => void;
}) {
  // Nothing to show: a small centered note in the card — not a cell stretched across 60 columns.
  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card px-4 py-12 text-center">
        <SearchX className="mb-2 h-6 w-6 text-muted-foreground/60" strokeWidth={1.5} />
        <p className="text-sm font-medium text-navy">{emptyMessage}</p>
        {emptyHint && <p className="mt-1 text-xs text-muted-foreground">{emptyHint}</p>}
      </div>
    );
  }

  const editable = onEdit !== undefined && rows.some((r) => r.canEdit);
  const actions = onView !== undefined || editable;

  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card">
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="bg-secondary/40">
            {actions && <th className="sticky left-0 z-10 border-b border-r border-border bg-secondary px-1 py-2" aria-label="Actions" />}
            {MONITORING_COLUMNS.map((c, i) => (
              <th
                key={i}
                className={cn(
                  "whitespace-nowrap border-b border-r border-border px-2 py-2 text-left font-semibold uppercase tracking-wide text-muted-foreground last:border-r-0",
                  c.field && "bg-muted/40",
                )}
                title={c.field ? "Kept by the Supply team" : "Filled in by the system"}
              >
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.prId} className="group align-top hover:bg-secondary/20">
              {actions && (
                <td className="sticky left-0 z-10 border-b border-r border-border bg-card px-1 py-1 group-hover:bg-secondary">
                  <div className="flex items-center gap-0.5">
                    {onView && (
                      <button
                        type="button"
                        onClick={() => onView(row)}
                        className="inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-primary/10 hover:text-primary"
                        title={`View the whole entry for ${row.prNo ?? "this PR"}`}
                        aria-label={`View ${row.prNo ?? "entry"}`}
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </button>
                    )}
                    {editable && (
                      row.canEdit ? (
                        <button
                          type="button"
                          onClick={() => onEdit?.(row)}
                          className="inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-primary/10 hover:text-primary"
                          title={`Edit ${row.prNo ?? "entry"}`}
                          aria-label={`Edit ${row.prNo ?? "entry"}`}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                      ) : (
                        <span className="inline-block h-6 w-6" />
                      )
                    )}
                  </div>
                </td>
              )}
              {MONITORING_COLUMNS.map((c, i) => {
                const value = c.get(row);
                // PR No. (column index 3) is the click-through into that PR's own detail page.
                if (i === 3) {
                  return (
                    <td key={i} className="max-w-[16rem] truncate border-b border-r border-border px-2 py-1.5 font-semibold text-navy last:border-r-0">
                      <Link to="/purchase-requests/$prId" params={{ prId: row.prId }} className="hover:underline">
                        {value || row.prId}
                      </Link>
                    </td>
                  );
                }
                return (
                  <td
                    key={i}
                    className={cn("max-w-[16rem] border-b border-r border-border px-2 py-1.5 last:border-r-0", c.field && "bg-muted/10")}
                  >
                    <MonitoringCell value={value} label={c.label} list={c.list} />
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
