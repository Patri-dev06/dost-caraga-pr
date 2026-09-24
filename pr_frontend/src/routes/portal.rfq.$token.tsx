import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { CheckCircle2, Clock, Loader2, Printer, Send, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PortalShell, PortalError } from "@/components/app/portal-shell";
import { apiPortalGetRfq, apiPortalSubmitQuote, type PortalRfq } from "@/lib/api";
import { toast } from "sonner";

export const Route = createFileRoute("/portal/rfq/$token")({
  head: () => ({ meta: [{ title: "Request for Quotation — DOST Caraga Supplier Portal" }, { name: "robots", content: "noindex" }] }),
  component: PortalRfqPage,
});

const money = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const when = (value: string) => (value ? new Date(value).toLocaleString("en-PH", { dateStyle: "long", timeStyle: "short", timeZone: "Asia/Manila" }) : "");

/** Flowchart: "Supplier receives RFQ (Supplier Portal)" -> "Supplier sends back signed quotation". */
function PortalRfqPage() {
  const { token } = Route.useParams();
  const [rfq, setRfq] = useState<PortalRfq | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    apiPortalGetRfq(token)
      .then(setRfq)
      .catch((e) => setError(e instanceof Error ? e.message : "This link could not be opened."));
  }, [token]);

  if (error) return <PortalError message={error} />;
  if (!rfq) {
    return (
      <PortalShell>
        <div className="flex items-center justify-center gap-2 py-24 text-sm text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" /> Loading your Request for Quotation…
        </div>
      </PortalShell>
    );
  }

  const priceOf = (id: string) => Number((prices[id] ?? "").replace(/,/g, ""));
  const total = rfq.items.reduce((sum, it) => sum + (Number.isFinite(priceOf(it.id)) ? priceOf(it.id) * it.quantity : 0), 0);

  async function submit() {
    if (!rfq) return;
    const missing = rfq.items.filter((it) => !(prices[it.id] ?? "").trim() || !Number.isFinite(priceOf(it.id)) || priceOf(it.id) < 0);
    if (missing.length > 0) {
      toast.error(`Enter a unit price for item ${missing[0].itemNo}.`);
      return;
    }
    if (!file) {
      toast.error("Upload your signed quotation.");
      return;
    }
    setSubmitting(true);
    try {
      const result = await apiPortalSubmitQuote(token, rfq.items.map((it) => ({ rfq_item_id: it.id, unit_price: priceOf(it.id) })), file);
      setRfq(result.data);
      toast.success(result.message);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Your quotation could not be sent. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <PortalShell agency={rfq.agencyName}>
      <div className="space-y-5">
        <div>
          <p className="label-eyebrow">Request for Quotation</p>
          <h1 className="text-2xl font-bold text-navy">{rfq.rfqNo}</h1>
          <p className="mt-1 text-sm text-muted-foreground">For {rfq.supplierName}</p>
        </div>

        <Card className="grid grid-cols-1 gap-3 border border-border bg-card p-4 text-sm sm:grid-cols-3">
          <div className="sm:col-span-3">
            <p className="label-eyebrow">Purpose</p>
            <p className="mt-0.5 text-foreground">{rfq.purpose || "—"}</p>
          </div>
          <div>
            <p className="label-eyebrow">Place of delivery</p>
            <p className="mt-0.5 text-foreground">{rfq.placeOfDelivery || "—"}</p>
          </div>
          <div>
            <p className="label-eyebrow">Category</p>
            <p className="mt-0.5 text-foreground">{rfq.procurementCategory === "Venue" ? "Venue" : rfq.procurementCategory}</p>
          </div>
          <div>
            <p className="label-eyebrow">Reply by</p>
            <p className="mt-0.5 flex items-center gap-1 font-semibold text-navy"><Clock className="h-4 w-4" /> {when(rfq.replyDueAt) || "—"}</p>
          </div>
        </Card>

        {rfq.status === "Replied" && (
          <Card className="flex items-start gap-3 border border-success/30 bg-success/5 p-4 text-sm">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success" />
            <div>
              <p className="font-semibold text-success">Your quotation was received{rfq.repliedAt ? ` on ${when(rfq.repliedAt)}` : ""}. Thank you.</p>
              {rfq.quotationName && <p className="mt-1 text-muted-foreground">Signed quotation: {rfq.quotationName}</p>}
              <p className="mt-1 text-muted-foreground">The Supply Unit will contact you about the result of the canvass.</p>
            </div>
          </Card>
        )}

        <Card className="overflow-hidden border border-border bg-card">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-secondary/40 text-left">
                <tr>
                  <th className="label-eyebrow px-3 py-2">No.</th>
                  <th className="label-eyebrow px-3 py-2">Item &amp; specifications</th>
                  <th className="label-eyebrow px-3 py-2 text-right">Qty</th>
                  <th className="label-eyebrow px-3 py-2 text-right">Unit price (₱)</th>
                  <th className="label-eyebrow px-3 py-2 text-right">Total (₱)</th>
                </tr>
              </thead>
              <tbody>
                {rfq.items.map((it) => {
                  const unit = rfq.canSubmit ? priceOf(it.id) : (it.unitPrice ?? NaN);
                  return (
                    <tr key={it.id} className="border-t border-border align-top">
                      <td className="px-3 py-2 font-semibold text-navy">{it.itemNo}</td>
                      <td className="whitespace-pre-line px-3 py-2 text-foreground">{it.description}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{it.quantity} {it.uom}</td>
                      <td className="px-3 py-2 text-right">
                        {rfq.canSubmit ? (
                          <Input
                            inputMode="decimal"
                            value={prices[it.id] ?? ""}
                            onChange={(e) => setPrices((p) => ({ ...p, [it.id]: e.target.value }))}
                            placeholder="0.00"
                            className="ml-auto h-9 w-32 border-border text-right tabular-nums"
                            aria-label={`Unit price for item ${it.itemNo}`}
                          />
                        ) : (
                          <span className="tabular-nums">{it.unitPrice !== null ? money(it.unitPrice) : "—"}</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right font-medium tabular-nums">{Number.isFinite(unit) && unit > 0 ? money(unit * it.quantity) : "—"}</td>
                    </tr>
                  );
                })}
                {rfq.canSubmit && (
                  <tr className="border-t border-border bg-secondary/30">
                    <td colSpan={4} className="px-3 py-2 text-right text-xs font-bold uppercase tracking-wider">Total quotation</td>
                    <td className="px-3 py-2 text-right font-bold tabular-nums text-navy">₱{money(total)}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>

        {rfq.canSubmit && (
          <Card className="space-y-3 border border-border bg-card p-4 print:hidden">
            <h2 className="text-sm font-semibold text-navy">Send your signed quotation</h2>
            <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
              <li>Enter your unit price for every item above.</li>
              <li>Print this page (or use your own quotation form), sign it, and scan or photograph it.</li>
              <li>Upload the signed quotation (PDF, JPG or PNG, up to 10 MB) and send.</li>
            </ol>
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="outline" className="gap-1.5 border-border" onClick={() => window.print()}>
                <Printer className="h-4 w-4" /> Print this RFQ
              </Button>
              <label className="flex min-w-0 flex-1 items-center gap-2">
                <Upload className="h-4 w-4 shrink-0 text-muted-foreground" />
                <Input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="h-9 border-border text-xs" aria-label="Signed quotation" />
              </label>
            </div>
            <Button className="w-full gap-1.5 sm:w-auto" disabled={submitting} onClick={submit}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Send quotation
            </Button>
          </Card>
        )}

        {!rfq.canSubmit && rfq.status !== "Replied" && (
          <Card className="border border-border bg-card p-4 text-sm text-muted-foreground">This Request for Quotation is no longer accepting quotations.</Card>
        )}
      </div>
    </PortalShell>
  );
}
