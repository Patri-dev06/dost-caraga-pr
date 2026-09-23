import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useState } from "react";
import { Download, FilePlus2, Filter } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader } from "@/components/app/page-header";
import { ListPagination } from "@/components/app/list-pagination";
import { apiGetPurchaseRequestMonitoringPage } from "@/lib/api";
import { exportMonitoringSheetExcel } from "@/lib/monitoring-excel";
import { MONITORING_COLUMNS } from "@/lib/monitoring-columns";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";

const PER_PAGE = 20;

export const Route = createFileRoute("/purchase-requests")({
  head: () => ({
    meta: [
      { title: "Purchase Requests — DOST Caraga" },
      { name: "description", content: "Every Purchase Request traced through RFQ, AOC and PO, in the Supply Unit's monitoring sheet format." },
    ],
  }),
  component: PRListPage,
});

function PRListPage() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [page, setPage] = useState(1);
  const [exporting, setExporting] = useState(false);
  // Never the whole table: one page at a time, so the list stays fast no matter how many PRs pile up.
  const { data, isLoading, error } = useQuery({
    queryKey: ["purchase-requests-monitoring", page],
    queryFn: () => apiGetPurchaseRequestMonitoringPage(page, PER_PAGE),
  });
  const rows = data?.items ?? [];

  async function handleExport() {
    setExporting(true);
    try {
      // Always pulls the full sheet fresh, page by page, so the file matches what "Export"
      // implies — everything — without ever holding more than one page's worth in memory.
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

  if (pathname !== "/purchase-requests") {
    return <Outlet />;
  }

  return (
    <div className="mx-auto w-full max-w-[100rem] space-y-5 px-3 py-4 sm:space-y-6 sm:px-6 sm:py-8 lg:px-8">
      <PageHeader
        eyebrow="Procurement"
        title="Purchase Requests"
        subtitle="Every Purchase Request traced through RFQ, AOC and PO. Columns for delivery, inspection & acceptance, issuance and payment are listed but not yet tracked by the system, so they stay blank."
        actions={
          <>
            <Button variant="outline" className="gap-2 border-border" onClick={handleExport} disabled={exporting}>
              <Download className="h-4 w-4" /> {exporting ? "Exporting…" : "Export"}
            </Button>
            <Button asChild className="gap-2"><Link to="/purchase-requests/new"><FilePlus2 className="h-4 w-4" /> Create PR</Link></Button>
          </>
        }
      />

      <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-center">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search PR No., office, project…" className="h-9 min-w-0 border-border bg-background sm:max-w-xs" />
        </div>
        <div className="grid grid-cols-1 gap-2 min-[430px]:grid-cols-3 sm:flex sm:flex-wrap">
          <Select defaultValue="all">
            <SelectTrigger className="h-9 w-full border-border sm:w-[160px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="pending">Pending Validation</SelectItem>
              <SelectItem value="approval">For Approval</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="returned">Returned</SelectItem>
            </SelectContent>
          </Select>
          <Select defaultValue="all">
            <SelectTrigger className="h-9 w-full border-border sm:w-[140px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Funds</SelectItem>
              <SelectItem value="gaa">GAA</SelectItem>
              <SelectItem value="trust">Trust</SelectItem>
              <SelectItem value="special">Special</SelectItem>
            </SelectContent>
          </Select>
          <Select defaultValue="2026">
            <SelectTrigger className="h-9 w-full border-border sm:w-[110px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="2026">FY 2026</SelectItem>
              <SelectItem value="2025">FY 2025</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {error && <div className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">{error instanceof Error ? error.message : "Unable to load purchase requests."}</div>}
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

          {data && <ListPagination page={page} lastPage={data.lastPage} total={data.total} onPageChange={setPage} />}
        </>
      )}
    </div>
  );
}
