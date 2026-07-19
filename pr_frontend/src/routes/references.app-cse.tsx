import { createFileRoute } from "@tanstack/react-router";
import { FormEvent, ReactNode, useState } from "react";
import { Loader2, Plus } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ReferenceTablePage } from "@/components/app/reference-table-page";
import { fmtPHP } from "@/lib/mock-data";
import { apiCreateAppCse, apiGetAppCse, type AppCseCreatePayload } from "@/lib/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

export const Route = createFileRoute("/references/app-cse")({
  head: () => ({
    meta: [
      { title: "APP-CSE — DOST Caraga" },
      { name: "description", content: "Annual Procurement Plan for Common-Use Supplies and Equipment." },
    ],
  }),
  component: AppCsePage,
});

function AppCsePage() {
  const { data: appCseEntries = [], isLoading } = useQuery({ queryKey: ["app-cse"], queryFn: apiGetAppCse });

  return (
    <ReferenceTablePage
      eyebrow="References"
      title="APP-CSE"
      subtitle="Annual Procurement Plan — Common-Use Supplies & Equipment."
      actions={<AddAppCseDialog />}
    >
      <Card className="overflow-hidden border border-border bg-card">
        <Table>
          <TableHeader><TableRow className="bg-secondary/40 hover:bg-secondary/40">
            <TableHead className="label-eyebrow">Code</TableHead>
            <TableHead className="label-eyebrow">Item</TableHead>
            <TableHead className="label-eyebrow">UoM</TableHead>
            <TableHead className="label-eyebrow text-right">Year</TableHead>
            <TableHead className="label-eyebrow text-right">Qty</TableHead>
            <TableHead className="label-eyebrow text-right">Unit Price</TableHead>
            <TableHead className="label-eyebrow text-right">Total</TableHead>
            <TableHead className="label-eyebrow">Source</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {isLoading && <TableRow><TableCell colSpan={8} className="py-8 text-center text-sm text-muted-foreground">Fetching data, kindly wait.</TableCell></TableRow>}
            {appCseEntries.map((e) => (
              <TableRow key={e.id}>
                <TableCell className="font-semibold text-navy">{e.code}</TableCell>
                <TableCell>{e.item}</TableCell>
                <TableCell>{e.uom}</TableCell>
                <TableCell className="text-right tabular-nums">{e.fiscalYear ?? "—"}</TableCell>
                <TableCell className="text-right tabular-nums">{e.qty}</TableCell>
                <TableCell className="text-right tabular-nums">{fmtPHP(e.unitPrice)}</TableCell>
                <TableCell className="text-right font-medium tabular-nums">{fmtPHP(e.qty * e.unitPrice)}</TableCell>
                <TableCell>
                  <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-muted-foreground">
                    {e.isConsolidated ? "From PPMP" : "Manual"}
                  </span>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </ReferenceTablePage>
  );
}

function AddAppCseDialog() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<AppCseCreatePayload>({
    code: "",
    item_name: "",
    category: "Common-Use Supplies",
    uom: "unit",
    quantity: 1,
    unit_price: 0,
  });

  const mutation = useMutation({
    mutationFn: apiCreateAppCse,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["app-cse"] });
      toast.success("APP-CSE entry added.");
      setOpen(false);
      setForm({ code: "", item_name: "", category: "Common-Use Supplies", uom: "unit", quantity: 1, unit_price: 0 });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Unable to add APP-CSE entry."),
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    mutation.mutate(form);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2"><Plus className="h-4 w-4" /> Add Entry</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add APP-CSE Entry</DialogTitle>
          <DialogDescription>Encode a common-use supply or equipment item.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Code"><Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} /></Field>
            <Field label="Item Name"><Input required value={form.item_name} onChange={(e) => setForm({ ...form, item_name: e.target.value })} /></Field>
            <Field label="Category"><Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} /></Field>
            <Field label="UoM"><Input required value={form.uom} onChange={(e) => setForm({ ...form, uom: e.target.value })} /></Field>
            <Field label="Quantity"><Input required type="number" min="0.01" step="0.01" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: Number(e.target.value) })} /></Field>
            <Field label="Unit Price"><Input required type="number" min="0" step="0.01" value={form.unit_price} onChange={(e) => setForm({ ...form, unit_price: Number(e.target.value) })} /></Field>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={mutation.isPending} className="gap-2">
              {mutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Save Entry
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <div className="space-y-1.5"><Label className="label-eyebrow">{label}</Label>{children}</div>;
}
