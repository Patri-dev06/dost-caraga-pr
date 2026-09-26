import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Filter, Download, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { PageHeader } from "@/components/app/page-header";
import { ListPagination } from "@/components/app/list-pagination";
import { apiGetAuditLogsPage, type AuditLogFilters, type AuditLogRecord } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

const PER_PAGE = 25;
/** Most rows one export will pull (100 per request), so a huge log cannot hang the browser. */
const EXPORT_LIMIT = 5000;

const csvCell = (value: string | number) => `"${String(value).replace(/"/g, '""')}"`;

export const Route = createFileRoute("/audit-logs")({
  head: () => ({
    meta: [
      { title: "Audit Logs — DOST Caraga" },
      { name: "description", content: "Immutable audit trail of all user activity in the procurement system." },
    ],
  }),
  component: AuditPage,
});

function AuditPage() {
  const [open, setOpen] = useState<AuditLogRecord | null>(null);
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [module, setModule] = useState("all");
  const [days, setDays] = useState("7");
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const filters: AuditLogFilters = {
    search: search || undefined,
    module: module === "all" ? undefined : module,
    days: days === "all" ? undefined : Number(days),
  };
  const { data, isLoading, error } = useQuery({
    queryKey: ["audit-logs", page, filters],
    queryFn: () => apiGetAuditLogsPage(page, PER_PAGE, filters),
    placeholderData: (previous) => previous,
  });
  const auditLogs = data?.items ?? [];

  // Every entry matching the filters (not just this page), as a CSV file.
  async function handleExport() {
    setExporting(true);
    try {
      const rows: AuditLogRecord[] = [];
      for (let p = 1; rows.length < EXPORT_LIMIT; p += 1) {
        const chunk = await apiGetAuditLogsPage(p, 100, filters);
        rows.push(...chunk.items);
        if (p >= chunk.lastPage) break;
      }
      const lines = [
        ["Timestamp", "Actor", "Role", "Module", "Action", "Target", "IP Address"].map(csvCell).join(","),
        ...rows.slice(0, EXPORT_LIMIT).map((l) => [l.ts, l.actor, l.role, l.module, l.action, l.target, l.ip].map(csvCell).join(",")),
      ];
      const url = URL.createObjectURL(new Blob(["\uFEFF" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `audit-logs-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      if (data && data.total > EXPORT_LIMIT) toast.info(`Exported the newest ${EXPORT_LIMIT.toLocaleString()} of ${data.total.toLocaleString()} entries. Narrow the filters for the rest.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unable to export the audit logs.");
    } finally {
      setExporting(false);
    }
  }
  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
      <PageHeader
        eyebrow="Administration"
        title="Audit Logs"
        subtitle="Immutable record of all actions performed in the procurement system."
        actions={
          <Button variant="outline" className="gap-2 border-border" onClick={handleExport} disabled={exporting || !data?.total}>
            <Download className="h-4 w-4" /> {exporting ? "Exporting…" : "Export CSV"}
          </Button>
        }
      />

      <Card className="flex flex-col gap-3 border border-border bg-card p-4 sm:flex-row sm:items-center">
        <div className="flex flex-1 items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <Input value={searchInput} onChange={(e) => setSearchInput(e.target.value)} placeholder="Search by actor, action, target…" className="h-9 max-w-xs border-border bg-background" />
        </div>
        <Select value={module} onValueChange={(v) => { setModule(v); setPage(1); }}><SelectTrigger className="h-9 w-[180px] border-border"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Modules</SelectItem>
            {(data?.modules ?? []).map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={days} onValueChange={(v) => { setDays(v); setPage(1); }}><SelectTrigger className="h-9 w-[150px] border-border"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="1">Last 24 hours</SelectItem><SelectItem value="7">Last 7 days</SelectItem>
            <SelectItem value="30">Last 30 days</SelectItem><SelectItem value="all">All time</SelectItem>
          </SelectContent>
        </Select>
      </Card>

      <Card className="overflow-hidden border border-border bg-card">
        <Table>
          <TableHeader><TableRow className="bg-secondary/40 hover:bg-secondary/40">
            <TableHead className="label-eyebrow">Timestamp</TableHead>
            <TableHead className="label-eyebrow">Actor</TableHead>
            <TableHead className="label-eyebrow">Role</TableHead>
            <TableHead className="label-eyebrow">Module</TableHead>
            <TableHead className="label-eyebrow">Action</TableHead>
            <TableHead className="label-eyebrow">Target</TableHead>
            <TableHead className="label-eyebrow">IP Address</TableHead>
            <TableHead className="w-[40px]" />
          </TableRow></TableHeader>
          <TableBody>
            {isLoading && <TableRow><TableCell colSpan={8} className="py-8 text-center text-sm text-muted-foreground">Fetching data, kindly wait.</TableCell></TableRow>}
            {error && <TableRow><TableCell colSpan={8} className="py-8 text-center text-sm text-muted-foreground">{error instanceof Error ? error.message : "Unable to load audit logs."}</TableCell></TableRow>}
            {auditLogs.map((l) => (
              <TableRow key={l.id} className="cursor-pointer" onClick={() => setOpen(l)}>
                <TableCell className="text-muted-foreground tabular-nums">{l.ts}</TableCell>
                <TableCell className="font-semibold text-navy">{l.actor}</TableCell>
                <TableCell><span className="rounded-full border border-soft-blue bg-secondary px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-navy">{l.role}</span></TableCell>
                <TableCell>{l.module}</TableCell>
                <TableCell>{l.action}</TableCell>
                <TableCell className="font-mono text-xs">{l.target}</TableCell>
                <TableCell className="text-muted-foreground font-mono text-xs">{l.ip}</TableCell>
                <TableCell><Button variant="ghost" size="icon"><Eye className="h-4 w-4" /></Button></TableCell>
              </TableRow>
            ))}
            {!isLoading && !error && auditLogs.length === 0 && (
              <TableRow><TableCell colSpan={8} className="py-8 text-center text-sm text-muted-foreground">No entries match these filters.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
      {data && <ListPagination page={page} lastPage={data.lastPage} total={data.total} onPageChange={setPage} />}

      <Sheet open={!!open} onOpenChange={(v) => !v && setOpen(null)}>
        <SheetContent className="sm:max-w-md">
          {open && (
            <>
              <SheetHeader>
                <p className="label-eyebrow">Audit Entry</p>
                <SheetTitle>{open.action}</SheetTitle>
                <SheetDescription>{open.ts}</SheetDescription>
              </SheetHeader>
              <pre className="mt-6 overflow-auto rounded-lg border border-border bg-secondary/40 p-4 text-xs leading-relaxed text-navy">
{JSON.stringify(open, null, 2)}
              </pre>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
