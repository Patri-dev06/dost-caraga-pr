import { Link } from "@tanstack/react-router";
import type { MonitoringRow } from "@/lib/api";
import { MONITORING_COLUMNS } from "@/lib/monitoring-columns";
import { cn } from "@/lib/utils";

/**
 * The Procurement Monitoring Sheet's table — shared by the full Purchase Requests page and the
 * dashboard's preview of it, so both always render the same columns in the same order.
 */
export function MonitoringTable({ rows, emptyMessage = "No Purchase Requests yet." }: { rows: MonitoringRow[]; emptyMessage?: string }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card">
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="bg-secondary/40">
            {MONITORING_COLUMNS.map((c, i) => (
              <th
                key={i}
                className={cn(
                  "whitespace-nowrap border-b border-r border-border px-2 py-2 text-left font-semibold uppercase tracking-wide text-muted-foreground last:border-r-0",
                  !c.tracked && "bg-muted/40",
                )}
                title={!c.tracked ? "Not tracked by the system yet" : undefined}
              >
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={MONITORING_COLUMNS.length} className="px-4 py-8 text-center text-muted-foreground">
                {emptyMessage}
              </td>
            </tr>
          )}
          {rows.map((row) => (
            <tr key={row.prId} className="hover:bg-secondary/20">
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
                    className={cn(
                      "max-w-[16rem] truncate border-b border-r border-border px-2 py-1.5 last:border-r-0",
                      !c.tracked && "bg-muted/20 text-muted-foreground/50",
                    )}
                    title={value || undefined}
                  >
                    {value || (c.tracked ? "" : "—")}
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
