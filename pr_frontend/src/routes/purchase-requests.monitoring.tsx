import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowLeft, Download } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/app/page-header";
import { ListPagination } from "@/components/app/list-pagination";
import { apiGetPurchaseRequestMonitoringPage } from "@/lib/api";
import { exportMonitoringSheetExcel } from "@/lib/monitoring-excel";
import { MONITORING_COLUMNS } from "@/lib/monitoring-columns";
import { cn } from "@/lib/utils";

const PER_PAGE = 20;

export const Route = createFileRoute("/purchase-requests/monitoring")({
  head: () => ({
    meta: [
      { title: "Monitoring Sheet — DOST Caraga" },
      { name: "description", content: "The Purchase Request through PO, delivery, inspection, issuance and payment, one row per PR." },
    ],
  }),
  component: MonitoringSheetPage,
});

function MonitoringSheetPage() {
  const [page, setPage] = useState(1);
  const [exporting, setExporting] = useState(false);
  // Never the whole PR table: one page at a time, same as every other list in the system.
  const { data, isLoading, error } = useQuery({
    queryKey: ["purchase-requests-monitoring", page],
    queryFn: () => apiGetPurchaseRequestMonitoringPage(page, PER_PAGE),
  });
  const rows = data?.items ?? [];

  async function handleExport() {
    setExporting(true);
    try {
      // The export always pulls the full sheet fresh (not just this page), page by page, so the
      // file matches what "Export" implies — everything — without ever holding more than one
      // page's worth of PRs in memory at a time.
      const all: typeof rows = [];
      let p = 1;
      while (true) {
        const chunk = await apiGetPurchaseRequestMonitoringPage(p, 100);
        all.push(...chunk.items);
        if (p >= chunk.lastPage) break;
        p += 1;
      }
      await exportMonitoringSheetExcel(all, "monitoring-sheet");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unable to export the monitoring sheet.");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-[100rem] space-y-5 px-3 py-4 sm:space-y-6 sm:px-6 sm:py-8 lg:px-8">
      <Button asChild variant="ghost" size="sm" className="-ml-2 gap-1 text-muted-foreground hover:text-navy">
        <Link to="/purchase-requests"><ArrowLeft className="h-4 w-4" /> Back to Purchase Requests</Link>
      </Button>

      <PageHeader
        eyebrow="Procurement"
        title="Monitoring Sheet"
        subtitle="Every Purchase Request traced through RFQ, AOC and PO. Columns for delivery, inspection & acceptance, issuance and payment are listed but not yet tracked by the system, so they stay blank."
        actions={
          <Button variant="outline" className="gap-2 border-border" onClick={handleExport} disabled={exporting}>
            <Download className="h-4 w-4" /> {exporting ? "Exporting…" : "Export"}
          </Button>
        }
      />

      {error && (
        <div className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
          {error instanceof Error ? error.message : "Unable to load the monitoring sheet."}
        </div>
      )}

      {isLoading ? (
        <div className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">Fetching data, kindly wait.</div>
      ) : (
        <>
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
                      No Purchase Requests yet.
                    </td>
                  </tr>
                )}
                {rows.map((row) => (
                  <tr key={row.prId} className="hover:bg-secondary/20">
                    {MONITORING_COLUMNS.map((c, i) => {
                      const value = c.get(row);
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

          {data && <ListPagination page={page} lastPage={data.lastPage} total={data.total} onPageChange={setPage} />}
        </>
      )}
    </div>
  );
}
