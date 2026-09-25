import { Link } from "@tanstack/react-router";
import { Pencil } from "lucide-react";
import type { MonitoringRow } from "@/lib/api";
import { MONITORING_COLUMNS } from "@/lib/monitoring-columns";
import { cn } from "@/lib/utils";

/**
 * The Procurement Monitoring Sheet's table, on the Purchase Requests page. With `onEdit`, rows the
 * viewer may edit get a leading pencil that opens the Supply team's editor.
 */
export function MonitoringTable({
  rows,
  emptyMessage = "No Purchase Requests yet.",
  onEdit,
}: {
  rows: MonitoringRow[];
  emptyMessage?: string;
  onEdit?: (row: MonitoringRow) => void;
}) {
  const editable = onEdit !== undefined && rows.some((r) => r.canEdit);

  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card">
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="bg-secondary/40">
            {editable && <th className="sticky left-0 z-10 w-9 border-b border-r border-border bg-secondary px-1 py-2" aria-label="Edit" />}
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
          {rows.length === 0 && (
            <tr>
              <td colSpan={MONITORING_COLUMNS.length + (editable ? 1 : 0)} className="px-4 py-8 text-center text-muted-foreground">
                {emptyMessage}
              </td>
            </tr>
          )}
          {rows.map((row) => (
            <tr key={row.prId} className="group hover:bg-secondary/20">
              {editable && (
                <td className="sticky left-0 z-10 border-b border-r border-border bg-card px-1 py-1 text-center group-hover:bg-secondary">
                  {row.canEdit && (
                    <button
                      type="button"
                      onClick={() => onEdit?.(row)}
                      className="inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-primary/10 hover:text-primary"
                      title={`Edit ${row.prNo ?? "entry"}`}
                      aria-label={`Edit ${row.prNo ?? "entry"}`}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                  )}
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
                    className={cn("max-w-[16rem] truncate border-b border-r border-border px-2 py-1.5 last:border-r-0", c.field && "bg-muted/10")}
                    title={value || undefined}
                  >
                    {value}
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
