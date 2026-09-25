import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { apiUpdateMonitoringEntry, type MonitoringRow } from "@/lib/api";
import { MONITORING_FIELDS, type MonitoringField, type MonitoringSection } from "@/lib/monitoring-columns";

const SECTIONS: MonitoringSection[] = ["Purchase Request", "Purchase Order", "Delivery", "Inspection & Acceptance", "Issuance", "Payment"];

const INPUT_TYPE: Record<MonitoringField["type"], string> = {
  date: "date",
  datetime: "datetime-local",
  number: "number",
  text: "text",
};

function initialValues(row: MonitoringRow): Record<string, string> {
  return Object.fromEntries(MONITORING_FIELDS.map((f) => [f.key, row.manual[f.key] == null ? "" : String(row.manual[f.key])]));
}

/**
 * The Supply team's editor for one PR's row on the Procurement Monitoring Sheet: only the columns
 * kept by hand (ORS/BURS, delivery, inspection, issuance, payment). Columns the system fills in
 * from the PR, RFQ, AOC and PO stay read-only.
 */
export function MonitoringEntryDialog({ row, onClose }: { row: MonitoringRow | null; onClose: () => void }) {
  return (
    <Dialog open={row !== null} onOpenChange={(open) => !open && onClose()}>
      {/* Header and footer stay put; only the fields scroll, so a long form fits any screen height. */}
      <DialogContent className="flex max-h-[calc(100dvh-2rem)] w-[calc(100vw-1.5rem)] max-w-4xl flex-col gap-0 overflow-hidden p-0">
        {/* Keyed by PR so the form starts fresh for every row. */}
        {row && <EntryForm key={row.prId} row={row} onClose={onClose} />}
      </DialogContent>
    </Dialog>
  );
}

function EntryForm({ row, onClose }: { row: MonitoringRow; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [initial] = useState(() => initialValues(row));
  const [values, setValues] = useState(initial);

  const changed = MONITORING_FIELDS.filter((f) => values[f.key].trim() !== initial[f.key]);

  const save = useMutation({
    mutationFn: () =>
      apiUpdateMonitoringEntry(
        row.prId,
        Object.fromEntries(
          changed.map((f) => {
            const value = values[f.key].trim();
            return [f.key, value === "" ? null : f.type === "number" ? Number(value) : value];
          }),
        ),
      ),
    onSuccess: async ({ message }) => {
      toast.success(message);
      await queryClient.invalidateQueries({ queryKey: ["purchase-requests-monitoring"] });
      await queryClient.invalidateQueries({ queryKey: ["purchase-requests-monitoring-preview"] });
      onClose();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Unable to save the entry."),
  });

  const context = [row.poNo && `PO ${row.poNo}`, row.awardedSupplier, row.purpose].filter(Boolean).join(" · ");

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
      className="flex min-h-0 flex-1 flex-col"
    >
      <DialogHeader className="shrink-0 border-b border-border px-4 py-4 pr-12 text-left sm:px-6">
        <DialogTitle>Edit entry — {row.prNo ?? `PR #${row.prId}`}</DialogTitle>
        <DialogDescription>
          {context || "Fill in what the Supply team tracks by hand."} Columns from the PR, RFQ, AOC and PO are filled in by the system.
        </DialogDescription>
      </DialogHeader>

      <div className="min-h-0 flex-1 space-y-6 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6">
        {SECTIONS.map((section) => {
          const fields = MONITORING_FIELDS.filter((f) => f.section === section);
          return (
            <fieldset key={section} className="space-y-3">
              <legend className="mb-2 text-sm font-semibold text-navy">{section}</legend>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {fields.map((f) => {
                  const id = `monitoring-${f.key}`;
                  const isRemarks = f.type === "text" && /remarks/i.test(f.key);
                  const onChange = (value: string) => setValues((v) => ({ ...v, [f.key]: value }));
                  return (
                    <div key={f.key} className={isRemarks ? "space-y-1.5 sm:col-span-2 lg:col-span-3" : "space-y-1.5"}>
                      <Label htmlFor={id} className="text-xs text-muted-foreground">{f.label}</Label>
                      {isRemarks ? (
                        <Textarea id={id} rows={2} value={values[f.key]} onChange={(e) => onChange(e.target.value)} maxLength={2000} />
                      ) : (
                        <Input
                          id={id}
                          type={INPUT_TYPE[f.type]}
                          value={values[f.key]}
                          onChange={(e) => onChange(e.target.value)}
                          step={f.type === "number" ? "any" : undefined}
                          maxLength={f.type === "text" ? 2000 : undefined}
                          className="h-9"
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </fieldset>
          );
        })}
      </div>

      <DialogFooter className="shrink-0 gap-2 border-t border-border bg-background px-4 py-3 sm:px-6">
        <Button type="button" variant="outline" onClick={onClose} disabled={save.isPending}>Cancel</Button>
        <Button type="submit" disabled={save.isPending || changed.length === 0}>
          {save.isPending ? "Saving…" : changed.length > 0 ? `Save ${changed.length} change${changed.length !== 1 ? "s" : ""}` : "No changes"}
        </Button>
      </DialogFooter>
    </form>
  );
}
