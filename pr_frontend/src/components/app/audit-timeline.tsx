import type { PrTrailEntry } from "@/lib/mock-data";

function when(at: string | null): string {
  if (!at) return "";
  const date = new Date(at);
  return Number.isNaN(date.getTime())
    ? at
    : date.toLocaleString("en-PH", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

/** A document's real approval history (who did what, when), oldest first. */
export function AuditTimeline({ entries, emptyText = "No actions recorded yet." }: { entries: PrTrailEntry[]; emptyText?: string }) {
  if (entries.length === 0) return <p className="text-sm text-muted-foreground">{emptyText}</p>;

  return (
    <ol className="relative ml-3 border-l-2 border-border">
      {entries.map((e) => (
        <li key={e.id} className="mb-6 ml-6 last:mb-0">
          <span className="absolute -left-[9px] flex h-4 w-4 items-center justify-center rounded-full border-2 border-primary bg-card">
            <span className="h-1.5 w-1.5 rounded-full bg-primary" />
          </span>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-sm font-semibold text-navy">
              {e.action} {e.actor && <span className="font-normal text-muted-foreground">by {e.actor}</span>}
            </p>
            <span className="text-xs text-muted-foreground">{when(e.at)}</span>
          </div>
          {e.role && <p className="text-xs uppercase tracking-wider text-muted-foreground">{e.role}</p>}
          {e.remarks && <p className="mt-1 text-sm text-foreground/80">{e.remarks}</p>}
        </li>
      ))}
    </ol>
  );
}
