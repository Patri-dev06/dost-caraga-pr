import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Filter, Eye, CheckCircle, RotateCcw, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/app/page-header";
import { fmtPHP } from "@/lib/mock-data";
import { toast } from "sonner";
import { apiGetApprovalInbox, apiInboxAction, type ApprovalInboxItem } from "@/lib/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export const Route = createFileRoute("/approval-inbox")({
  head: () => ({
    meta: [
      { title: "Approval Inbox — DOST Caraga" },
      { name: "description", content: "Review, approve, return, or reject documents awaiting your action." },
    ],
  }),
  component: Inbox,
});

const typeLabels: Record<string, string> = {
  lib: "LIB",
  ppmp: "PPMP",
  purchase_request: "PR",
};

const typeColors: Record<string, string> = {
  lib: "bg-purple-100 text-purple-700",
  ppmp: "bg-blue-100 text-blue-700",
  purchase_request: "bg-amber-100 text-amber-700",
};

function Inbox() {
  const [tab, setTab] = useState("all");
  const [reviewItem, setReviewItem] = useState<ApprovalInboxItem | null>(null);
  const [remarks, setRemarks] = useState("");
  const queryClient = useQueryClient();

  const typeFilter = tab === "all" ? undefined : tab;

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["approval-inbox", typeFilter],
    queryFn: () => apiGetApprovalInbox(typeFilter),
  });

  const actionMutation = useMutation({
    mutationFn: ({ type, id, action, payload }: { type: string; id: number; action: "approve" | "return" | "reject"; payload?: { remarks?: string } }) =>
      apiInboxAction(type, id, action, payload),
    onSuccess: (result) => {
      toast.success(result.message);
      setReviewItem(null);
      setRemarks("");
      queryClient.invalidateQueries({ queryKey: ["approval-inbox"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const handleAction = (action: "approve" | "return" | "reject") => {
    if (!reviewItem) return;
    if ((action === "return" || action === "reject") && !remarks.trim()) {
      toast.error("Remarks are required for return/reject.");
      return;
    }
    actionMutation.mutate({
      type: reviewItem.type,
      id: reviewItem.id,
      action,
      payload: remarks.trim() ? { remarks: remarks.trim() } : undefined,
    });
  };

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
      <PageHeader
        eyebrow="Inbox"
        title="Approval Inbox"
        subtitle="Documents awaiting your action — LIB, PPMP, and Purchase Requests."
      />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="lib">LIB</TabsTrigger>
          <TabsTrigger value="ppmp">PPMP</TabsTrigger>
          <TabsTrigger value="purchase_request">Purchase Requests</TabsTrigger>
        </TabsList>

        <TabsContent value={tab} className="mt-4">
          <Card className="overflow-hidden border border-border bg-card">
            <Table>
              <TableHeader>
                <TableRow className="bg-secondary/40 hover:bg-secondary/40">
                  <TableHead className="label-eyebrow">Type</TableHead>
                  <TableHead className="label-eyebrow">Document No.</TableHead>
                  <TableHead className="label-eyebrow">Title / Purpose</TableHead>
                  <TableHead className="label-eyebrow">Project</TableHead>
                  <TableHead className="label-eyebrow text-right">Amount</TableHead>
                  <TableHead className="label-eyebrow">Current Stage</TableHead>
                  <TableHead className="label-eyebrow">Submitted By</TableHead>
                  <TableHead className="label-eyebrow text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && (
                  <TableRow><TableCell colSpan={8} className="py-8 text-center text-sm text-muted-foreground">Loading...</TableCell></TableRow>
                )}
                {!isLoading && items.length === 0 && (
                  <TableRow><TableCell colSpan={8} className="py-8 text-center text-sm text-muted-foreground">No documents awaiting your action.</TableCell></TableRow>
                )}
                {items.map((item) => (
                  <TableRow key={`${item.type}-${item.id}`}>
                    <TableCell>
                      <Badge variant="secondary" className={typeColors[item.type] ?? ""}>{typeLabels[item.type] ?? item.type}</Badge>
                    </TableCell>
                    <TableCell className="font-semibold text-navy">
                      <DocumentLink item={item} />
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate">{item.title}</TableCell>
                    <TableCell className="text-sm">{item.projectTitle ?? "—"}</TableCell>
                    <TableCell className="text-right font-medium tabular-nums">{fmtPHP(item.amount)}</TableCell>
                    <TableCell className="text-sm">{item.currentStage}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{item.submittedBy}</TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="outline" className="gap-1.5" onClick={() => { setReviewItem(item); setRemarks(""); }}>
                        <Eye className="h-3.5 w-3.5" /> Review
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={!!reviewItem} onOpenChange={(v) => { if (!v) { setReviewItem(null); setRemarks(""); } }}>
        <DialogContent className="max-w-lg">
          {reviewItem && (
            <>
              <DialogHeader>
                <p className="text-xs uppercase tracking-wider text-muted-foreground">{typeLabels[reviewItem.type]} Review</p>
                <DialogTitle>{reviewItem.documentNo} — {reviewItem.title}</DialogTitle>
              </DialogHeader>

              <div className="grid grid-cols-2 gap-3 rounded-lg border bg-secondary/30 p-4 text-sm">
                <div><p className="text-xs text-muted-foreground">Amount</p><p className="font-semibold">{fmtPHP(reviewItem.amount)}</p></div>
                <div><p className="text-xs text-muted-foreground">Project</p><p className="font-semibold">{reviewItem.projectTitle ?? "N/A"}</p></div>
                <div><p className="text-xs text-muted-foreground">Fund Source</p><p className="font-semibold">{reviewItem.fundSource ?? "N/A"}</p></div>
                <div><p className="text-xs text-muted-foreground">Current Stage</p><p className="font-semibold">{reviewItem.currentStage}</p></div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Remarks (required for Return / Reject)</label>
                <Textarea rows={3} value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="Add remarks..." />
              </div>

              <DialogFooter className="flex-wrap gap-2 sm:justify-between">
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="text-yellow-700 border-yellow-300" onClick={() => handleAction("return")} disabled={actionMutation.isPending}>
                    <RotateCcw className="mr-1 h-3.5 w-3.5" />Return
                  </Button>
                  <Button variant="outline" size="sm" className="text-destructive border-destructive/30" onClick={() => handleAction("reject")} disabled={actionMutation.isPending}>
                    <XCircle className="mr-1 h-3.5 w-3.5" />Reject
                  </Button>
                </div>
                <Button size="sm" onClick={() => handleAction("approve")} disabled={actionMutation.isPending}>
                  <CheckCircle className="mr-1.5 h-4 w-4" />Approve
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DocumentLink({ item }: { item: ApprovalInboxItem }) {
  switch (item.type) {
    case "lib":
      return <Link to="/lib/$libId" params={{ libId: String(item.id) }} className="hover:underline">{item.documentNo}</Link>;
    case "ppmp":
      return <Link to="/ppmp-documents/$docId" params={{ docId: String(item.id) }} className="hover:underline">{item.documentNo}</Link>;
    case "purchase_request":
      return <Link to="/purchase-requests/$prId" params={{ prId: String(item.id) }} className="hover:underline">{item.documentNo}</Link>;
    default:
      return <span>{item.documentNo}</span>;
  }
}
