import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowLeft, CheckCircle, XCircle, RotateCcw, Send, Edit3, Ban, Plus, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader } from "@/components/app/page-header";
import { fmtPHP } from "@/lib/mock-data";
import {
  apiGetPpmpDocumentDetail, apiPpmpDocAction, apiAddPpmpItemManaged, apiRemovePpmpItemManaged,
  apiGetLibEntries, type PpmpItemManaged,
} from "@/lib/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

export const Route = createFileRoute("/ppmp-documents/$docId")({
  head: () => ({ meta: [{ title: "PPMP Document — DOST Caraga" }] }),
  component: PpmpDocDetailPage,
});

const statusColors: Record<string, string> = {
  Draft: "bg-gray-100 text-gray-700",
  Submitted: "bg-blue-100 text-blue-700",
  Approved: "bg-green-100 text-green-700",
  Returned: "bg-yellow-100 text-yellow-700",
  Cancelled: "bg-red-100 text-red-700",
  Rejected: "bg-red-100 text-red-700",
};

function PpmpDocDetailPage() {
  const { docId } = Route.useParams();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["ppmp-document", docId],
    queryFn: () => apiGetPpmpDocumentDetail(Number(docId)),
  });

  const actionMutation = useMutation({
    mutationFn: ({ action, payload }: { action: string; payload?: Record<string, unknown> }) =>
      apiPpmpDocAction(Number(docId), action, payload),
    onSuccess: (result) => {
      toast.success(result.message);
      queryClient.invalidateQueries({ queryKey: ["ppmp-document", docId] });
      queryClient.invalidateQueries({ queryKey: ["ppmp-documents"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const removeMutation = useMutation({
    mutationFn: (itemId: number) => apiRemovePpmpItemManaged(Number(docId), itemId),
    onSuccess: () => {
      toast.success("Item removed.");
      queryClient.invalidateQueries({ queryKey: ["ppmp-document", docId] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  if (isLoading || !data) return <div className="p-6 text-center text-muted-foreground">Loading...</div>;

  const doc = data.document;
  const items = data.items;
  const trail = data.approvalTrail;
  const isEditable = !["Approved", "Cancelled", "Rejected"].includes(doc.status);

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <Link to="/ppmp-documents"><Button variant="ghost" size="sm"><ArrowLeft className="mr-1.5 h-4 w-4" />Back</Button></Link>

      <PageHeader eyebrow="Budget & Planning" title={`PPMP: ${doc.ppmpNo || `#${doc.id}`}`} subtitle={`${doc.projectTitle ?? "Project"} — FY ${doc.fiscalYear}`} />

      <div className="flex items-center gap-3">
        <Badge className={statusColors[doc.status] ?? ""}>{doc.status}</Badge>
        <Badge variant="outline">{doc.documentType}</Badge>
        <span className="text-sm text-muted-foreground">Version {doc.version}</span>
        {doc.fundSourceName && <Badge variant="secondary">{doc.fundSourceName}</Badge>}
      </div>

      <div className="grid grid-cols-3 gap-4">
        <StatCard label="Total Budget" value={fmtPHP(doc.totalEstimatedBudget)} />
        <StatCard label="Items" value={String(doc.rowCount)} />
        <StatCard label="Encumbered" value={fmtPHP(items.reduce((sum, i) => sum + i.encumberedAmount, 0))} />
      </div>

      {/* Actions */}
      <Card>
        <CardHeader><CardTitle>Actions</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {(doc.status === "Draft" || doc.status === "Returned") && (
            <Button size="sm" onClick={() => actionMutation.mutate({ action: "submit" })} disabled={actionMutation.isPending}>
              <Send className="mr-1.5 h-4 w-4" />Submit for Approval
            </Button>
          )}
          {doc.status === "Submitted" && (
            <>
              <Button size="sm" onClick={() => actionMutation.mutate({ action: "approve" })} disabled={actionMutation.isPending}>
                <CheckCircle className="mr-1.5 h-4 w-4" />Approve
              </Button>
              <RemarksAction label="Return" icon={<RotateCcw className="mr-1.5 h-4 w-4" />} onSubmit={(remarks) => actionMutation.mutate({ action: "return", payload: { remarks } })} />
              <RemarksAction label="Reject" icon={<XCircle className="mr-1.5 h-4 w-4" />} variant="destructive" onSubmit={(remarks) => actionMutation.mutate({ action: "reject", payload: { remarks } })} />
            </>
          )}
          {doc.status === "Approved" && (
            <Button size="sm" variant="outline" onClick={() => actionMutation.mutate({ action: "amend" })} disabled={actionMutation.isPending}>
              <Edit3 className="mr-1.5 h-4 w-4" />Create Amendment
            </Button>
          )}
          {!["Cancelled", "Rejected"].includes(doc.status) && (
            <RemarksAction label="Cancel" icon={<Ban className="mr-1.5 h-4 w-4" />} variant="destructive" fieldLabel="Reason" onSubmit={(reason) => actionMutation.mutate({ action: "cancel", payload: { reason } })} />
          )}
        </CardContent>
      </Card>

      {/* Items Table */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Line Items ({items.length})</CardTitle>
          {isEditable && <AddItemDialog docId={Number(docId)} projectId={doc.projectId} fundSourceId={doc.fundSourceId} />}
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Item</TableHead>
                <TableHead>LIB Account</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Unit Cost</TableHead>
                <TableHead className="text-right">Budget</TableHead>
                <TableHead className="text-right">Encumbered</TableHead>
                <TableHead className="text-right">Available</TableHead>
                {isEditable && <TableHead className="w-[50px]" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.length === 0 && (
                <TableRow><TableCell colSpan={isEditable ? 8 : 7} className="py-6 text-center text-muted-foreground">No items yet. Add items to this PPMP.</TableCell></TableRow>
              )}
              {items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-medium">{item.itemName ?? `Item #${item.id}`}</TableCell>
                  <TableCell className="text-sm">{item.libAccountCode ?? "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{item.quantity}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtPHP(item.estimatedUnitCost)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtPHP(item.estimatedBudget)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtPHP(item.encumberedAmount)}</TableCell>
                  <TableCell className="text-right tabular-nums font-medium text-green-700">{fmtPHP(item.availableAmount)}</TableCell>
                  {isEditable && (
                    <TableCell>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeMutation.mutate(item.id)} disabled={item.encumberedAmount > 0}>
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Approval Trail */}
      {trail.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Approval Trail</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader><TableRow><TableHead>Stage</TableHead><TableHead>Approver</TableHead><TableHead>Action</TableHead><TableHead>Remarks</TableHead><TableHead>Date</TableHead></TableRow></TableHeader>
              <TableBody>
                {trail.map((step) => (
                  <TableRow key={step.id}>
                    <TableCell>{step.stageName}</TableCell>
                    <TableCell>{step.approverName}</TableCell>
                    <TableCell><Badge variant="outline">{step.action}</Badge></TableCell>
                    <TableCell className="max-w-[200px] truncate">{step.remarks ?? "-"}</TableCell>
                    <TableCell className="text-xs">{step.actedAt ? new Date(step.actedAt).toLocaleString("en-PH") : "-"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function AddItemDialog({ docId, projectId, fundSourceId }: { docId: number; projectId: number; fundSourceId: number | null }) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data: libEntries = [] } = useQuery({
    queryKey: ["lib-entries", { status: "Approved", project_id: projectId }],
    queryFn: () => apiGetLibEntries({ status: "Approved", project_id: projectId }),
    enabled: open,
  });

  const [form, setForm] = useState({
    item_name: "",
    lib_entry_id: 0,
    quantity: 1,
    estimated_unit_cost: 0,
  });

  const mutation = useMutation({
    mutationFn: () => apiAddPpmpItemManaged(docId, {
      item_name: form.item_name,
      lib_entry_id: form.lib_entry_id,
      fund_source_id: fundSourceId,
      quantity: form.quantity,
      estimated_unit_cost: form.estimated_unit_cost,
    }),
    onSuccess: () => {
      toast.success("Item added.");
      queryClient.invalidateQueries({ queryKey: ["ppmp-document", String(docId)] });
      setOpen(false);
      setForm({ item_name: "", lib_entry_id: 0, quantity: 1, estimated_unit_cost: 0 });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm"><Plus className="mr-1.5 h-4 w-4" />Add Item</Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Add PPMP Item</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Item Name *</Label>
            <Input value={form.item_name} onChange={(e) => setForm({ ...form, item_name: e.target.value })} placeholder="e.g. Bond Paper A4" />
          </div>
          <div className="space-y-2">
            <Label>LIB Entry (Budget Source) *</Label>
            <Select value={form.lib_entry_id ? String(form.lib_entry_id) : ""} onValueChange={(v) => setForm({ ...form, lib_entry_id: Number(v) })}>
              <SelectTrigger><SelectValue placeholder="Select LIB entry" /></SelectTrigger>
              <SelectContent>
                {libEntries.map((lib) => (
                  <SelectItem key={lib.id} value={String(lib.id)}>
                    {lib.accountCode} — {lib.objectOfExpenditure} (Avail: {fmtPHP(lib.availableAmount)})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Quantity *</Label>
              <Input type="number" min="0.01" step="0.01" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: Number(e.target.value) })} />
            </div>
            <div className="space-y-2">
              <Label>Estimated Unit Cost *</Label>
              <Input type="number" min="0" step="0.01" value={form.estimated_unit_cost || ""} onChange={(e) => setForm({ ...form, estimated_unit_cost: Number(e.target.value) })} />
            </div>
          </div>
          {form.quantity > 0 && form.estimated_unit_cost > 0 && (
            <p className="text-sm text-muted-foreground">Estimated Budget: <strong>{fmtPHP(form.quantity * form.estimated_unit_cost)}</strong></p>
          )}
        </div>
        <DialogFooter>
          <Button onClick={() => mutation.mutate()} disabled={!form.item_name || !form.lib_entry_id || mutation.isPending}>
            Add Item
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground uppercase tracking-wide">{label}</p>
        <p className="text-lg font-bold tabular-nums text-navy">{value}</p>
      </CardContent>
    </Card>
  );
}

function RemarksAction({ label, icon, variant = "outline", fieldLabel = "Remarks", onSubmit }: { label: string; icon: React.ReactNode; variant?: "outline" | "destructive"; fieldLabel?: string; onSubmit: (value: string) => void }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant={variant}>{icon}{label}</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>{label}</DialogTitle></DialogHeader>
        <div className="space-y-2">
          <label className="text-sm font-medium">{fieldLabel}</label>
          <Textarea value={value} onChange={(e) => setValue(e.target.value)} placeholder={`Enter ${fieldLabel.toLowerCase()}...`} />
        </div>
        <DialogFooter>
          <Button variant={variant === "destructive" ? "destructive" : "default"} disabled={!value.trim()} onClick={() => { onSubmit(value.trim()); setOpen(false); setValue(""); }}>
            Confirm {label}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
