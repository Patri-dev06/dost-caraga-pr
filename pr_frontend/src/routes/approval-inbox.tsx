import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Filter, Eye, Gavel } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/app/page-header";
import { StatusBadge } from "@/components/app/status-badge";
import { ListPagination } from "@/components/app/list-pagination";
import { fmtPHP, prTotal, PurchaseRequest } from "@/lib/mock-data";
import { toast } from "sonner";
import { apiApprovalAction, apiGetApprovalsPage, apiGetAocs, apiGetAocsPage } from "@/lib/api";
import { useCurrentUser } from "@/lib/current-user";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export const Route = createFileRoute("/approval-inbox")({
  head: () => ({
    meta: [
      { title: "Approval Inbox — DOST Caraga" },
      { name: "description", content: "Review, recommend, approve, return, or reject Purchase Requests awaiting action." },
    ],
  }),
  validateSearch: (search: Record<string, unknown>): { tab?: "prs" | "bac" } => ({
    tab: search.tab === "bac" ? "bac" : search.tab === "prs" ? "prs" : undefined,
  }),
  component: Inbox,
});

const BAC_STATUSES = ["Pending BAC Review", "BAC Returned", "Approved", "Cancelled"];
const PER_PAGE = 20;

function Inbox() {
  const [open, setOpen] = useState<PurchaseRequest | null>(null);
  const queryClient = useQueryClient();
  const { user } = useCurrentUser();
  const search = Route.useSearch();
  const isBacReviewer = Boolean(user?.isBacChair || user?.isBacViceChair);
  // BAC members land on their queue; everyone else on Purchase Requests. A ?tab= link or a click overrides.
  const [picked, setPicked] = useState<"prs" | "bac" | null>(null);
  const tab = picked ?? search.tab ?? (isBacReviewer ? "bac" : "prs");
  // A capped preview just for the tab badge — never the whole queue.
  const { data: pendingBacPreview = [] } = useQuery({
    queryKey: ["aocs", "pending-count"],
    queryFn: () => apiGetAocs(["Pending BAC Review"], 100),
  });
  const pendingBac = pendingBacPreview.length;

  const [prPage, setPrPage] = useState(1);
  // Never the whole queue: one page at a time.
  const { data: prPageData, isLoading, error } = useQuery({
    queryKey: ["approvals", prPage],
    queryFn: () => apiGetApprovalsPage(prPage, PER_PAGE),
  });
  const queue = prPageData?.items ?? [];
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
        subtitle="Purchase Requests and Abstracts of Canvas awaiting your action."
      />

      <Tabs value={tab} onValueChange={(v) => setPicked(v as "prs" | "bac")} className="space-y-6">
        <TabsList>
          <TabsTrigger value="prs" className="gap-2">
            Purchase Requests
            <span className="rounded-full bg-secondary px-1.5 text-[11px] font-semibold text-navy">{prPageData?.total ?? queue.length}</span>
          </TabsTrigger>
          <TabsTrigger value="bac" className="gap-2">
            <Gavel className="h-3.5 w-3.5" /> BAC Review
            {pendingBac > 0 && <span className="rounded-full bg-primary px-1.5 text-[11px] font-semibold text-primary-foreground">{pendingBac}</span>}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="prs" className="mt-0 space-y-6">
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
      {prPageData && <ListPagination page={prPage} lastPage={prPageData.lastPage} total={prPageData.total} onPageChange={setPrPage} />}
        </TabsContent>

        <TabsContent value="bac" className="mt-0">
          <BacReviewQueue canReview={isBacReviewer} />
        </TabsContent>
      </Tabs>

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

const BAC_FILTERS: { key: string; label: string; statuses: string[] }[] = [
  { key: "pending", label: "Needs review", statuses: ["Pending BAC Review"] },
  { key: "returned", label: "Returned to TWG", statuses: ["BAC Returned"] },
  { key: "approved", label: "Approved", statuses: ["Approved"] },
  { key: "cancelled", label: "Cancelled", statuses: ["Cancelled"] },
  { key: "all", label: "All", statuses: BAC_STATUSES },
];

function BacReviewQueue({ canReview }: { canReview: boolean }) {
  const [filter, setFilter] = useState("pending");
  const [page, setPage] = useState(1);
  const active = BAC_FILTERS.find((f) => f.key === filter) ?? BAC_FILTERS[0];
  // Only the active filter's statuses, one page at a time — never the whole queue at once.
  const { data, isLoading, error } = useQuery({
    queryKey: ["aocs", "bac-queue", filter, page],
    queryFn: () => apiGetAocsPage(active.statuses, page, PER_PAGE),
  });
  const rows = data?.items ?? [];

  function pickFilter(key: string) {
    setFilter(key);
    setPage(1); // switching filters starts over at page 1
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {BAC_FILTERS.map((f) => {
          const on = f.key === filter;
          return (
            <Button key={f.key} size="sm" variant={on ? "default" : "outline"} className={on ? "" : "border-border"} onClick={() => pickFilter(f.key)}>
              {f.label}
            </Button>
          );
        })}
      </div>

      <Card className="overflow-hidden border border-border bg-card">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader><TableRow className="bg-secondary/40 hover:bg-secondary/40">
              <TableHead className="label-eyebrow">RFQ No.</TableHead>
              <TableHead className="label-eyebrow">PR No.</TableHead>
              <TableHead className="label-eyebrow">Category</TableHead>
              <TableHead className="label-eyebrow">Winning Supplier</TableHead>
              <TableHead className="label-eyebrow text-right">Winning Total</TableHead>
              <TableHead className="label-eyebrow">Submitted</TableHead>
              <TableHead className="label-eyebrow">Status</TableHead>
              <TableHead className="label-eyebrow text-right">Actions</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow><TableCell colSpan={8} className="py-8 text-center text-sm text-muted-foreground">Fetching data, kindly wait.</TableCell></TableRow>
              )}
              {!isLoading && Boolean(error) && (
                <TableRow><TableCell colSpan={8} className="py-8 text-center text-sm text-muted-foreground">{error instanceof Error ? error.message : "Unable to load the BAC review queue."}</TableCell></TableRow>
              )}
              {!isLoading && !error && rows.length === 0 && (
                <TableRow><TableCell colSpan={8} className="py-8 text-center text-sm text-muted-foreground">Nothing here right now.</TableCell></TableRow>
              )}
              {rows.map((aoc) => (
                <TableRow key={aoc.id}>
                  <TableCell className="font-semibold text-navy">{aoc.rfqNo}</TableCell>
                  <TableCell>{aoc.prNo}</TableCell>
                  <TableCell>{aoc.procurementCategory}</TableCell>
                  <TableCell>{aoc.winningSupplierName || "—"}</TableCell>
                  <TableCell className="text-right font-medium tabular-nums">{fmtPHP(aoc.winningTotal)}</TableCell>
                  <TableCell className="text-muted-foreground">{aoc.submittedAt ? aoc.submittedAt.slice(0, 10) : "—"}</TableCell>
                  <TableCell><StatusBadge status={aoc.status} /></TableCell>
                  <TableCell className="text-right">
                    <Button asChild size="sm" variant="outline" className="gap-1.5 border-border">
                      <Link to="/aoc/$aocId" params={{ aocId: aoc.id }}>
                        <Eye className="h-3.5 w-3.5" /> {canReview && aoc.status === "Pending BAC Review" ? "Review" : "View"}
                      </Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>
      {data && <ListPagination page={page} lastPage={data.lastPage} total={data.total} onPageChange={setPage} />}
    </div>
  );
}
