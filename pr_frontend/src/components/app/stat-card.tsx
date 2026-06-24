import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { LucideIcon } from "lucide-react";

export function StatCard({
  label,
  value,
  delta,
  icon: Icon,
  accent,
}: {
  label: string;
  value: string | number;
  delta?: string;
  icon?: LucideIcon;
  accent?: boolean;
}) {
  return (
    <Card className={cn(
      "grid min-h-[116px] grid-rows-[auto_1fr_auto] gap-3 border border-border bg-card p-4 shadow-card transition-shadow hover:shadow-md",
      accent && "border-primary/40",
    )}>
      <p className="truncate text-[10px] font-semibold uppercase leading-4 text-muted-foreground">{label}</p>
      <div className="flex min-w-0 items-end justify-between gap-3">
        <p className="text-3xl font-bold leading-none text-navy">{value}</p>
        {Icon && (
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-secondary text-primary">
            <Icon className="h-4 w-4" strokeWidth={1.75} />
          </div>
        )}
      </div>
      {delta && <p className="truncate text-xs font-medium leading-4 text-muted-foreground">{delta}</p>}
    </Card>
  );
}
