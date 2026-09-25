import { createFileRoute, Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Download, FilePlus2, Search, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader } from "@/components/app/page-header";
import { ListPagination } from "@/components/app/list-pagination";
import { MonitoringTable } from "@/components/app/monitoring-table";
import { MonitoringEntryDialog } from "@/components/app/monitoring-entry-dialog";
import { PeriodFilter } from "@/components/app/period-filter";
import { currentPeriodValue, periodText, type PeriodValue } from "@/lib/period";
import { apiGetPurchaseRequestMonitoringPage, type MonitoringFilters, type MonitoringRow } from "@/lib/api";
import { exportMonitoringSheetExcel } from "@/lib/monitoring-excel";
import { PR_STAGE_LABELS } from "@/lib/pr-stages";
import { useQuery } from "@tanstack/react-query";

const PER_PAGE = 20;

const STATUSES = ["Draft", "For Recommendation", "For Approval", "Approved", "Returned", "Rejected", "Cancelled"];

/** "on Sep 14, 2026" / "in September 2026" / "in 2026" / "in total" — for the count line. */
function periodPhrase(value: PeriodValue): string {
  if (value.period === "all") return "in total";
  return `${value.period === "day" ? "on" : "in"} ${periodText(value)}`;
}

export const Route = createFileRoute("/purchase-requests")({
  head: () => ({
    meta: [
      { title: "Purchase Requests — DOST Caraga" },
      { name: "description", content: "Every Purchase Request traced through RFQ, AOC and PO, in the Supply Unit's monitoring sheet format." },
    ],
  }),
  // `?stage=` narrows the sheet to one step of the flow — how the dashboard's stage counts link here.
  validateSearch: (search: Record<string, unknown>): { stage?: string } => ({
    stage: typeof search.stage === "string" && search.stage in PR_STAGE_LABELS ? search.stage : undefined,
  }),
  component: PRListPage,
});

function PRListPage() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { stage } = Route.useSearch();
  const navigate = useNavigate({ from: "/purchase-requests" });
  const [page, setPage] = useState(1);
  const [exporting, setExporting] = useState(false);
  const [editing, setEditing] = useState<MonitoringRow | null>(null);

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [period, setPeriod] = useState<PeriodValue>(() => currentPeriodValue());

  // Search as the user types, but only ask the server once they pause.
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const filters: MonitoringFilters = {
    search: search || undefined,
    status: status === "all" ? undefined : status,
    stage,
    date: period.period === "day" ? period.date : undefined,
    month: period.period === "month" ? period.month : undefined,
    year: period.period === "year" ? period.year : undefined,
  };
  const filtered = Boolean(filters.search || filters.status || stage || period.period !== "all");

  function clearStage() {
    void navigate({ search: {} });
    setPage(1);
  }

  // Every filter change starts again from the first page.
  function change<T>(set: (value: T) => void) {
    return (value: T) => {
      set(value);
      setPage(1);
    };
  }

  function resetFilters() {
    setSearchInput("");
    setSearch("");
    setStatus("all");
    setPeriod(currentPeriodValue());
    if (stage) void navigate({ search: {} });
    setPage(1);
  }

  // Never the whole table: one page at a time, so the list stays fast no matter how many PRs pile up.
  const { data, isLoading, error } = useQuery({
    queryKey: ["purchase-requests-monitoring", page, filters],
    queryFn: () => apiGetPurchaseRequestMonitoringPage(page, PER_PAGE, filters),
    placeholderData: (previous) => previous,
  });
  const rows = data?.items ?? [];

  async function handleExport() {
    setExporting(true);
    try {
      // Pulls every page of the sheet fresh, under the same filters as on screen, so the file
      // holds exactly the rows the count line promises — not just the page being viewed.
      const all: typeof rows = [];
      let p = 1;
      while (true) {
        const chunk = await apiGetPurchaseRequestMonitoringPage(p, 100, filters);
        all.push(...chunk.items);
        if (p >= chunk.lastPage) break;
        p += 1;
      }
      const suffix = filters.date ?? filters.month ?? filters.year;
      await exportMonitoringSheetExcel(all, suffix ? `monitoring-sheet-${suffix}` : "monitoring-sheet");
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
        subtitle="Every Purchase Request traced through RFQ, AOC and PO. The system fills in each PR's trail; the Supply team keeps the ORS/BURS, delivery, inspection, issuance and payment columns up to date with the pencil on each row."
        actions={
          <>
            <Button variant="outline" className="gap-2 border-border" onClick={handleExport} disabled={exporting}>
              <Download className="h-4 w-4" /> {exporting ? "Exporting…" : "Export"}
            </Button>
            <Button asChild className="gap-2"><Link to="/purchase-requests/new"><FilePlus2 className="h-4 w-4" /> Create PR</Link></Button>
          </>
        }
      />

      <div className="space-y-3 rounded-xl border border-border bg-card p-3 sm:p-4">
        {/* Search, status and period side by side; on a phone, search takes its own line above the other two. */}
        <div className="grid grid-cols-2 gap-2 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1.2fr)]">
          <div className="relative col-span-2 min-w-0 md:col-span-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search PR No. or purpose…"
              className="h-9 min-w-0 border-border bg-background pl-8"
              aria-label="Search PR No. or purpose"
            />
          </div>
          <Select value={status} onValueChange={change(setStatus)}>
            <SelectTrigger className="h-9 w-full min-w-0 border-border" aria-label="Status"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              {STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
          <PeriodFilter value={period} onChange={change(setPeriod)} />
        </div>
        <div className="flex min-h-7 flex-wrap items-center justify-between gap-2">
          {data ? (
            <p className="text-sm text-muted-foreground">
              <span className="font-semibold text-navy">{data.total.toLocaleString()}</span>{" "}
              Purchase Request{data.total !== 1 ? "s" : ""} {periodPhrase(period)}
              {filters.status && <> · {filters.status}</>}
              {stage && (
                <span className="ml-1.5 inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                  {PR_STAGE_LABELS[stage]}
                  <button type="button" onClick={clearStage} className="rounded-full hover:bg-primary/20" aria-label="Remove stage filter">
                    <X className="h-3 w-3" />
                  </button>
                </span>
              )}
              {filters.search && <> · matching “{filters.search}”</>}
            </p>
          ) : (
            <span />
          )}
          {filtered && (
            <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs text-muted-foreground" onClick={resetFilters}>
              <X className="h-3.5 w-3.5" /> Clear filters
            </Button>
          )}
        </div>
      </div>

      {error && <div className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">{error instanceof Error ? error.message : "Unable to load purchase requests."}</div>}
      {isLoading ? (
        <div className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">Fetching data, kindly wait.</div>
      ) : (
        <>
          <MonitoringTable
            rows={rows}
            onEdit={setEditing}
            emptyMessage={filtered ? "No Purchase Requests match these filters." : "No Purchase Requests yet."}
          />
          {data && <ListPagination page={page} lastPage={data.lastPage} total={data.total} onPageChange={setPage} />}
        </>
      )}

      <MonitoringEntryDialog row={editing} onClose={() => setEditing(null)} />
    </div>
  );
}
