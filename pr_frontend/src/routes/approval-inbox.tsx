import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Filter, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PageHeader } from "@/components/app/page-header";
import { StatusBadge } from "@/components/app/status-badge";
import { fmtPHP, prTotal, PurchaseRequest } from "@/lib/mock-data";
import { toast } from "sonner";
import { apiApprovalAction, apiGetApprovals } from "@/lib/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export const Route = createFileRoute("/approval-inbox")({
  head: () => ({
    meta: [
      { title: "Approval Inbox — DOST Caraga" },
      { name: "description", content: "Review, recommend, approve, return, or reject Purchase Requests awaiting action." },
    ],
  }),
  component: Inbox,
});

function Inbox() {
  const [open, setOpen] = useState<PurchaseRequest | null>(null);
  const queryClient = useQueryClient();
  const { data: queue = [], isLoading, error } = useQuery({
    queryKey: ["approvals"],
    queryFn: apiGetApprovals,
  });
  const actionMutation = useMutation({
    mutationFn: ({ id, action, reason }: { id: string; action: "recommend" | "approve" | "reject"; reason?: string }) => apiApprovalAction(id, action, reason),
    onSuccess: async (result) => {
      toast.success(result.message);
      setOpen(null);
      await queryClient.invalidateQueries({ queryKey: ["approvals"] });
      await queryClient.invalidateQueries({ queryKey: ["purchase-requests"] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Unable to complete approval action."),
  });

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
      <PageHeader
        eyebrow="Inbox"
        title="Approval Inbox"
        subtitle="Purchase Requests awaiting your action."
      />

      <Card className="flex flex-col gap-3 border border-border bg-card p-4 sm:flex-row sm:items-center">
        <div className="flex flex-1 items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search PR No., office…" className="h-9 max-w-xs border-border bg-background" />
        </div>
        <div className="flex flex-wrap gap-2">
          <Select defaultValue="all"><SelectTrigger className="h-9 w-[160px] border-border"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="all">All Stages</SelectItem><SelectItem value="rec">Recommendation</SelectItem><SelectItem value="app">Approval</SelectItem></SelectContent>
          </Select>
          <Select defaultValue="all"><SelectTrigger className="h-9 w-[140px] border-border"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="all">All Funds</SelectItem><SelectItem value="gaa">GAA</SelectItem><SelectItem value="trust">Trust</SelectItem></SelectContent>
          </Select>
          <Select defaultValue="all"><SelectTrigger className="h-9 w-[160px] border-border"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="all">All Offices</SelectItem><SelectItem value="ro">Regional Office</SelectItem><SelectItem value="pmd">Planning</SelectItem></SelectContent>
          </Select>
        </div>
      </Card>

      <Card className="overflow-hidden border border-border bg-card">
        <Table>
          <TableHeader><TableRow className="bg-secondary/40 hover:bg-secondary/40">
            <TableHead className="label-eyebrow">PR No.</TableHead>
            <TableHead className="label-eyebrow">Requesting Office</TableHead>
            <TableHead className="label-eyebrow">Fund Type</TableHead>
            <TableHead className="label-eyebrow text-right">Total Amount</TableHead>
            <TableHead className="label-eyebrow">Date Submitted</TableHead>
            <TableHead className="label-eyebrow">Current Stage</TableHead>
            <TableHead className="label-eyebrow">Status</TableHead>
            <TableHead className="label-eyebrow text-right">Actions</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow><TableCell colSpan={8} className="py-8 text-center text-sm text-muted-foreground">Fetching data, kindly wait.</TableCell></TableRow>
            )}
            {error && (
              <TableRow><TableCell colSpan={8} className="py-8 text-center text-sm text-muted-foreground">{error instanceof Error ? error.message : "Unable to load approval inbox."}</TableCell></TableRow>
            )}
            {queue.map((pr) => (
              <TableRow key={pr.id}>
                <TableCell className="font-semibold text-navy">{pr.prNo}</TableCell>
                <TableCell>{pr.office}</TableCell>
                <TableCell>{pr.fundType}</TableCell>
                <TableCell className="text-right font-medium tabular-nums">{fmtPHP(prTotal(pr))}</TableCell>
                <TableCell className="text-muted-foreground">{pr.dateSubmitted}</TableCell>
                <TableCell className="text-muted-foreground">{pr.stage}</TableCell>
                <TableCell><StatusBadge status={pr.status} /></TableCell>
                <TableCell className="text-right">
                  <Button size="sm" variant="outline" className="gap-1.5 border-border" onClick={() => setOpen(pr)}>
                    <Eye className="h-3.5 w-3.5" /> Review
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={!!open} onOpenChange={(v) => !v && setOpen(null)}>
        <DialogContent className="max-w-2xl">
          {open && (
            <>
              <DialogHeader>
                <p className="label-eyebrow">Review Purchase Request</p>
                <DialogTitle className="text-xl">{open.prNo} — {open.projectTitle}</DialogTitle>
                <DialogDescription>{open.office} · {open.fundSource}</DialogDescription>
              </DialogHeader>

              <div className="grid grid-cols-2 gap-3 rounded-lg border border-border bg-secondary/30 p-4 text-sm">
                <div><p className="label-eyebrow">Total Amount</p><p className="mt-0.5 font-semibold text-navy">{fmtPHP(prTotal(open))}</p></div>
                <div><p className="label-eyebrow">Mode</p><p className="mt-0.5 font-semibold text-navy">{open.modeOfProcurement}</p></div>
                <div><p className="label-eyebrow">Items</p><p className="mt-0.5 font-semibold text-navy">{open.items.length} line items</p></div>
                <div><p className="label-eyebrow">Date Submitted</p><p className="mt-0.5 font-semibold text-navy">{open.dateSubmitted}</p></div>
              </div>

              <div>
                <p className="label-eyebrow mb-1">Purpose</p>
                <p className="text-sm text-foreground">{open.purpose}</p>
              </div>

              <div>
                <p className="label-eyebrow mb-1.5">Remarks (required for Return / Reject)</p>
                <Textarea rows={3} placeholder="Add remarks…" className="border-border" />
              </div>

              <DialogFooter className="flex-wrap gap-2 sm:justify-between">
                <div className="flex gap-2">
                  <Button variant="outline" className="border-warning/50 text-warning-foreground hover:bg-warning/10" onClick={() => { toast("Return action is not available yet."); }}>Return</Button>
                  <Button variant="outline" className="border-destructive/50 text-destructive hover:bg-destructive/10" onClick={() => actionMutation.mutate({ id: open.id, action: "reject", reason: "Rejected from approval inbox." })}>Reject</Button>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" className="border-border" onClick={() => actionMutation.mutate({ id: open.id, action: "recommend" })}>Recommend</Button>
                  <Button onClick={() => actionMutation.mutate({ id: open.id, action: "approve" })}>Approve</Button>
                </div>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
