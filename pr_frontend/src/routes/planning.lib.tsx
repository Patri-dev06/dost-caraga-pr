import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { CheckCircle2, FilePlus2, FileText, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/app/page-header";
import { currentLibBudgetTotal, deleteLib, fmtAmount, isApprovedReprogrammedLib, listLibs, saveLib, syncLibsFromDatabase, type LibDoc } from "@/lib/lib-store";

export const Route = createFileRoute("/planning/lib")({
  head: () => ({
    meta: [
      { title: "Line Item Budgets — DOST Caraga" },
      { name: "description", content: "Browse and manage Line Item Budgets (DOST Form 4)." },
    ],
  }),
  component: LibListPage,
});

const STATUS_STYLES: Record<string, string> = {
  Draft: "bg-secondary text-secondary-foreground",
  "Pending Supervisor Review": "bg-warning/15 text-warning-foreground",
  "Forwarded to Budget Officer": "bg-warning/15 text-warning-foreground",
  "Pending Regional Director Approval": "bg-warning/15 text-warning-foreground",
  Approved: "bg-success/15 text-success",
};

function LibListPage() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [libs, setLibs] = useState<LibDoc[]>([]);

  useEffect(() => {
    if (pathname !== "/planning/lib") return;

    setLibs(listLibs());
    syncLibsFromDatabase().then(setLibs).catch(() => undefined);
  }, [pathname]);

  if (pathname !== "/planning/lib") return <Outlet />;

  function onDelete(id: string, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    deleteLib(id);
    setLibs(listLibs());
  }

  function onApprove(lib: LibDoc, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    saveLib({ ...lib, status: "Approved" });
    setLibs(listLibs());
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-5 px-3 py-4 sm:space-y-6 sm:px-6 sm:py-8 lg:px-8">
      <PageHeader
        eyebrow="Planning"
        title="Line Item Budget (LIB)"
        subtitle="All DOST Form 4 Project Line-Item Budgets you have prepared."
        actions={
          <Button asChild className="gap-2">
            <Link to="/planning/lib/new">
              <FilePlus2 className="h-4 w-4" /> Create LIB
            </Link>
          </Button>
        }
      />

      <div className="rounded-xl border border-border bg-card">
        {libs.length === 0 ? (
          <div className="p-10 text-center">
            <FileText className="mx-auto mb-2 h-8 w-8 text-muted-foreground/60" strokeWidth={1.5} />
            <p className="text-sm font-semibold text-navy">No Line Item Budgets yet</p>
            <p className="mt-1 text-xs text-muted-foreground">Click “Create LIB” to prepare your first DOST Form 4.</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {libs.map((lib) => {
              const currentTotal = currentLibBudgetTotal(lib);
              const reprogrammed = isApprovedReprogrammedLib(lib);
              return (
                <Link
                  key={lib.id}
                  to="/planning/lib/new"
                  search={{ edit: lib.id }}
                  className="flex items-center gap-4 p-4 transition-colors hover:bg-secondary/40"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-navy">{lib.projectTitle || "Untitled LIB"}</p>
                    <p className="mt-1 truncate text-xs text-muted-foreground">
                      {lib.programTitle} · CY {lib.fiscalYear}
                    </p>
                  </div>
                  <div className="hidden text-right sm:block">
                    <p className="label-eyebrow">Approved LIB</p>
                    <p className="mt-0.5 text-sm font-semibold tabular-nums text-navy">₱ {fmtAmount(currentTotal)}</p>
                    {reprogrammed && (
                      <p className="mt-0.5 text-[10px] text-muted-foreground">
                        Total unchanged; items reallocated
                      </p>
                    )}
                  </div>
                  {lib.status === "Approved" && (
                    <span
                      className={`hidden shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold sm:inline-flex ${
                        reprogrammed ? "bg-primary/15 text-primary" : "bg-success/10 text-success"
                      }`}
                    >
                      {reprogrammed ? `Reprogrammed · Rev ${lib.revision}` : "Original Approved LIB"}
                    </span>
                  )}
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${STATUS_STYLES[lib.status] ?? "bg-secondary text-secondary-foreground"}`}
                  >
                    {lib.status}
                  </span>
                  <span className="hidden w-28 shrink-0 text-right text-xs text-muted-foreground md:block">
                    {new Date(lib.updatedAt).toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "2-digit" })}
                  </span>
                  {lib.status !== "Approved" && (
                    <button
                      type="button"
                      onClick={(e) => onApprove(lib, e)}
                      title="Manually approve LIB"
                      className="inline-flex shrink-0 items-center gap-1 rounded-md border border-success/30 bg-success/10 px-2 py-1 text-xs font-semibold text-success hover:bg-success/15"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Approve
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={(e) => onDelete(lib.id, e)}
                    title="Delete LIB"
                    className="shrink-0 text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
