import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiUpdateRfqSupplier, type Rfq, type RfqSupplier } from "@/lib/api";

/**
 * Fixes a wrong name, address, contact number, email or TIN on a canvassed supplier. It updates
 * the Suppliers directory too, and with it every RFQ still waiting on that supplier; once a
 * supplier's signed quotation is recorded, their details on that RFQ stay as they were.
 */
export function RfqSupplierEditDialog({
  rfqId,
  supplier,
  onClose,
  onSaved,
}: {
  rfqId: string;
  supplier: RfqSupplier | null;
  onClose: () => void;
  onSaved: (rfq: Rfq) => void;
}) {
  return (
    <Dialog open={supplier !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">{supplier && <EditForm key={supplier.id} rfqId={rfqId} supplier={supplier} onClose={onClose} onSaved={onSaved} />}</DialogContent>
    </Dialog>
  );
}

function EditForm({ rfqId, supplier, onClose, onSaved }: { rfqId: string; supplier: RfqSupplier; onClose: () => void; onSaved: (rfq: Rfq) => void }) {
  const [form, setForm] = useState({
    name: supplier.supplierName,
    address: supplier.supplierAddress,
    contact_no: supplier.supplierContactNo,
    email: supplier.supplierEmail,
    tin: supplier.supplierTin,
  });
  const [saving, setSaving] = useState(false);
  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [key]: e.target.value }));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const { message, data } = await apiUpdateRfqSupplier(rfqId, supplier.id, {
        name: form.name.trim(),
        address: form.address.trim() || undefined,
        contact_no: form.contact_no.trim() || undefined,
        email: form.email.trim() || undefined,
        tin: form.tin.trim() || undefined,
      });
      toast.success(message);
      onSaved(data);
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to update the supplier.");
    } finally {
      setSaving(false);
    }
  }

  const fields: { key: keyof typeof form; label: string; type?: string }[] = [
    { key: "name", label: "Name of company / establishment" },
    { key: "address", label: "Address" },
    { key: "contact_no", label: "Contact no." },
    { key: "email", label: "Email", type: "email" },
    { key: "tin", label: "TIN" },
  ];

  return (
    <form onSubmit={save} className="space-y-4">
      <DialogHeader>
        <DialogTitle>Correct supplier details</DialogTitle>
        <DialogDescription>
          {supplier.supplierId
            ? "This also updates the Suppliers directory and every RFQ still waiting on this supplier."
            : "This supplier has no directory entry, so only this RFQ is updated."}
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-3">
        {fields.map((f) => (
          <div key={f.key} className="space-y-1.5">
            <Label htmlFor={`rfq-supplier-${f.key}`} className="text-xs text-muted-foreground">{f.label}</Label>
            <Input id={`rfq-supplier-${f.key}`} type={f.type ?? "text"} value={form[f.key]} onChange={set(f.key)} required={f.key === "name"} className="h-9" />
          </div>
        ))}
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
        <Button type="submit" disabled={saving || !form.name.trim()} className="gap-1.5">
          {saving && <Loader2 className="h-4 w-4 animate-spin" />} Save
        </Button>
      </DialogFooter>
    </form>
  );
}
