import { Link } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { LucideIcon, TrendingUp, TrendingDown, Minus } from "lucide-react";

type Trend = "up" | "down" | "neutral";

export function StatCard({
  label,
  value,
  delta,
  trend = "neutral",
  icon: Icon,
  accent,
  to,
}: {
  label: string;
  value: string | number;
  delta?: string;
  trend?: Trend;
  icon?: LucideIcon;
  accent?: boolean;
  to?: string;
}) {
  const TrendIcon = trend === "up" ? TrendingUp : trend === "down" ? TrendingDown : Minus;
  const trendColor =
    trend === "up"
      ? "text-success"
      : trend === "down"
        ? "text-destructive"
        : "text-muted-foreground";

  const card = (
    <Card
      className={cn(
        "flex min-h-[104px] flex-col justify-between gap-2 rounded-xl border border-border bg-card p-4 shadow-card transition-shadow hover:shadow-md",
        to && "cursor-pointer hover:border-primary/40",
        accent && "border-warning/50 bg-warning/10",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="truncate text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        {Icon && (
          <div
            className={cn(
              "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-secondary text-primary",
              accent && "bg-warning/25 text-warning-foreground",
            )}
          >
            <Icon className="h-4 w-4" strokeWidth={1.75} />
          </div>
        )}
      </div>
      <p className="text-3xl font-bold leading-none text-navy">{value}</p>
      {delta && (
        <p className={cn("flex items-center gap-1 text-xs font-medium", trendColor)}>
          <TrendIcon className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
          <span className="truncate">{delta}</span>
        </p>
      )}
    </Card>
  );

  return to ? (
    <Link to={to} className="block">
      {card}
    </Link>
  ) : (
    card
  );
}
