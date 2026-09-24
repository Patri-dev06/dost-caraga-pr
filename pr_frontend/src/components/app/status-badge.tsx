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
  "Deactivated": "bg-muted text-muted-foreground border-border",
  "Inactive": "bg-muted text-muted-foreground border-border", // legacy value
  "Pending BAC Review": "bg-primary/10 text-primary border-primary/30",
  "BAC Returned": "bg-warning/15 text-warning-foreground border-warning/40",
  "Cancelled": "bg-destructive/10 text-destructive border-destructive/30",
  // RFQ canvass
  "Pending Supply Officer Countersign": "bg-secondary text-navy border-soft-blue",
  "Pending BAC Signature": "bg-secondary text-navy border-soft-blue",
  "Ready to Send": "bg-primary/10 text-primary border-primary/30",
  "Canvassing": "bg-primary/10 text-primary border-primary/30",
  "TWG Evaluation": "bg-secondary text-navy border-soft-blue",
  "Sent": "bg-secondary text-navy border-soft-blue",
  "Replied": "bg-success/10 text-success border-success/30",
  "TimedOut": "bg-warning/15 text-warning-foreground border-warning/40",
  "Replaced": "bg-muted text-muted-foreground border-border",
  "Failed TWG": "bg-destructive/10 text-destructive border-destructive/30",
  // Abstract of Canvas
  "For Venue Rating": "bg-secondary text-navy border-soft-blue",
  "Pending BAC Satisfaction": "bg-warning/15 text-warning-foreground border-warning/40",
  "For Supply Noting": "bg-primary/10 text-primary border-primary/30",
  "Lowest Bidder Noted": "bg-success/10 text-success border-success/30",
  // Purchase Order
  "Pending Budget Obligation": "bg-secondary text-navy border-soft-blue",
  "Pending Accounting": "bg-secondary text-navy border-soft-blue",
  "Pending RD Approval": "bg-primary/10 text-primary border-primary/30",
  "Forwarded to Supplier": "bg-primary/10 text-primary border-primary/30",
  "Delivery Accepted": "bg-success/10 text-success border-success/30",
  "Delivery Waived": "bg-warning/15 text-warning-foreground border-warning/40",
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
