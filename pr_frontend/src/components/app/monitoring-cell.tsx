import { Copy, Maximize2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { splitEntries } from "@/lib/monitoring-columns";
import { cn } from "@/lib/utils";

/** Past this many characters a one-line cell is cut off, so it offers its full text on click. */
const LONG = 32;
/** A list cell shows this many entries; the rest are "+N more". */
const SHOWN = 2;

/**
 * One Monitoring Sheet cell. Short values show as they are; list values show one entry per line
 * (up to two, then "+N more"); anything cut off opens a popover with the whole text — which works
 * on touch screens too, unlike a hover tooltip — plus a Copy button.
 */
export function MonitoringCell({ value, label, list = false }: { value: string; label: string; list?: boolean }) {
  if (!value) return null;

  const entries = list ? splitEntries(value) : [];
  const long = list ? entries.length > SHOWN || entries.some((e) => e.length > LONG) : value.length > LONG;

  const preview = list ? (
    <span className="block min-w-0">
      {entries.slice(0, SHOWN).map((entry, i) => (
        <span key={i} className="block truncate">{entry}</span>
      ))}
      {entries.length > SHOWN && <span className="block text-[11px] font-medium text-primary">+{entries.length - SHOWN} more</span>}
    </span>
  ) : (
    <span className="block truncate">{value}</span>
  );

  if (!long) return preview;

  const copy = () => {
    void navigator.clipboard
      .writeText(list ? entries.join("\n") : value)
      .then(() => toast.success(`${label} copied.`))
      .catch(() => toast.error("Could not copy to the clipboard."));
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="group/cell flex w-full min-w-0 items-start gap-1 rounded-sm text-left hover:bg-primary/5 focus:outline-none focus-visible:ring-1 focus-visible:ring-primary"
          title="Click to read all of it"
        >
          <span className="min-w-0 flex-1">{preview}</span>
          <Maximize2 className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground/50 group-hover/cell:text-primary" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 max-w-[calc(100vw-1rem)] p-3 text-xs" style={{ fontFamily: "var(--font-sans)" }}>
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
          <Button type="button" variant="ghost" size="sm" className="h-6 gap-1 px-1.5 text-[11px]" onClick={copy}>
            <Copy className="h-3 w-3" /> Copy
          </Button>
        </div>
        {list ? (
          <ul className="max-h-64 space-y-1.5 overflow-y-auto">
            {entries.map((entry, i) => (
              <li key={i} className={cn("rounded bg-secondary/50 px-2 py-1 text-foreground")}>{entry}</li>
            ))}
          </ul>
        ) : (
          <p className="max-h-64 overflow-y-auto whitespace-pre-wrap break-words text-foreground">{value}</p>
        )}
      </PopoverContent>
    </Popover>
  );
}
