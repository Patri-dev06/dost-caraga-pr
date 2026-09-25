import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import type { DashboardStage } from "@/lib/api";
import { cn } from "@/lib/utils";

/** Colour per stage along the flow: planning grey → approval amber → procurement blue → done green. */
const TONE: Record<string, string> = {
  draft: "bg-slate-400",
  returned: "bg-orange-400",
  for_recommendation: "bg-amber-400",
  for_approval: "bg-amber-500",
  awaiting_rfq: "bg-sky-400",
  rfq: "bg-sky-500",
  aoc: "bg-blue-500",
  po: "bg-indigo-500",
  with_supplier: "bg-violet-500",
  delivered: "bg-emerald-500",
};

/**
 * "Where PRs are": how many of the user's PRs sit at each step of the flow, as one proportional
 * bar plus a tile per step. Every tile opens the Purchase Requests sheet filtered to that step.
 */
export function PrStagesCard({ stages }: { stages: DashboardStage[] }) {
  const flow = stages.filter((s) => s.key !== "closed");
  const closed = stages.find((s) => s.key === "closed");
  const open = flow.reduce((sum, s) => sum + s.count, 0);

  return (
    <Card className="border border-border p-4 shadow-card sm:p-5">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="text-base font-bold text-navy">Where Purchase Requests are</h2>
          <p className="text-xs text-muted-foreground">
            {open.toLocaleString()} open PR{open !== 1 ? "s" : ""}, by step. Click a step to see its PRs.
          </p>
        </div>
        {closed && closed.count > 0 && (
          <Link to="/purchase-requests" search={{ stage: "closed" }} className="text-xs text-muted-foreground hover:text-primary hover:underline">
            {closed.count.toLocaleString()} cancelled / rejected
          </Link>
        )}
      </div>

      {/* The whole flow at a glance: each step's share of the open PRs. */}
      {open > 0 && (
        <div className="mb-4 flex h-2.5 w-full overflow-hidden rounded-full bg-secondary" aria-hidden>
          {flow.filter((s) => s.count > 0).map((s) => (
            <div key={s.key} className={cn("h-full", TONE[s.key])} style={{ width: `${(s.count / open) * 100}%` }} title={`${s.label}: ${s.count}`} />
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {flow.map((s) => (
          <Link
            key={s.key}
            to="/purchase-requests"
            search={{ stage: s.key }}
            className={cn(
              "group flex flex-col gap-1 rounded-lg border border-border px-3 py-2.5 transition-colors hover:border-primary/40 hover:bg-secondary/40",
              s.count === 0 && "opacity-60",
            )}
          >
            <span className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
              <span className={cn("h-2 w-2 shrink-0 rounded-full", TONE[s.key])} />
              <span className="truncate">{s.label}</span>
            </span>
            <span className="flex items-center justify-between">
              <span className="text-xl font-bold tabular-nums text-navy">{s.count.toLocaleString()}</span>
              <ArrowRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
            </span>
          </Link>
        ))}
      </div>
    </Card>
  );
}
