import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { CalendarDays, Download, FilePlus2, Search, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader } from "@/components/app/page-header";
import { ListPagination } from "@/components/app/list-pagination";
import { MonitoringTable } from "@/components/app/monitoring-table";
import { MonitoringEntryDialog } from "@/components/app/monitoring-entry-dialog";
import { apiGetPurchaseRequestMonitoringPage, type MonitoringFilters, type MonitoringRow } from "@/lib/api";
import { exportMonitoringSheetExcel } from "@/lib/monitoring-excel";
import { useQuery } from "@tanstack/react-query";

const PER_PAGE = 20;

const STATUSES = ["Draft", "For Recommendation", "For Approval", "Approved", "Returned", "Rejected", "Cancelled"];

type Period = "all" | "day" | "month" | "year";

const pad = (n: number) => String(n).padStart(2, "0");
const now = new Date();
const TODAY = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
const THIS_MONTH = TODAY.slice(0, 7);
const THIS_YEAR = String(now.getFullYear());
const YEARS = Array.from({ length: 6 }, (_, i) => String(now.getFullYear() - i));

/** "on Sep 14, 2026" / "in September 2026" / "in 2026" — for the count line above the sheet. */
function periodLabel(period: Period, date: string, month: string, year: string): string {
  if (period === "day" && date) {
    const [y, m, d] = date.split("-").map(Number);
    return `on ${new Date(y, m - 1, d).toLocaleDateString("en-PH", { month: "long", day: "numeric", year: "numeric" })}`;
  }
  if (period === "month" && month) {
    const [y, m] = month.split("-").map(Number);
    return `in ${new Date(y, m - 1, 1).toLocaleDateString("en-PH", { month: "long", year: "numeric" })}`;
  }
  if (period === "year" && year) return `in ${year}`;
  return "in total";
}

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
  const [editing, setEditing] = useState<MonitoringRow | null>(null);

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [period, setPeriod] = useState<Period>("all");
  const [date, setDate] = useState(TODAY);
  const [month, setMonth] = useState(THIS_MONTH);
  const [year, setYear] = useState(THIS_YEAR);

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
    date: period === "day" ? date : undefined,
    month: period === "month" ? month : undefined,
    year: period === "year" ? year : undefined,
  };
  const filtered = Boolean(filters.search || filters.status || period !== "all");

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
    setPeriod("all");
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

      <div className="space-y-3 rounded-xl border border-border bg-card p-4">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
          <div className="relative min-w-0 flex-1 lg:max-w-xs">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search PR No. or purpose…"
              className="h-9 min-w-0 border-border bg-background pl-8"
              aria-label="Search PR No. or purpose"
            />
          </div>
          <div className="grid grid-cols-1 gap-2 min-[430px]:grid-cols-3 sm:flex sm:flex-wrap sm:items-center">
            <Select value={status} onValueChange={change(setStatus)}>
              <SelectTrigger className="h-9 w-full border-border sm:w-[170px]" aria-label="Status"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                {STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={period} onValueChange={change((v: string) => setPeriod(v as Period))}>
              <SelectTrigger className="h-9 w-full border-border sm:w-[130px]" aria-label="Period">
                <CalendarDays className="h-4 w-4 text-muted-foreground" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All time</SelectItem>
                <SelectItem value="day">Day</SelectItem>
                <SelectItem value="month">Month</SelectItem>
                <SelectItem value="year">Year</SelectItem>
              </SelectContent>
            </Select>
            {period === "day" && (
              <Input type="date" value={date} max={TODAY} onChange={(e) => e.target.value && change(setDate)(e.target.value)} className="h-9 w-full border-border sm:w-[160px]" aria-label="Day" />
            )}
            {period === "month" && (
              <Input type="month" value={month} max={THIS_MONTH} onChange={(e) => e.target.value && change(setMonth)(e.target.value)} className="h-9 w-full border-border sm:w-[160px]" aria-label="Month" />
            )}
            {period === "year" && (
              <Select value={year} onValueChange={change(setYear)}>
                <SelectTrigger className="h-9 w-full border-border sm:w-[110px]" aria-label="Year"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {YEARS.map((y) => <SelectItem key={y} value={y}>{y}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
            {filtered && (
              <Button variant="ghost" size="sm" className="h-9 gap-1 text-muted-foreground" onClick={resetFilters}>
                <X className="h-4 w-4" /> Clear
              </Button>
            )}
          </div>
        </div>
        {data && (
          <p className="text-sm text-muted-foreground">
            <span className="font-semibold text-navy">{data.total.toLocaleString()}</span>{" "}
            Purchase Request{data.total !== 1 ? "s" : ""} {periodLabel(period, date, month, year)}
            {filters.status && <> · {filters.status}</>}
            {filters.search && <> · matching “{filters.search}”</>}
          </p>
        )}
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
