import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Plus, Filter } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ReferenceTablePage } from "@/components/app/reference-table-page";
import { fmtPHP } from "@/lib/mock-data";
import { apiGetPpmpDocuments } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";

export const Route = createFileRoute("/ppmp-documents")({
  head: () => ({
    meta: [
      { title: "PPMP Documents — DOST Caraga" },
      { name: "description", content: "Project Procurement Management Plans with approval workflow." },
    ],
  }),
  component: PpmpDocumentsPage,
});

const statusColors: Record<string, string> = {
  Draft: "bg-gray-100 text-gray-700",
  Submitted: "bg-blue-100 text-blue-700",
  Approved: "bg-green-100 text-green-700",
  Returned: "bg-yellow-100 text-yellow-700",
  Cancelled: "bg-red-100 text-red-700",
  Rejected: "bg-red-100 text-red-700",
};

function PpmpDocumentsPage() {
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const filters: Record<string, unknown> = {};
  if (statusFilter !== "all") filters.status = statusFilter;

  const { data: documents = [], isLoading } = useQuery({
    queryKey: ["ppmp-documents", filters],
    queryFn: () => apiGetPpmpDocuments(filters as Parameters<typeof apiGetPpmpDocuments>[0]),
  });

  return (
    <ReferenceTablePage
      eyebrow="Budget & Planning"
      title="PPMP Documents"
      subtitle="Project Procurement Management Plans — operationalizes the budget with approval workflow."
      actions={
        <Link to="/ppmp-documents/new">
          <Button size="sm"><Plus className="mr-1.5 h-4 w-4" />New PPMP</Button>
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
      </div>

      <Card className="overflow-hidden border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow className="bg-secondary/40 hover:bg-secondary/40">
              <TableHead className="label-eyebrow">PPMP No.</TableHead>
              <TableHead className="label-eyebrow">Project</TableHead>
              <TableHead className="label-eyebrow">Fund Source</TableHead>
              <TableHead className="label-eyebrow text-center">FY</TableHead>
              <TableHead className="label-eyebrow text-center">Items</TableHead>
              <TableHead className="label-eyebrow text-right">Total Budget</TableHead>
              <TableHead className="label-eyebrow text-center">Type</TableHead>
              <TableHead className="label-eyebrow text-center">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow><TableCell colSpan={8} className="py-8 text-center text-sm text-muted-foreground">Loading...</TableCell></TableRow>
            )}
            {!isLoading && documents.length === 0 && (
              <TableRow><TableCell colSpan={8} className="py-8 text-center text-sm text-muted-foreground">No PPMP documents found.</TableCell></TableRow>
            )}
            {documents.map((doc) => (
              <TableRow key={doc.id} className="cursor-pointer hover:bg-muted/50">
                <TableCell>
                  <Link to="/ppmp-documents/$docId" params={{ docId: String(doc.id) }} className="font-semibold text-navy hover:underline">
                    {doc.ppmpNo || `PPMP-${doc.id}`}
                  </Link>
                </TableCell>
                <TableCell className="max-w-[180px] truncate">{doc.projectTitle}</TableCell>
                <TableCell className="text-sm">{doc.fundSourceName ?? "—"}</TableCell>
                <TableCell className="text-center">{doc.fiscalYear}</TableCell>
                <TableCell className="text-center">{doc.rowCount}</TableCell>
                <TableCell className="text-right tabular-nums">{fmtPHP(doc.totalEstimatedBudget)}</TableCell>
                <TableCell className="text-center"><Badge variant="outline">{doc.documentType}</Badge></TableCell>
                <TableCell className="text-center">
                  <Badge variant="secondary" className={statusColors[doc.status] ?? ""}>{doc.status}</Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </ReferenceTablePage>
  );
}
