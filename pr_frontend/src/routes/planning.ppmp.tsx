import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FilePlus2, FileText, AlertTriangle, CheckCircle2, Eye, Inbox, Undo2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/app/page-header";
import { currentLibBudgetTotal, isApprovedReprogrammedLib, getLibsPage, fmtAmount, syncLibsFromDatabase, type LibDoc } from "@/lib/lib-store";
import { ListPagination } from "@/components/app/list-pagination";
import { listPpmpsForBudgetOfficer, listPpmpsForLib, syncPpmpsFromDatabase, totalPpmpBudgetForLib, type PpmpForLib } from "@/lib/ppmp-store";
import { useCurrentUser } from "@/lib/current-user";
import { cn } from "@/lib/utils";

const PER_PAGE = 20;

export const Route = createFileRoute("/planning/ppmp")({
  head: () => ({
    meta: [
      { title: "PPMP — DOST Caraga" },
      { name: "description", content: "Project Procurement Management Plans linked to approved Line Item Budgets." },
    ],
  }),
  component: PpmpListPage,
});

function PpmpListPage() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { user } = useCurrentUser();
  const [page, setPage] = useState(1);
  const [ppmpsByLib, setPpmpsByLib] = useState<Record<string, PpmpForLib[]>>({});
  const [reviewQueue, setReviewQueue] = useState<PpmpForLib[]>([]);

  // Never the whole table: one page of Approved LIBs at a time. Each project's own PPMPs (usually
  // a handful of revisions) still come from the synced local cache — that part stays small either way.
  const { data: libPageData, isLoading } = useQuery({
    queryKey: ["planning-libs", "approved-for-ppmp", page],
    queryFn: () => getLibsPage(page, PER_PAGE, "Approved"),
    enabled: pathname === "/planning/ppmp",
  });
  const approvedLibs = libPageData?.items ?? [];

  const refreshPpmps = useCallback((libs: LibDoc[]) => {
    const map: Record<string, PpmpForLib[]> = {};
    for (const lib of libs) {
      map[lib.id] = listPpmpsForLib(lib.id);
    }
    setPpmpsByLib(map);
    setReviewQueue(listPpmpsForBudgetOfficer());
  }, []);

  useEffect(() => {
    if (pathname !== "/planning/ppmp" || approvedLibs.length === 0) return;
    refreshPpmps(approvedLibs);
    syncPpmpsFromDatabase()
      .then(() => syncLibsFromDatabase())
      .then(() => refreshPpmps(approvedLibs))
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, approvedLibs.map((l) => l.id).join(",")]);

  if (pathname !== "/planning/ppmp") return <Outlet />;

  const hasApproved = approvedLibs.length > 0;
  const pendingReview = reviewQueue.filter((p) => p.status === "Submitted to Budget Officer");
  const ppmpStatusClass = (status: PpmpForLib["status"]) =>
    cn(
      "inline-flex rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
      status === "Draft" && "bg-secondary text-secondary-foreground",
      status === "Submitted to Budget Officer" && "bg-warning/15 text-warning-foreground",
      status === "Budget Officer Checked" && "bg-primary/15 text-primary",
      status === "Returned" && "bg-amber-500/15 text-amber-600 dark:text-amber-300",
      status === "Approved" && "bg-success/15 text-success",
    );

  return (
    <div className="mx-auto w-full max-w-7xl space-y-5 px-3 py-4 sm:space-y-6 sm:px-6 sm:py-8 lg:px-8">
      <PageHeader
        eyebrow="Planning"
        title="PPMP"
        subtitle="Project Procurement Management Plans based on approved Line Item Budgets."
      />

      {/* Budget Officer review queue */}
      {user?.isBudgetOfficer && reviewQueue.length > 0 && (
        <div className="rounded-xl border border-primary/30 bg-primary/5 shadow-card">
          <div className="flex items-center gap-2 border-b border-primary/20 px-4 py-3">
            <Inbox className="h-4 w-4 text-primary" />
            <p className="text-sm font-semibold text-navy">Budget Officer Review</p>
            {pendingReview.length > 0 && (
              <span className="ml-1 inline-flex items-center rounded-full bg-warning/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-warning-foreground">
                {pendingReview.length} awaiting you
              </span>
            )}
          </div>
          <div className="divide-y divide-border">
            {reviewQueue.map((ppmp) => (
              <Link
                key={ppmp.id}
                to="/planning/ppmp/new"
                search={{ lib: ppmp.libId, edit: ppmp.id }}
                className="flex w-full items-center gap-4 px-4 py-3 transition-colors hover:bg-secondary/40"
              >
                <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-navy">
                    PPMP {ppmp.ppmpNo} · {ppmp.ownerName ?? "Requester"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {ppmp.endUserUnit} · FY {ppmp.fiscalYear} · {ppmp.rows.length} items
                  </p>
                </div>
                <span className={ppmpStatusClass(ppmp.status)}>{ppmp.status}</span>
                <p className="text-sm font-semibold tabular-nums text-navy">{fmtAmount(ppmp.totalBudget)}</p>
                {ppmp.status === "Submitted to Budget Officer" ? (
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-md border border-primary/40 bg-primary/10 px-2 py-1 text-xs font-medium text-primary">
                    <Eye className="h-3.5 w-3.5" /> Review
                  </span>
                ) : ppmp.status === "Approved" ? (
                  <ShieldCheck className="h-4 w-4 shrink-0 text-success" />
                ) : (
                  <Undo2 className="h-4 w-4 shrink-0 text-amber-500" />
                )}
              </Link>
            ))}
          </div>
        </div>
      )}

      {!isLoading && !hasApproved && (
        <div className="flex items-center gap-3 rounded-lg border border-warning/40 bg-warning/10 p-4">
          <AlertTriangle className="h-5 w-5 shrink-0 text-warning" />
          <div>
            <p className="text-sm font-semibold text-warning-foreground">No Approved LIB Found</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              You need an approved Line Item Budget before you can create a PPMP.{" "}
              <Link to="/planning/lib" className="font-medium text-primary underline">
                Go to LIB
              </Link>
            </p>
          </div>
        </div>
      )}

      {hasApproved && (
        <div className="space-y-4">
          <p className="text-sm font-medium text-muted-foreground">
            Select an approved LIB project to create or view its PPMP.
          </p>

          {approvedLibs.map((lib) => {
            const libTotal = currentLibBudgetTotal(lib);
            const reprogrammed = isApprovedReprogrammedLib(lib);
            const ppmps = ppmpsByLib[lib.id] ?? [];
            const ppmpUsed = totalPpmpBudgetForLib(lib.id);
            const remaining = libTotal - ppmpUsed;

            return (
              <div
                key={lib.id}
                className="rounded-xl border border-border bg-card shadow-card"
              >
                {/* Project header */}
                <div className="flex flex-wrap items-start gap-4 border-b border-border p-4 sm:items-center">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success sm:mt-0" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="min-w-0 text-sm font-semibold text-navy">
                        {lib.projectTitle || "Untitled Project"}
                      </p>
                      <span
                        className={cn(
                          "inline-flex shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold",
                          reprogrammed ? "bg-primary/15 text-primary" : "bg-success/10 text-success",
                        )}
                      >
                        {reprogrammed ? `Reprogrammed · Rev ${lib.revision}` : "Original Approved LIB"}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {lib.programTitle} · CY {lib.fiscalYear}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-4">
                    <div className="text-right">
                      <p className="label-eyebrow">Approved LIB</p>
                      <p className="text-sm font-semibold tabular-nums text-navy">
                        {fmtAmount(libTotal)}
                      </p>
                      {reprogrammed && (
                        <p className="mt-0.5 text-[10px] text-muted-foreground">
                          Items follow approved reprogramming
                        </p>
                      )}
                    </div>
                    <Button asChild size="sm" className="gap-1.5">
                      <Link to="/planning/ppmp/new" search={{ lib: lib.id }}>
                        <FilePlus2 className="h-4 w-4" /> Create PPMP
                      </Link>
                    </Button>
                  </div>
                </div>

                {/* Budget summary */}
                <div className="grid grid-cols-3 gap-3 border-b border-border px-4 py-3">
                  <div>
                    <p className="label-eyebrow">LIB Budget</p>
                    <p className="mt-0.5 text-sm font-semibold tabular-nums text-navy">{fmtAmount(libTotal)}</p>
                    {reprogrammed && (
                      <p className="mt-0.5 text-[10px] text-muted-foreground">
                        Reprogrammed items; total unchanged
                      </p>
                    )}
                  </div>
                  <div>
                    <p className="label-eyebrow">PPMP Used</p>
                    <p className="mt-0.5 text-sm font-semibold tabular-nums text-navy">{fmtAmount(ppmpUsed)}</p>
                  </div>
                  <div>
                    <p className="label-eyebrow">Remaining</p>
                    <p className={`mt-0.5 text-sm font-semibold tabular-nums ${remaining < 0 ? "text-destructive" : "text-success"}`}>
                      {fmtAmount(remaining)}
                    </p>
                  </div>
                </div>

                {/* PPMPs under this project */}
                {ppmps.length === 0 ? (
                  <div className="p-6 text-center">
                    <FileText className="mx-auto mb-1.5 h-6 w-6 text-muted-foreground/50" strokeWidth={1.5} />
                    <p className="text-xs text-muted-foreground">
                      No PPMP created yet for this project.
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-border">
                    {ppmps.map((ppmp) => (
                      <div
                        key={ppmp.id}
                        className="flex w-full items-center gap-4 px-4 py-3 transition-colors hover:bg-secondary/40"
                      >
                        <Link
                          to="/planning/ppmp/new"
                          search={{ lib: ppmp.libId, edit: ppmp.id }}
                          className="flex min-w-0 flex-1 items-center gap-4 text-left"
                        >
                          <FileText className={cn("h-4 w-4 shrink-0", ppmp.status === "Approved" ? "text-success" : "text-muted-foreground")} />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-navy">
                              {ppmp.ppmpNo}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {ppmp.endUserUnit} · FY {ppmp.fiscalYear} · {ppmp.documentType}
                              {ppmp.revisionCount > 0 ? ` · Rev ${ppmp.revisionCount}` : ""} · {ppmp.rows.length} items
                            </p>
                          </div>
                          <span className={ppmpStatusClass(ppmp.status)}>
                            {ppmp.status}
                          </span>
                          <p className="text-sm font-semibold tabular-nums text-navy">
                            {fmtAmount(ppmp.totalBudget)}
                          </p>
                          <span className="hidden text-xs text-muted-foreground md:block">
                            {new Date(ppmp.createdAt).toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "2-digit" })}
                          </span>
                          <Eye className="h-4 w-4 shrink-0 text-muted-foreground" />
                        </Link>
                        {ppmp.status === "Submitted to Budget Officer" && user?.isBudgetOfficer && (
                          <Button
                            asChild
                            size="sm"
                            variant="outline"
                            className="h-7 shrink-0 gap-1.5 border-primary/50 bg-primary/10 text-primary hover:bg-primary/15"
                          >
                            <Link to="/planning/ppmp/new" search={{ lib: ppmp.libId, edit: ppmp.id }}>
                              <Eye className="h-3.5 w-3.5" /> Review
                            </Link>
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          {libPageData && <ListPagination page={page} lastPage={libPageData.lastPage} total={libPageData.total} onPageChange={setPage} />}
        </div>
      )}

      {!isLoading && !hasApproved && (
        <div className="rounded-xl border border-border bg-card p-10 text-center">
          <FileText className="mx-auto mb-2 h-8 w-8 text-muted-foreground/60" strokeWidth={1.5} />
          <p className="text-sm font-semibold text-navy">No PPMP documents yet</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Approve a Line Item Budget first, then create your PPMP here.
          </p>
        </div>
      )}

    </div>
  );
}
