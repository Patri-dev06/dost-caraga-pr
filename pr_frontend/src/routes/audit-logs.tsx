import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Filter, Download, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { PageHeader } from "@/components/app/page-header";
import { apiGetAuditLogs, AuditLogRecord } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";

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
  const { data: auditLogs = [], isLoading, error } = useQuery({ queryKey: ["audit-logs"], queryFn: apiGetAuditLogs });
  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
      <PageHeader
        eyebrow="Administration"
        title="Audit Logs"
        subtitle="Immutable record of all actions performed in the procurement system."
        actions={<Button variant="outline" className="gap-2 border-border"><Download className="h-4 w-4" /> Export</Button>}
      />

      <Card className="flex flex-col gap-3 border border-border bg-card p-4 sm:flex-row sm:items-center">
        <div className="flex flex-1 items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search by actor, target…" className="h-9 max-w-xs border-border bg-background" />
        </div>
        <Select defaultValue="all"><SelectTrigger className="h-9 w-[160px] border-border"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Modules</SelectItem><SelectItem value="pr">Purchase Requests</SelectItem>
            <SelectItem value="val">Validation</SelectItem><SelectItem value="usr">User Management</SelectItem>
          </SelectContent>
        </Select>
        <Select defaultValue="7"><SelectTrigger className="h-9 w-[140px] border-border"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="1">Last 24 hours</SelectItem><SelectItem value="7">Last 7 days</SelectItem><SelectItem value="30">Last 30 days</SelectItem></SelectContent>
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
          </TableBody>
        </Table>
      </Card>

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
