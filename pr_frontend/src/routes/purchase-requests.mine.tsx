import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Ban, Eye, FilePlus2, Inbox, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/app/page-header";
import { StatusBadge } from "@/components/app/status-badge";
import { ListPagination } from "@/components/app/list-pagination";
import { apiGetMySubmissionsPage, type MySubmission } from "@/lib/api";
import { fmtAmount } from "@/lib/lib-store";
import { cn } from "@/lib/utils";

const PER_PAGE = 10;

/** Status groups a requester thinks in, mapped to the PR statuses behind them. */
const FILTERS: { key: string; label: string; status?: string }[] = [
  { key: "all", label: "All" },
  { key: "review", label: "Under review", status: "For Recommendation,For Approval" },
  { key: "approved", label: "Approved", status: "Approved" },
  { key: "action", label: "Needs my action", status: "Draft,Returned" },
  { key: "closed", label: "Cancelled / Rejected", status: "Cancelled,Rejected" },
];

export const Route = createFileRoute("/purchase-requests/mine")({
  head: () => ({
    meta: [
      { title: "My Submissions — DOST Caraga" },
      { name: "description", content: "Review the Purchase Requests you submitted and where each one stands." },
    ],
  }),
  component: MySubmissionsPage,
});

function MySubmissionsPage() {
  const [filter, setFilter] = useState("all");
  const [page, setPage] = useState(1);
  const status = FILTERS.find((f) => f.key === filter)?.status;

  const { data, isLoading, error } = useQuery({
    queryKey: ["my-submissions", filter, page],
    queryFn: () => apiGetMySubmissionsPage(page, PER_PAGE, status),
    placeholderData: (previous) => previous,
  });
  const rows = data?.items ?? [];

  return (
    <div className="mx-auto w-full max-w-5xl space-y-5 px-3 py-4 sm:px-6 sm:py-8 lg:px-8">
      <PageHeader
        eyebrow="Purchase Requests"
        title="My Submissions"
        subtitle="The Purchase Requests you filed: review what you submitted, where each one stands, and what is still missing."
        actions={
          <Button asChild className="gap-2">
            <Link to="/purchase-requests/new"><FilePlus2 className="h-4 w-4" /> Create PR</Link>
          </Button>
        }
      />

      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => { setFilter(f.key); setPage(1); }}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
              filter === f.key ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-muted-foreground hover:bg-secondary",
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {error && <Card className="border border-border p-4 text-sm text-muted-foreground">{error instanceof Error ? error.message : "Unable to load your submissions."}</Card>}
      {isLoading ? (
        <Card className="border border-border p-4 text-sm text-muted-foreground">Fetching data, kindly wait.</Card>
      ) : rows.length === 0 ? (
        <Card className="border border-dashed border-border p-10 text-center">
          <Inbox className="mx-auto mb-2 h-7 w-7 text-muted-foreground/60" strokeWidth={1.5} />
          <p className="text-sm font-semibold text-navy">{filter === "all" ? "You have not filed a Purchase Request yet" : "Nothing here"}</p>
          <p className="mt-1 text-xs text-muted-foreground">Purchase Requests you create appear here with their progress.</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {rows.map((pr) => <SubmissionCard key={pr.id} pr={pr} />)}
          {data && <ListPagination page={page} lastPage={data.lastPage} total={data.total} onPageChange={setPage} />}
        </div>
      )}
    </div>
  );
}

function SubmissionCard({ pr }: { pr: MySubmission }) {
  const { done, total, next, stopped } = pr.progress;
  const editable = pr.status === "Draft" || pr.status === "Returned";
  const date = pr.submittedAt ?? pr.createdAt;

  return (
    <Card className="border border-border p-4 shadow-card">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Link to="/purchase-requests/$prId" params={{ prId: pr.id }} className="text-sm font-bold text-navy hover:underline">{pr.prNo}</Link>
            <StatusBadge status={pr.status} />
          </div>
          <p className="mt-0.5 line-clamp-2 text-sm text-foreground">{pr.purpose || "No purpose stated"}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {pr.submittedAt ? "Submitted" : "Created"} {date ? new Date(date).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" }) : ""}
            {" · "}{pr.itemCount} item{pr.itemCount !== 1 ? "s" : ""} · ₱{fmtAmount(pr.amount)}
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          {editable && (
            <Button asChild size="sm" variant="outline" className="gap-1.5 border-border">
              <Link to="/purchase-requests/new" search={{ edit: pr.id }}><Pencil className="h-3.5 w-3.5" /> {pr.status === "Returned" ? "Fix & resubmit" : "Continue"}</Link>
            </Button>
          )}
          <Button asChild size="sm" className="gap-1.5">
            <Link to="/purchase-requests/$prId" params={{ prId: pr.id }}><Eye className="h-3.5 w-3.5" /> Review</Link>
          </Button>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-3">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-secondary" aria-hidden>
          <div className={cn("h-full rounded-full", stopped ? "bg-destructive/60" : "bg-primary")} style={{ width: `${(done / total) * 100}%` }} />
        </div>
        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{done}/{total} steps</span>
      </div>
      <p className="mt-1.5 text-xs">
        {stopped ? (
          <span className="flex items-center gap-1 text-destructive"><Ban className="h-3.5 w-3.5" /> {stopped}</span>
        ) : next ? (
          <>
            <span className="font-semibold text-navy">Next: {next.label}</span>
            <span className="text-muted-foreground"> · waiting on {next.waitingOn}</span>
          </>
        ) : (
          <span className="font-semibold text-success">All steps complete</span>
        )}
      </p>
    </Card>
  );
}
