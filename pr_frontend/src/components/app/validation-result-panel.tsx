import { CheckCircle2, AlertTriangle, XCircle, MinusCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "./status-badge";
import type { PRItem, ValidationCheck, ValidationStatus } from "@/lib/mock-data";

const icon = {
  Passed: CheckCircle2,
  Warning: AlertTriangle,
  Failed: XCircle,
  "N/A": MinusCircle,
} as const;
const tone: Record<ValidationStatus, string> = {
  Passed: "text-success",
  Warning: "text-warning-foreground",
  Failed: "text-destructive",
  "N/A": "text-muted-foreground",
};

/**
 * The PR's checks against PPMP, LIB and APP, item by item — only real results from the server.
 * With none yet (never run), it says so instead of guessing.
 */
export function ValidationResultPanel({ items, results }: { items: PRItem[]; results?: (ValidationCheck & { itemId?: string })[] }) {
  if (!results || results.length === 0) {
    return (
      <Card className="border border-dashed border-border bg-secondary/20 p-8 text-center">
        <p className="text-sm font-semibold text-navy">Not checked yet</p>
        <p className="mt-1 text-xs text-muted-foreground">
          The checks against the PPMP, LIB and APP run when the Purchase Request is submitted (or re-run from Validation).
        </p>
      </Card>
    );
  }

  const allResults = items.map((i) => ({
    item: i,
    checks: results.filter((result) => !result.itemId || result.itemId === i.id),
  }));
  const hasFailed = allResults.some((r) => r.checks.some((c) => c.status === "Failed"));
  const hasWarn = allResults.some((r) => r.checks.some((c) => c.status === "Warning"));

  return (
    <div className="space-y-4">
      <div
        className={`rounded-xl border p-4 text-sm ${
          hasFailed
            ? "border-destructive/30 bg-destructive/5 text-destructive"
            : hasWarn
            ? "border-warning/30 bg-warning/10 text-warning-foreground"
            : "border-success/30 bg-success/5 text-success"
        }`}
      >
        <p className="font-semibold">
          {hasFailed
            ? "Request cannot proceed until validation issues are resolved."
            : hasWarn
            ? "Validation completed with warnings. Review before submission."
            : "All items passed pre-validation. Ready to proceed."}
        </p>
      </div>

      {allResults.map(({ item, checks }) => (
        <Card key={item.id} className="border border-border p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="label-eyebrow">Item</p>
              <p className="text-sm font-semibold text-navy">{item.name}</p>
              <p className="text-xs text-muted-foreground">
                {item.qty} {item.uom} · {item.description}
              </p>
            </div>
          </div>
          <ul className="divide-y divide-border">
            {checks.map((c) => {
              const Icon = icon[c.status];
              return (
                <li key={c.label} className="flex items-start gap-3 py-3">
                  <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${tone[c.status]}`} strokeWidth={2} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-navy">{c.label}</p>
                      <StatusBadge status={c.status} />
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">{c.message}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      ))}
    </div>
  );
}
