import { useState, type ReactNode } from "react";
import { format, isAfter, startOfMonth, subDays, subMonths } from "date-fns";
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { atEarliest, atLatest, FIRST_YEAR, parseDay, periodText, stepPeriod, toDay, toMonth, type Period, type PeriodValue } from "@/lib/period";
import { cn } from "@/lib/utils";

const VIEWS: { value: Period; label: string }[] = [
  { value: "all", label: "All time" },
  { value: "day", label: "Day" },
  { value: "month", label: "Month" },
  { value: "year", label: "Year" },
];

/**
 * Picks the period the Monitoring Sheet counts PRs over. The arrows step one day/month/year at a
 * time; the button opens a picker with a calendar, a month grid or a year grid, plus shortcuts.
 */
export function PeriodFilter({ value, onChange }: { value: PeriodValue; onChange: (value: PeriodValue) => void }) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<Period>(value.period);
  const [gridYear, setGridYear] = useState(() => Number(value.month.slice(0, 4)));

  const apply = (next: PeriodValue) => {
    onChange(next);
    setOpen(false);
  };

  const now = new Date();
  const stepper = value.period !== "all";
  const arrow = "flex w-9 shrink-0 items-center justify-center text-muted-foreground hover:bg-secondary hover:text-foreground disabled:pointer-events-none disabled:opacity-40";

  return (
    <div className="flex h-9 w-full min-w-0 items-stretch overflow-hidden rounded-md border border-border bg-background shadow-xs">
      {stepper && (
        <button type="button" className={cn(arrow, "border-r border-border")} onClick={() => onChange(stepPeriod(value, -1))} disabled={atEarliest(value)} aria-label="Previous period">
          <ChevronLeft className="h-4 w-4" />
        </button>
      )}
      <Popover
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (next) {
            setView(value.period === "all" ? "day" : value.period);
            setGridYear(Number(value.month.slice(0, 4)));
          }
        }}
      >
        <PopoverTrigger asChild>
          <button type="button" className="flex min-w-0 flex-1 items-center gap-2 px-3 text-left text-sm hover:bg-secondary/60" aria-label="Choose period">
            <CalendarDays className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="truncate">{periodText(value)}</span>
            <ChevronDown className="ml-auto h-4 w-4 shrink-0 opacity-50" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[19rem] max-w-[calc(100vw-1rem)] p-0">
          {/* Which kind of period to pick. */}
          <div className="grid grid-cols-4 gap-1 border-b border-border p-2">
            {VIEWS.map((v) => (
              <button
                key={v.value}
                type="button"
                onClick={() => (v.value === "all" ? apply({ ...value, period: "all" }) : setView(v.value))}
                className={cn(
                  "rounded-md px-2 py-1.5 text-xs font-medium transition-colors",
                  (v.value === "all" ? value.period === "all" : view === v.value)
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground",
                )}
              >
                {v.label}
              </button>
            ))}
          </div>

          {view === "day" && (
            <Calendar
              mode="single"
              captionLayout="dropdown"
              className="mx-auto"
              startMonth={new Date(FIRST_YEAR, 0)}
              endMonth={now}
              disabled={{ after: now }}
              defaultMonth={value.period === "day" ? parseDay(value.date) : now}
              selected={value.period === "day" ? parseDay(value.date) : undefined}
              onSelect={(d) => d && apply({ ...value, period: "day", date: toDay(d) })}
            />
          )}

          {view === "month" && (
            <div className="p-3">
              <div className="mb-2 flex items-center justify-between">
                <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => setGridYear((y) => y - 1)} disabled={gridYear <= FIRST_YEAR} aria-label="Previous year">
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-sm font-semibold">{gridYear}</span>
                <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => setGridYear((y) => y + 1)} disabled={gridYear >= now.getFullYear()} aria-label="Next year">
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                {Array.from({ length: 12 }, (_, m) => {
                  const d = new Date(gridYear, m, 1);
                  const key = toMonth(d);
                  const selected = value.period === "month" && value.month === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      disabled={isAfter(d, startOfMonth(now))}
                      onClick={() => apply({ ...value, period: "month", month: key })}
                      className={cn(
                        "rounded-md py-2 text-sm transition-colors disabled:pointer-events-none disabled:opacity-35",
                        selected ? "bg-primary font-semibold text-primary-foreground" : "hover:bg-secondary",
                        !selected && key === toMonth(now) && "font-semibold text-primary",
                      )}
                    >
                      {format(d, "MMM")}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {view === "year" && (
            <div className="grid grid-cols-3 gap-1.5 p-3">
              {Array.from({ length: now.getFullYear() - FIRST_YEAR + 1 }, (_, i) => String(now.getFullYear() - i)).map((y) => {
                const selected = value.period === "year" && value.year === y;
                return (
                  <button
                    key={y}
                    type="button"
                    onClick={() => apply({ ...value, period: "year", year: y })}
                    className={cn(
                      "rounded-md py-2 text-sm transition-colors",
                      selected ? "bg-primary font-semibold text-primary-foreground" : "hover:bg-secondary",
                      !selected && y === String(now.getFullYear()) && "font-semibold text-primary",
                    )}
                  >
                    {y}
                  </button>
                );
              })}
            </div>
          )}

          {/* One-tap shortcuts for the periods people ask about most. */}
          <div className="flex flex-wrap gap-1.5 border-t border-border p-2">
            {view === "day" && (
              <>
                <Shortcut onClick={() => apply({ ...value, period: "day", date: toDay(now) })}>Today</Shortcut>
                <Shortcut onClick={() => apply({ ...value, period: "day", date: toDay(subDays(now, 1)) })}>Yesterday</Shortcut>
              </>
            )}
            {view === "month" && (
              <>
                <Shortcut onClick={() => apply({ ...value, period: "month", month: toMonth(now) })}>This month</Shortcut>
                <Shortcut onClick={() => apply({ ...value, period: "month", month: toMonth(subMonths(now, 1)) })}>Last month</Shortcut>
              </>
            )}
            {view === "year" && (
              <>
                <Shortcut onClick={() => apply({ ...value, period: "year", year: String(now.getFullYear()) })}>This year</Shortcut>
                <Shortcut onClick={() => apply({ ...value, period: "year", year: String(now.getFullYear() - 1) })}>Last year</Shortcut>
              </>
            )}
          </div>
        </PopoverContent>
      </Popover>
      {stepper && (
        <button type="button" className={cn(arrow, "border-l border-border")} onClick={() => onChange(stepPeriod(value, 1))} disabled={atLatest(value)} aria-label="Next period">
          <ChevronRight className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

function Shortcut({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <Button type="button" size="sm" variant="outline" className="h-7 border-border px-2.5 text-xs" onClick={onClick}>
      {children}
    </Button>
  );
}
