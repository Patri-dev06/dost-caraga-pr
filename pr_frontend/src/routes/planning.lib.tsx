import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FilePlus2, FileText, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { useCurrentUser } from "@/lib/current-user";
import { PageHeader } from "@/components/app/page-header";
import { ListPagination } from "@/components/app/list-pagination";
import { currentLibBudgetTotal, deleteLib, fmtAmount, getLibsPage, isApprovedReprogrammedLib, type LibDoc } from "@/lib/lib-store";

export const Route = createFileRoute("/planning/lib")({
  head: () => ({
    meta: [
      { title: "Line Item Budgets — DOST Caraga" },
      { name: "description", content: "Browse and manage Line Item Budgets (DOST Form 4)." },
    ],
  }),
  component: LibListPage,
});

const PER_PAGE = 20;

const STATUS_STYLES: Record<string, string> = {
  Draft: "bg-secondary text-secondary-foreground",
  "Pending Supervisor Review": "bg-warning/15 text-warning-foreground",
  "Forwarded to Budget Officer": "bg-warning/15 text-warning-foreground",
  "Pending Regional Director Approval": "bg-warning/15 text-warning-foreground",
  Approved: "bg-success/15 text-success",
};

function LibListPage() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  // Never the whole table: one page at a time, so the list stays fast no matter how many LIBs pile up.
  const { data, isLoading } = useQuery({
    queryKey: ["planning-libs", page],
    queryFn: () => getLibsPage(page, PER_PAGE),
    enabled: pathname === "/planning/lib",
  });
  const libs = data?.items ?? [];

  const { user } = useCurrentUser();
  const [pendingDelete, setPendingDelete] = useState<LibDoc | null>(null);
  const [deleting, setDeleting] = useState(false);

  if (pathname !== "/planning/lib") return <Outlet />;

  // A draft can be removed by its preparer; a LIB that is in review or approved is a budget of record,
  // so only a Superadmin may remove it (the server enforces the same rule).
  const canDelete = (lib: LibDoc) =>
    user?.tier === "superadmin" || (lib.status === "Draft" && lib.ownerId != null && lib.ownerId === user?.id);

  function askToDelete(lib: LibDoc, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setPendingDelete(lib);
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await deleteLib(pendingDelete.id);
      await queryClient.invalidateQueries({ queryKey: ["planning-libs"] });
      toast.success("LIB deleted.");
      setPendingDelete(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to delete this LIB.");
    } finally {
      setDeleting(false);
    }
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
        {isLoading ? (
          <div className="p-10 text-center text-sm text-muted-foreground">Fetching data, kindly wait.</div>
        ) : libs.length === 0 ? (
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
                  {canDelete(lib) && (
                    <button
                      type="button"
                      onClick={(e) => askToDelete(lib, e)}
                      title="Delete LIB"
                      aria-label="Delete LIB"
                      className="shrink-0 text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </Link>
              );
            })}
          </div>
        )}
      </div>
      {data && <ListPagination page={page} lastPage={data.lastPage} total={data.total} onPageChange={setPage} />}

      <AlertDialog open={pendingDelete !== null} onOpenChange={(open) => { if (!open && !deleting) setPendingDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this LIB?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>
                  <span className="font-semibold text-navy">{pendingDelete?.projectTitle || "Untitled LIB"}</span> will be permanently deleted. This can’t be undone.
                </p>
                {pendingDelete && pendingDelete.status !== "Draft" && (
                  <p className="rounded-md border border-destructive/30 bg-destructive/5 p-2 text-destructive">
                    This LIB is <strong>{pendingDelete.status}</strong>. Deleting a submitted or approved LIB removes a budget of record.
                  </p>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <Button variant="destructive" disabled={deleting} onClick={confirmDelete}>
              {deleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete LIB
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
