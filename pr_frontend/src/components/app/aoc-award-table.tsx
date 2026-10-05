import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiUpdateAocAwards, type AbstractOfCanvas } from "@/lib/api";
import { fmtAmount } from "@/lib/lib-store";
import { splitRfqDescription } from "@/lib/rfq-format";

/**
 * Who wins which line. The Abstract of Canvass awards item by item, so one canvass can be split
 * across every dealer that quoted; the award starts on the lowest compliant quote per line and
 * Supply can move it before the AOC goes to the BAC.
 */
export function AocAwardTable({ aoc, editable, onSaved }: { aoc: AbstractOfCanvas; editable: boolean; onSaved: () => void }) {
  const suppliers = aoc.suppliers.filter((s) => s.quoteItems.length > 0);

  // Only the lines actually moved are sent, so an untouched award keeps its remarks.
  const [moved, setMoved] = useState<Record<string, string | null>>({});
  const [saving, setSaving] = useState(false);

  const awardedIn = (itemId: string) =>
    moved[itemId] !== undefined
      ? moved[itemId]
      : suppliers.find((s) => s.quoteItems.some((qi) => qi.rfqItemId === itemId && qi.isAwarded))?.id ?? null;

  async function save() {
    setSaving(true);
    try {
      await apiUpdateAocAwards(
        aoc.id,
        Object.entries(moved).map(([rfqItemId, rfqSupplierId]) => ({ rfqItemId, rfqSupplierId })),
      );
      toast.success("The award was updated.");
      setMoved({});
      onSaved();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to update the award.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="overflow-hidden border border-border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-navy">Award per item</h2>
          <p className="text-xs text-muted-foreground">
            Each line goes to its own dealer. A dealer that did not quote a line, or whose quote failed the TWG check, cannot win it.
          </p>
        </div>
        {editable && Object.keys(moved).length > 0 && (
          <Button size="sm" disabled={saving} onClick={save} className="gap-1.5">
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Save award
          </Button>
        )}
      </div>

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-secondary/40 hover:bg-secondary/40">
              <TableHead className="label-eyebrow">Item</TableHead>
              <TableHead className="label-eyebrow text-right">ABC</TableHead>
              {suppliers.map((s) => <TableHead key={s.id} className="label-eyebrow text-right">{s.supplierName}</TableHead>)}
            </TableRow>
          </TableHeader>
          <TableBody>
            {aoc.items.map((item) => {
              const winner = awardedIn(item.id);
              return (
                <TableRow key={item.id}>
                  <TableCell className="font-medium text-navy">
                    <span className="text-muted-foreground">{item.itemNo}.</span> {splitRfqDescription(item.description).name}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">₱{fmtAmount(Number(item.unitAbc ?? 0))}</TableCell>
                  {suppliers.map((s) => {
                    const q = s.quoteItems.find((qi) => qi.rfqItemId === item.id);
                    const quoted = q && q.unitPrice !== null;
                    const blocked = !quoted || q?.twgComplies === false;
                    return (
                      <TableCell key={s.id} className="text-right">
                        <label className={`inline-flex items-center justify-end gap-1.5 ${blocked ? "text-muted-foreground" : "cursor-pointer"}`}>
                          <span className={`tabular-nums ${winner === s.id ? "font-semibold text-success" : ""}`}>
                            {quoted ? `₱${fmtAmount(Number(q.unitPrice))}` : "NONE"}
                          </span>
                          <input
                            type="radio"
                            name={`award-${item.id}`}
                            checked={winner === s.id}
                            disabled={!editable || blocked}
                            onChange={() => setMoved((m) => ({ ...m, [item.id]: s.id }))}
                          />
                        </label>
                        {q?.twgComplies === false && <span className="block text-[10px] text-destructive">Did not comply</span>}
                      </TableCell>
                    );
                  })}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}
