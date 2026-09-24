import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { CheckCircle2, Loader2, PackageCheck, PackageX, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { PortalShell, PortalError } from "@/components/app/portal-shell";
import { apiPortalGetPo, apiPortalRespondPo, type PortalPo, type PortalPoSigner } from "@/lib/api";
import { toast } from "sonner";

export const Route = createFileRoute("/portal/po/$token")({
  head: () => ({ meta: [{ title: "Purchase Order — DOST Caraga Supplier Portal" }, { name: "robots", content: "noindex" }] }),
  component: PortalPoPage,
});

const money = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const when = (value: string) => (value ? new Date(value).toLocaleString("en-PH", { dateStyle: "long", timeStyle: "short", timeZone: "Asia/Manila" }) : "");

/** Flowchart: "Forward Signed PO to Supplier Portal" -> "Does supplier waive to deliver?". */
function PortalPoPage() {
  const { token } = Route.useParams();
  const [po, setPo] = useState<PortalPo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [waiving, setWaiving] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    apiPortalGetPo(token)
      .then(setPo)
      .catch((e) => setError(e instanceof Error ? e.message : "This link could not be opened."));
  }, [token]);

  async function respond(waived: boolean) {
    if (waived && !reason.trim()) {
      toast.error("Tell us why you are waiving delivery.");
      return;
    }
    setBusy(true);
    try {
      const result = await apiPortalRespondPo(token, waived, waived ? reason.trim() : undefined);
      setPo(result.data);
      toast.success(result.message);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Your answer could not be sent. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (error) return <PortalError message={error} />;
  if (!po) {
    return (
      <PortalShell>
        <div className="flex items-center justify-center gap-2 py-24 text-sm text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" /> Loading your Purchase Order…
        </div>
      </PortalShell>
    );
  }

  return (
    <PortalShell agency={po.agencyName}>
      <div className="space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="label-eyebrow">Purchase Order</p>
            <h1 className="text-2xl font-bold text-navy">{po.poNo}</h1>
            <p className="mt-1 text-sm text-muted-foreground">Awarded to {po.supplierName}</p>
          </div>
          <Button variant="outline" className="gap-1.5 border-border print:hidden" onClick={() => window.print()}>
            <Printer className="h-4 w-4" /> Print / save as PDF
          </Button>
        </div>

        {po.status === "Delivery Accepted" && (
          <Card className="flex items-start gap-3 border border-success/30 bg-success/5 p-4 text-sm print:hidden">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success" />
            <p className="font-semibold text-success">You confirmed delivery{po.deliveryAcceptedAt ? ` on ${when(po.deliveryAcceptedAt)}` : ""}. Thank you.</p>
          </Card>
        )}
        {po.deliveryWaived && (
          <Card className="border border-warning/30 bg-warning/5 p-4 text-sm print:hidden">
            <p className="font-semibold text-warning-foreground">You waived delivery of this Purchase Order.</p>
            {po.deliveryWaivedReason && <p className="mt-1 text-foreground">Reason: {po.deliveryWaivedReason}</p>}
          </Card>
        )}

        <Card className="grid grid-cols-1 gap-3 border border-border bg-card p-4 text-sm sm:grid-cols-3">
          <Field label="PO date" value={po.poDate} />
          <Field label="PR no." value={po.prNo} />
          <Field label="Mode of procurement" value={po.modeOfProcurement} />
          <Field label="Supplier address" value={po.supplierAddress} />
          <Field label="TIN" value={po.supplierTin} />
          <Field label="Place of delivery" value={po.placeOfDelivery} />
          <Field label="Delivery date" value={po.deliveryDate} />
          {po.termsAndConditions && (
            <div className="sm:col-span-3">
              <p className="label-eyebrow">Terms &amp; conditions</p>
              <p className="mt-0.5 whitespace-pre-line text-foreground">{po.termsAndConditions}</p>
            </div>
          )}
        </Card>

        <Card className="overflow-hidden border border-border bg-card">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-secondary/40 text-left">
                <tr>
                  <th className="label-eyebrow px-3 py-2">No.</th>
                  <th className="label-eyebrow px-3 py-2">Description</th>
                  <th className="label-eyebrow px-3 py-2 text-right">Qty</th>
                  <th className="label-eyebrow px-3 py-2 text-right">Unit cost (₱)</th>
                  <th className="label-eyebrow px-3 py-2 text-right">Amount (₱)</th>
                </tr>
              </thead>
              <tbody>
                {po.items.map((it) => (
                  <tr key={it.itemNo} className="border-t border-border align-top">
                    <td className="px-3 py-2 font-semibold text-navy">{it.itemNo}</td>
                    <td className="whitespace-pre-line px-3 py-2">{it.description}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{it.quantity} {it.uom}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{money(it.unitCost)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{money(it.totalCost)}</td>
                  </tr>
                ))}
                <tr className="border-t border-border bg-secondary/30">
                  <td colSpan={4} className="px-3 py-2 text-right text-xs font-bold uppercase tracking-wider">Total amount</td>
                  <td className="px-3 py-2 text-right font-bold tabular-nums text-navy">₱{money(po.totalAmount)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </Card>

        <Card className="grid grid-cols-1 gap-4 border border-border bg-card p-4 sm:grid-cols-3">
          <Signer title="Funds obligated by" signer={po.signatures.budgetOfficer} />
          <Signer title="Accounting" signer={po.signatures.accountingOfficer} />
          <Signer title="Approved by" signer={po.signatures.approvedBy} />
        </Card>

        {po.canRespond && (
          <Card className="space-y-3 border border-primary/30 bg-primary/5 p-4 print:hidden">
            <h2 className="text-sm font-semibold text-navy">Will you deliver this order?</h2>
            <p className="text-sm text-muted-foreground">Confirm to accept the Purchase Order and its delivery terms. If you can no longer supply it, waive delivery and tell us why.</p>
            {waiving && (
              <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why you are waiving delivery…" className="border-border bg-card" aria-label="Reason for waiving delivery" />
            )}
            <div className="flex flex-wrap gap-2">
              {waiving ? (
                <>
                  <Button variant="ghost" disabled={busy} onClick={() => setWaiving(false)}>Back</Button>
                  <Button variant="destructive" className="gap-1.5" disabled={busy} onClick={() => respond(true)}>
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <PackageX className="h-4 w-4" />} Waive delivery
                  </Button>
                </>
              ) : (
                <>
                  <Button className="gap-1.5" disabled={busy} onClick={() => respond(false)}>
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <PackageCheck className="h-4 w-4" />} Confirm — we will deliver
                  </Button>
                  <Button variant="outline" className="gap-1.5 border-border" disabled={busy} onClick={() => setWaiving(true)}>
                    <PackageX className="h-4 w-4" /> We can't deliver
                  </Button>
                </>
              )}
            </div>
          </Card>
        )}
      </div>
    </PortalShell>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="label-eyebrow">{label}</p>
      <p className="mt-0.5 text-foreground">{value || "—"}</p>
    </div>
  );
}

function Signer({ title, signer }: { title: string; signer: PortalPoSigner | null }) {
  return (
    <div className="text-center text-sm">
      <p className="label-eyebrow">{title}</p>
      <div className="flex h-14 items-end justify-center">
        {signer?.signature ? <img src={signer.signature} alt={`${signer.name}'s e-signature`} className="max-h-14 max-w-full object-contain" /> : null}
      </div>
      <p className="border-t border-border pt-1 font-semibold text-navy">{signer?.name ?? "—"}</p>
      {signer?.signedAt && <p className="text-xs text-muted-foreground">Signed {when(signer.signedAt)}</p>}
    </div>
  );
}
