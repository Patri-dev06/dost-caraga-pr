import { approvalTrail } from "@/lib/mock-data";

export function AuditTimeline({ entries = approvalTrail }: { entries?: typeof approvalTrail }) {
  return (
    <ol className="relative ml-3 border-l-2 border-border">
      {entries.map((e, i) => (
        <li key={i} className="mb-6 ml-6 last:mb-0">
          <span className="absolute -left-[9px] flex h-4 w-4 items-center justify-center rounded-full border-2 border-primary bg-card">
            <span className="h-1.5 w-1.5 rounded-full bg-primary" />
          </span>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-sm font-semibold text-navy">
              {e.action} <span className="text-muted-foreground font-normal">by {e.actor}</span>
            </p>
            <span className="text-xs text-muted-foreground">{e.ts}</span>
          </div>
          <p className="text-xs uppercase tracking-wider text-muted-foreground">{e.role}</p>
          {e.remarks && <p className="mt-1 text-sm text-foreground/80">{e.remarks}</p>}
        </li>
      ))}
    </ol>
  );
}
