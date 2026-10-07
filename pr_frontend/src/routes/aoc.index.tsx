import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { FileSpreadsheet, Scale } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { StatusBadge } from "@/components/app/status-badge";
import { ListPagination } from "@/components/app/list-pagination";
import { apiGetAocsPage } from "@/lib/api";
import { fmtAmount } from "@/lib/lib-store";
import { useQuery } from "@tanstack/react-query";

const PER_PAGE = 20;

export const Route = createFileRoute("/aoc/")({
  head: () => ({
    meta: [
      { title: "Abstract of Canvass — DOST Caraga" },
      { name: "description", content: "Every Abstract of Canvass, its item awards, BAC review status, and printable form." },
    ],
  }),
  component: AocListPage,
});

function AocListPage() {
  const [page, setPage] = useState(1);
  const { data, isLoading, error } = useQuery({
    queryKey: ["aocs", "list", page],
    queryFn: () => apiGetAocsPage(undefined, page, PER_PAGE),
  });
  const aocs = data?.items ?? [];

  return (
    <div className="mx-auto w-full max-w-7xl space-y-5 px-3 py-4 sm:space-y-6 sm:px-6 sm:py-8 lg:px-8">
      <PageHeader
        eyebrow="Procurement"
        title="Abstract of Canvass"
        subtitle="Compare the suppliers' quotations, award each item, and print the AOC for the BAC's signatures."
      />

      {isLoading ? (
        <div className="rounded-xl border border-border bg-card p-10 text-center">
          <p className="text-sm text-muted-foreground">Loading…</p>
        </div>
      ) : error ? (
        <div className="rounded-xl border border-warning/40 bg-warning/10 p-4 text-sm text-warning-foreground">
          {error instanceof Error ? error.message : "Could not load the Abstracts of Canvass."}
        </div>
      ) : aocs.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-10 text-center">
          <Scale className="mx-auto mb-2 h-8 w-8 text-muted-foreground/60" strokeWidth={1.5} />
          <p className="text-sm font-semibold text-navy">No Abstract of Canvass yet</p>
          <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
            An AOC is generated from an RFQ once it has been sent to its 3 suppliers and their signed quotations are recorded. Open the
            RFQ and use <span className="font-semibold">Generate Abstract of Canvass</span>; it then appears here.
          </p>
          <Link to="/rfq" className="mt-3 inline-block text-xs font-semibold text-primary underline-offset-2 hover:underline">
            Go to RFQs
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="divide-y divide-border rounded-xl border border-border bg-card shadow-card">
            {aocs.map((aoc) => (
              <div key={aoc.id} className="flex flex-wrap items-center gap-4 px-4 py-3 transition-colors hover:bg-secondary/40">
                <FileSpreadsheet className="h-4 w-4 shrink-0 text-primary" />
                <div className="min-w-0 flex-1">
                  <Link to="/aoc/$aocId" params={{ aocId: aoc.id }} className="text-sm font-medium text-navy hover:underline">
                    AOC for {aoc.rfqNo}
                  </Link>
                  <p className="text-xs text-muted-foreground">
                    PR: {aoc.prNo} · {aoc.procurementCategory}
                    {aoc.winningSupplierName ? ` · Awarded to ${aoc.winningSupplierName}` : ""}
                    {aoc.winningTotal ? ` · ₱${fmtAmount(aoc.winningTotal)}` : ""}
                  </p>
                </div>
                <StatusBadge status={aoc.status} />
              </div>
            ))}
          </div>
          {data && <ListPagination page={page} lastPage={data.lastPage} total={data.total} onPageChange={setPage} />}
        </div>
      )}
    </div>
  );
}
