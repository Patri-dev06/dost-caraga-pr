import { useEffect } from "react";
import { Combobox } from "@/components/ui/combobox";
import type { Signatory } from "@/lib/api";
import { cn } from "@/lib/utils";

/**
 * A signatory name: type part of a name and pick the account from the list (the accounts come from
 * the database, optionally only those holding a role). `inline` blends into a printed form's blank.
 * With `autoPickSole`, an empty field fills itself when exactly one account qualifies — e.g. the
 * Regional Director, of whom there is only ever one.
 */
export function PersonPicker({
  value,
  options,
  onPick,
  editing = true,
  variant = "input",
  placeholder = "Type a name…",
  emptyText = "No matching account.",
  autoPickSole = false,
  loading = false,
  className,
}: {
  value: string;
  options: Signatory[];
  onPick: (name: string, person?: Signatory) => void;
  editing?: boolean;
  variant?: "inline" | "input";
  placeholder?: string;
  emptyText?: string;
  autoPickSole?: boolean;
  loading?: boolean;
  className?: string;
}) {
  useEffect(() => {
    if (autoPickSole && editing && !value && options.length === 1) onPick(options[0].name, options[0]);
  }, [autoPickSole, editing, value, options, onPick]);

  if (!editing) return <div className={cn("min-h-[1.4em] px-1 py-0.5", className)}>{value || " "}</div>;

  return (
    <div style={{ fontFamily: "var(--font-sans)" }}>
      <Combobox
        value={value}
        onChange={(name) => onPick(name, options.find((o) => o.name === name))}
        options={options.map((o) => ({ value: o.name, hint: o.position ?? undefined }))}
        placeholder={loading ? "Loading accounts…" : placeholder}
        searchPlaceholder="Type a name to search…"
        emptyText={emptyText}
        className="min-w-[16rem]"
        triggerClassName={cn(
          "print:[&>svg]:hidden",
          variant === "inline" && "h-auto min-h-7 border-transparent bg-transparent px-1 py-0.5 shadow-none hover:border-black/20 hover:bg-amber-50",
          className,
        )}
      />
    </div>
  );
}
