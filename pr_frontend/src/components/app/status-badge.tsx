import { cn } from "@/lib/utils";

type Status = string;

const styles: Record<string, string> = {
  "Draft": "bg-muted text-muted-foreground border-border",
  "Pending Validation": "bg-secondary text-navy border-soft-blue",
  "For Recommendation": "bg-secondary text-navy border-soft-blue",
  "For Approval": "bg-primary/10 text-primary border-primary/30",
  "Approved": "bg-success/10 text-success border-success/30",
  "Returned": "bg-warning/15 text-warning-foreground border-warning/40",
  "Rejected": "bg-destructive/10 text-destructive border-destructive/30",
  "Passed": "bg-success/10 text-success border-success/30",
  "Failed": "bg-destructive/10 text-destructive border-destructive/30",
  "Warning": "bg-warning/15 text-warning-foreground border-warning/40",
  "N/A": "bg-muted text-muted-foreground border-border",
  "Active": "bg-success/10 text-success border-success/30",
  "Pending": "bg-warning/15 text-warning-foreground border-warning/40",
  "Inactive": "bg-muted text-muted-foreground border-border",
};

export function StatusBadge({ status, className }: { status: Status; className?: string }) {
  const s = styles[status] ?? "bg-muted text-muted-foreground border-border";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wider",
        s,
        className,
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
      {status}
    </span>
  );
}
