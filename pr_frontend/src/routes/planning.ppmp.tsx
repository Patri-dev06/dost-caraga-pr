import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { FilePlus2, FileText, AlertTriangle, CheckCircle2, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/app/page-header";
import { currentLibBudgetTotal, isApprovedReprogrammedLib, listLibs, fmtAmount, syncLibsFromDatabase, type LibDoc } from "@/lib/lib-store";
import { listPpmpsForLib, syncPpmpsFromDatabase, totalPpmpBudgetForLib, type PpmpForLib } from "@/lib/ppmp-store";
import { cn } from "@/lib/utils";

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
  const [approvedLibs, setApprovedLibs] = useState<LibDoc[]>([]);
  const [ppmpsByLib, setPpmpsByLib] = useState<Record<string, PpmpForLib[]>>({});

  useEffect(() => {
    if (pathname !== "/planning/ppmp") return;

    const refresh = () => {
      const libs = listLibs().filter((l) => l.status === "Approved");
      setApprovedLibs(libs);

      const map: Record<string, PpmpForLib[]> = {};
      for (const lib of libs) {
        map[lib.id] = listPpmpsForLib(lib.id);
      }
      setPpmpsByLib(map);
    };

    refresh();
    syncLibsFromDatabase()
      .then(() => syncPpmpsFromDatabase())
      .then(refresh)
      .catch(() => undefined);
  }, [pathname]);

  if (pathname !== "/planning/ppmp") return <Outlet />;

  const hasApproved = approvedLibs.length > 0;
  const ppmpStatusClass = (status: PpmpForLib["status"]) =>
    cn(
      "inline-flex rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
      status === "Draft" && "bg-secondary text-secondary-foreground",
      status === "Submitted to Budget Officer" && "bg-warning/15 text-warning-foreground",
      status === "Budget Officer Checked" && "bg-primary/15 text-primary",
      status === "Approved" && "bg-success/15 text-success",
    );

  return (
    <div className="mx-auto w-full max-w-7xl space-y-5 px-3 py-4 sm:space-y-6 sm:px-6 sm:py-8 lg:px-8">
      <PageHeader
        eyebrow="Planning"
        title="PPMP"
        subtitle="Project Procurement Management Plans based on approved Line Item Budgets."
      />

      {!hasApproved && (
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
                      <Link
                        key={ppmp.id}
                        to="/planning/ppmp/new"
                        search={{ lib: ppmp.libId, edit: ppmp.id }}
                        className="flex w-full items-center gap-4 px-4 py-3 text-left transition-colors hover:bg-secondary/40"
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
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {!hasApproved && (
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
