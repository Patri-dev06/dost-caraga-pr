import { useState } from "react";
import { startOfDay } from "date-fns";
import { CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatLongDate, parseIsoDate, toIsoDate } from "@/lib/date-format";
import { cn } from "@/lib/utils";

/**
 * A date chosen on a calendar instead of typed: stores "yyyy-MM-dd", shows "September 30, 2026".
 * `inline` blends into a printed form's underlined blank; `input` looks like a regular text box.
 * `notBeforeToday` greys out past days (e.g. an RFQ's opening date is always ahead).
 */
export function DatePickerField({
  value,
  onChange,
  placeholder = "Pick a date",
  variant = "input",
  notBeforeToday,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  variant?: "inline" | "input";
  notBeforeToday?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = parseIsoDate(value);
  const today = startOfDay(new Date());
  const text = formatLongDate(value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex w-full min-w-0 items-center gap-1.5 text-left",
            variant === "inline"
              ? "rounded-sm px-0.5 leading-snug hover:bg-amber-50 focus:bg-amber-100 focus:outline-none"
              : "h-9 rounded-md border border-border bg-background px-3 text-sm shadow-xs hover:bg-secondary/40",
            className,
          )}
        >
          <CalendarDays className={cn("shrink-0 print:hidden", variant === "inline" ? "h-3 w-3 opacity-50" : "h-4 w-4 text-muted-foreground")} />
          <span className={cn("truncate", !text && (variant === "inline" ? "italic text-black/30" : "text-muted-foreground"))}>{text || placeholder}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto max-w-[calc(100vw-1rem)] p-0" style={{ fontFamily: "var(--font-sans)" }}>
        <Calendar
          mode="single"
          captionLayout="dropdown"
          startMonth={new Date(today.getFullYear() - 1, 0)}
          endMonth={new Date(today.getFullYear() + 2, 11)}
          defaultMonth={selected ?? today}
          selected={selected}
          disabled={notBeforeToday ? { before: today } : undefined}
          onSelect={(date) => {
            if (!date) return;
            onChange(toIsoDate(date));
            setOpen(false);
          }}
        />
        {value && (
          <div className="flex justify-end border-t border-border p-2">
            <Button type="button" size="sm" variant="ghost" className="h-7 text-xs text-muted-foreground" onClick={() => { onChange(""); setOpen(false); }}>
              Clear date
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
