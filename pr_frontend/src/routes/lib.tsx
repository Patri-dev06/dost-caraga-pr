import { createFileRoute, Link, Outlet, useMatch } from "@tanstack/react-router";
import { useState } from "react";
import { Plus, Filter } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ReferenceTablePage } from "@/components/app/reference-table-page";
import { fmtPHP } from "@/lib/mock-data";
import { apiGetLibEntries, apiGetFundSources, type LibEntryRecord } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";

export const Route = createFileRoute("/lib")({
  head: () => ({
    meta: [
      { title: "LIB (Line Item Budget) — DOST Caraga" },
      { name: "description", content: "Manage Line Item Budget entries." },
    ],
  }),
  component: LibPage,
});

const statusColors: Record<string, string> = {
  Draft: "bg-gray-100 text-gray-700",
  Submitted: "bg-blue-100 text-blue-700",
  Approved: "bg-green-100 text-green-700",
  Returned: "bg-yellow-100 text-yellow-700",
  Cancelled: "bg-red-100 text-red-700",
  Rejected: "bg-red-100 text-red-700",
};

function LibPage() {
  const childMatch = useMatch({ from: "/lib/$libId", shouldThrow: false });
  const newMatch = useMatch({ from: "/lib/new", shouldThrow: false });

  if (childMatch || newMatch) {
    return <Outlet />;
  }

  return <LibListPage />;
}

function LibListPage() {
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [fundSourceFilter, setFundSourceFilter] = useState<string>("all");

  const filters: Record<string, unknown> = {};
  if (statusFilter !== "all") filters.status = statusFilter;
  if (fundSourceFilter !== "all") filters.fund_source_id = Number(fundSourceFilter);

  const { data: entries = [], isLoading } = useQuery({
    queryKey: ["lib-entries", filters],
    queryFn: () => apiGetLibEntries(filters as Parameters<typeof apiGetLibEntries>[0]),
  });

  const { data: fundSources = [] } = useQuery({ queryKey: ["fund-sources"], queryFn: apiGetFundSources });

  return (
    <ReferenceTablePage
      eyebrow="Budget & Planning"
      title="Line Item Budget (LIB)"
      subtitle="Financial ceiling for all procurement activities. Each LIB entry defines available chargeable funds per budget line."
      actions={
        <Link to="/lib/new">
          <Button size="sm"><Plus className="mr-1.5 h-4 w-4" />New LIB Entry</Button>
        </Link>
      }
    >
      <div className="mb-4 flex items-center gap-3">
        <Filter className="h-4 w-4 text-muted-foreground" />
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[150px]"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="Draft">Draft</SelectItem>
            <SelectItem value="Submitted">Submitted</SelectItem>
            <SelectItem value="Approved">Approved</SelectItem>
            <SelectItem value="Returned">Returned</SelectItem>
            <SelectItem value="Cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
        <Select value={fundSourceFilter} onValueChange={setFundSourceFilter}>
          <SelectTrigger className="w-[200px]"><SelectValue placeholder="Fund Source" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Fund Sources</SelectItem>
            {fundSources.map((fs) => (
              <SelectItem key={fs.id} value={String(fs.id)}>{fs.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card className="overflow-hidden border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow className="bg-secondary/40 hover:bg-secondary/40">
              <TableHead className="label-eyebrow">Account Code</TableHead>
              <TableHead className="label-eyebrow">Object of Expenditure</TableHead>
              <TableHead className="label-eyebrow">Fund Source</TableHead>
              <TableHead className="label-eyebrow">Project</TableHead>
              <TableHead className="label-eyebrow text-center">Year</TableHead>
              <TableHead className="label-eyebrow text-right">Allocated</TableHead>
              <TableHead className="label-eyebrow text-right">Available</TableHead>
              <TableHead className="label-eyebrow text-center">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow><TableCell colSpan={8} className="py-8 text-center text-sm text-muted-foreground">Loading...</TableCell></TableRow>
            )}
            {!isLoading && entries.length === 0 && (
              <TableRow><TableCell colSpan={8} className="py-8 text-center text-sm text-muted-foreground">No LIB entries found.</TableCell></TableRow>
            )}
            {entries.map((entry) => (
              <TableRow key={entry.id} className="cursor-pointer hover:bg-muted/50">
                <TableCell>
                  <Link to="/lib/$libId" params={{ libId: String(entry.id) }} className="font-semibold text-navy hover:underline">
                    {entry.accountCode}
                  </Link>
                </TableCell>
                <TableCell className="max-w-[200px] truncate">{entry.objectOfExpenditure}</TableCell>
                <TableCell className="text-sm">{entry.fundSourceName}</TableCell>
                <TableCell className="text-sm max-w-[150px] truncate">{entry.projectTitle}</TableCell>
                <TableCell className="text-center">{entry.budgetYear}</TableCell>
                <TableCell className="text-right tabular-nums">{fmtPHP(entry.allocatedAmount)}</TableCell>
                <TableCell className="text-right tabular-nums font-medium">{fmtPHP(entry.availableAmount)}</TableCell>
                <TableCell className="text-center">
                  <Badge variant="secondary" className={statusColors[entry.status] ?? ""}>{entry.status}</Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </ReferenceTablePage>
  );
}
