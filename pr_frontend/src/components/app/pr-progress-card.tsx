import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Ban, Check, ChevronDown, Circle, Clock } from "lucide-react";
import { Card } from "@/components/ui/card";
import { apiGetPrProgress, type PrProgressStep } from "@/lib/api";
import { cn } from "@/lib/utils";

const PHASES: { key: string; label: string }[] = [
  { key: "PR", label: "Purchase Request" },
  { key: "RFQ", label: "Request for Quotation" },
  { key: "AOC", label: "Abstract of Canvas" },
  { key: "PO", label: "Purchase Order" },
  { key: "Delivery", label: "Delivery & Issuance" },
  { key: "Payment", label: "Payment" },
];

function when(at: string | null): string {
  if (!at) return "";
  const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(at) ? `${at}T00:00:00` : at);
  return Number.isNaN(date.getTime()) ? at : date.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
}

/**
 * Where this PR stands in the whole procurement flow: every step done so far, the step it is on now
 * (and who it is waiting on), and the steps still missing — from submission to payment.
 */
export function PrProgressCard({ prId }: { prId: string }) {
  const [showAll, setShowAll] = useState(false);
  const { data, isLoading } = useQuery({ queryKey: ["pr-progress", prId], queryFn: () => apiGetPrProgress(prId) });

  if (isLoading || !data) return <Card className="border border-border p-5 text-sm text-muted-foreground">Fetching progress, kindly wait.</Card>;

  const missing = data.steps.filter((s) => s.status === "pending" || s.status === "current").length;
  const percent = Math.round((data.done / data.total) * 100);
  // Collapsed: every phase that has started, plus the next one — the far-off phases stay folded.
  const currentPhase = data.steps.find((s) => s.status === "current")?.phase;
  const currentIndex = PHASES.findIndex((p) => p.key === currentPhase);
  const phases = showAll || currentIndex < 0 ? PHASES : PHASES.slice(0, Math.min(PHASES.length, currentIndex + 2));

  return (
    <Card className="border border-border p-4 shadow-card sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-navy">Progress</h2>
          <p className="text-xs text-muted-foreground">
            {data.done} of {data.total} steps done{data.stopped ? "" : ` · ${missing} still to go`}
          </p>
        </div>
        {data.stopped ? (
          <p className="flex items-center gap-1.5 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-1.5 text-sm text-destructive">
            <Ban className="h-4 w-4 shrink-0" /> {data.stopped}
          </p>
        ) : data.next ? (
          <div className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-1.5 text-sm">
            <span className="font-semibold text-navy">Next: {data.next.label}</span>
            <span className="text-muted-foreground"> · waiting on {data.next.waitingOn}</span>
            {data.next.detail && <p className="text-xs text-muted-foreground">{data.next.detail}</p>}
          </div>
        ) : (
          <p className="rounded-lg border border-success/40 bg-success/10 px-3 py-1.5 text-sm font-semibold text-success">Complete</p>
        )}
      </div>

      <div className="mt-3 h-2 overflow-hidden rounded-full bg-secondary" aria-hidden>
        <div className={cn("h-full rounded-full", data.stopped ? "bg-destructive/60" : "bg-primary")} style={{ width: `${percent}%` }} />
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {phases.map((phase) => {
          const steps = data.steps.filter((s) => s.phase === phase.key);
          if (steps.length === 0) return null;
          const done = steps.filter((s) => s.status === "done").length;
          return (
            <section key={phase.key}>
              <p className="mb-1.5 flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {phase.label}
                <span className="tabular-nums">{done}/{steps.length}</span>
              </p>
              <ol className="space-y-1">
                {steps.map((step) => (
                  <StepRow key={step.key} step={step} />
                ))}
              </ol>
            </section>
          );
        })}
      </div>

      {phases.length < PHASES.length && (
        <button type="button" onClick={() => setShowAll(true)} className="mt-3 flex items-center gap-1 text-xs font-medium text-primary hover:underline">
          <ChevronDown className="h-3.5 w-3.5" /> Show the remaining steps (delivery to payment)
        </button>
      )}
    </Card>
  );
}

function StepRow({ step }: { step: PrProgressStep }) {
  const Icon = step.status === "done" ? Check : step.status === "current" ? Clock : step.status === "stopped" ? Ban : Circle;
  return (
    <li
      className={cn(
        "flex items-start gap-2 rounded-md px-2 py-1.5 text-sm",
        step.status === "current" && "bg-primary/5 ring-1 ring-primary/30",
        (step.status === "pending" || step.status === "stopped") && "text-muted-foreground",
      )}
    >
      <span
        className={cn(
          "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full",
          step.status === "done" && "bg-success text-white",
          step.status === "current" && "bg-primary text-primary-foreground",
          step.status === "pending" && "text-muted-foreground/50",
          step.status === "stopped" && "text-destructive/60",
        )}
      >
        <Icon className={cn(step.status === "done" || step.status === "current" ? "h-2.5 w-2.5" : "h-3.5 w-3.5")} strokeWidth={3} />
      </span>
      <span className="min-w-0 flex-1">
        <span className={cn("block leading-snug", step.status === "done" && "text-navy", step.status === "current" && "font-semibold text-navy")}>{step.label}</span>
        <span className="block text-xs text-muted-foreground">
          {step.status === "done"
            ? [when(step.at), step.detail].filter(Boolean).join(" · ")
            : step.status === "current"
              ? `Waiting on ${step.waitingOn}${step.detail ? ` · ${step.detail}` : ""}`
              : step.status === "pending"
                ? `Missing · ${step.waitingOn}`
                : ""}
        </span>
      </span>
    </li>
  );
}
