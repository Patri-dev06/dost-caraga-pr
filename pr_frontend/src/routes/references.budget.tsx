import { createFileRoute } from "@tanstack/react-router";
import { FormEvent, ReactNode, useState } from "react";
import { Loader2, Plus } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { ReferenceTablePage } from "@/components/app/reference-table-page";
import { fmtPHP } from "@/lib/mock-data";
import { apiCreateBudget, apiGetBudget, type BudgetCreatePayload } from "@/lib/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

export const Route = createFileRoute("/references/budget")({
  head: () => ({
    meta: [
      { title: "Budget Allocations — DOST Caraga" },
      { name: "description", content: "Line-item budget allocations and obligation status." },
    ],
  }),
  component: BudgetPage,
});

function BudgetPage() {
  const { data: budgetAllocations = [], isLoading } = useQuery({ queryKey: ["budget", 1], queryFn: () => apiGetBudget(1) });

  return (
    <ReferenceTablePage
      eyebrow="References"
      title="Budget Allocations"
      subtitle="Line-item budget allocations and obligation status for FY 2026."
      actions={<AddBudgetDialog />}
    >
      <Card className="overflow-hidden border border-border bg-card">
        <Table>
          <TableHeader><TableRow className="bg-secondary/40 hover:bg-secondary/40">
            <TableHead className="label-eyebrow">Account Code</TableHead>
            <TableHead className="label-eyebrow">Account Title</TableHead>
            <TableHead className="label-eyebrow text-right">Allocated</TableHead>
            <TableHead className="label-eyebrow text-right">Obligated</TableHead>
            <TableHead className="label-eyebrow text-right">Available</TableHead>
            <TableHead className="label-eyebrow w-[180px]">Utilization</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {isLoading && <TableRow><TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">Fetching data, kindly wait.</TableCell></TableRow>}
            {budgetAllocations.map((b) => {
              const pct = Math.round((b.obligated / b.allocated) * 100);
              return (
                <TableRow key={b.id}>
                  <TableCell className="font-semibold text-navy">{b.code}</TableCell>
                  <TableCell>{b.account}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtPHP(b.allocated)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtPHP(b.obligated)}</TableCell>
                  <TableCell className="text-right font-medium tabular-nums">{fmtPHP(b.allocated - b.obligated)}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2"><Progress value={pct} className="h-1.5" /><span className="w-9 text-right text-xs text-muted-foreground tabular-nums">{pct}%</span></div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>
    </ReferenceTablePage>
  );
}

function AddBudgetDialog() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<BudgetCreatePayload>({
    account_code: "",
    account_name: "",
    allocated_amount: 0,
    obligated_amount: 0,
  });

  const mutation = useMutation({
    mutationFn: (payload: BudgetCreatePayload) => apiCreateBudget(payload, 1),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["budget", 1] });
      toast.success("Budget allocation added.");
      setOpen(false);
      setForm({ account_code: "", account_name: "", allocated_amount: 0, obligated_amount: 0 });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Unable to add budget allocation."),
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
          <DialogTitle>Add Budget Allocation</DialogTitle>
          <DialogDescription>Encode a line-item budget allocation for the selected project.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Account Code">
              <Input required value={form.account_code} onChange={(e) => setForm({ ...form, account_code: e.target.value })} />
            </Field>
            <Field label="Account Title">
              <Input required value={form.account_name} onChange={(e) => setForm({ ...form, account_name: e.target.value })} />
            </Field>
            <Field label="Allocated Amount">
              <Input required type="number" min="0" step="0.01" value={form.allocated_amount} onChange={(e) => setForm({ ...form, allocated_amount: Number(e.target.value) })} />
            </Field>
            <Field label="Obligated Amount">
              <Input type="number" min="0" step="0.01" value={form.obligated_amount} onChange={(e) => setForm({ ...form, obligated_amount: Number(e.target.value) })} />
            </Field>
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
