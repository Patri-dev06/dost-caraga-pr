import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Download, KeyRound, Loader2, ShieldAlert, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { apiDownloadPrDigitalDocument, apiGetPrDigitalDocument } from "@/lib/api";

/**
 * Signs digitally with the user's registered PNPKI certificate: they type its password, which is
 * used once and not saved. `paperLabel` offers the paper route instead (sign by hand, or upload a scan).
 */
export function PnpkiSignDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Sign digitally",
  remarks: withRemarks = true,
  paperLabel,
  onPaper,
  onSign,
  toastErrors = true,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel?: string;
  remarks?: boolean;
  paperLabel?: string;
  onPaper?: () => void;
  onSign: (password: string, remarks: string) => Promise<unknown>;
  /** False when the caller already reports errors (e.g. a mutation's onError). */
  toastErrors?: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        {open && (
          <SignForm
            title={title}
            description={description}
            confirmLabel={confirmLabel}
            withRemarks={withRemarks}
            paperLabel={paperLabel}
            onPaper={onPaper}
            onSign={onSign}
            toastErrors={toastErrors}
            onClose={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function SignForm({
  title,
  description,
  confirmLabel,
  withRemarks,
  paperLabel,
  onPaper,
  onSign,
  toastErrors,
  onClose,
}: {
  title: string;
  description: string;
  confirmLabel: string;
  withRemarks: boolean;
  paperLabel?: string;
  onPaper?: () => void;
  onSign: (password: string, remarks: string) => Promise<unknown>;
  toastErrors: boolean;
  onClose: () => void;
}) {
  const [password, setPassword] = useState("");
  const [remarks, setRemarks] = useState("");
  const [signing, setSigning] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!password) return;
    setSigning(true);
    try {
      await onSign(password, remarks.trim());
      onClose();
    } catch (error) {
      setPassword("");
      if (toastErrors) toast.error(error instanceof Error ? error.message : "Unable to sign. Please try again.");
    } finally {
      setSigning(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
      </DialogHeader>

      <div className="space-y-1.5">
        <Label htmlFor="pnpki-sign-password">PNPKI certificate password</Label>
        <Input id="pnpki-sign-password" type="password" autoComplete="off" autoFocus value={password} onChange={(e) => setPassword(e.target.value)} className="border-border" />
        <p className="text-xs text-muted-foreground">Used once to sign with your registered certificate. It is not saved.</p>
      </div>

      {withRemarks && (
        <div className="space-y-1.5">
          <Label htmlFor="pnpki-sign-remarks">Remarks (optional)</Label>
          <Textarea id="pnpki-sign-remarks" value={remarks} onChange={(e) => setRemarks(e.target.value)} rows={2} className="border-border" />
        </div>
      )}

      <DialogFooter className="flex-wrap gap-2 sm:justify-between">
        {paperLabel && onPaper ? (
          <Button
            type="button"
            variant="ghost"
            className="text-muted-foreground"
            disabled={signing}
            onClick={() => {
              onClose();
              onPaper();
            }}
          >
            {paperLabel}
          </Button>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={signing}>
            Cancel
          </Button>
          <Button type="submit" className="gap-1.5" disabled={signing || !password}>
            {signing ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />} {confirmLabel}
          </Button>
        </div>
      </DialogFooter>
    </form>
  );
}

const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("en-PH", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }) : "";

/** The PR's PNPKI-signed PDF: who has signed so far, a fresh check of each signature, and the download. */
export function PrDigitalDocumentCard({ prId, prNo }: { prId: string; prNo: string }) {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["pr-digital-document", prId], queryFn: () => apiGetPrDigitalDocument(prId) });
  const [checking, setChecking] = useState(false);

  if (isLoading || !data) return null;

  async function check() {
    setChecking(true);
    try {
      queryClient.setQueryData(["pr-digital-document", prId], await apiGetPrDigitalDocument(prId, true));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to check the signatures.");
    } finally {
      setChecking(false);
    }
  }

  return (
    <Card className="border border-border p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-bold text-navy">Digitally signed PR (PNPKI)</h3>
          <p className="text-xs text-muted-foreground">The PR as a PDF, signed with each signatory's PNPKI certificate. Adobe Reader shows the same signatures.</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" className="h-8 gap-1 border-border text-xs" disabled={checking} onClick={check}>
            {checking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />} Check signatures
          </Button>
          <Button size="sm" className="h-8 gap-1 text-xs" onClick={() => apiDownloadPrDigitalDocument(prId, prNo).catch((e) => toast.error(e.message))}>
            <Download className="h-3.5 w-3.5" /> Download PDF
          </Button>
        </div>
      </div>

      <ul className="mt-3 space-y-2">
        {data.fields.map((field) => {
          const broken = field.check && !(field.check.intact && field.check.valid);
          return (
            <li key={field.name} className="flex flex-wrap items-start justify-between gap-2 rounded-md border border-border px-3 py-2 text-sm">
              <div className="min-w-0">
                <p className="font-medium text-navy">{field.label}</p>
                <p className="text-xs text-muted-foreground">
                  {field.signed
                    ? `Signed by ${field.signerName} · certificate ${field.certificateCn} (serial ${field.certificateSerial}) · ${when(field.signedAt)}`
                    : "Not signed digitally"}
                </p>
              </div>
              {field.signed && field.check && (
                <span
                  className={`flex items-center gap-1 text-xs font-semibold ${broken ? "text-destructive" : field.check.trusted ? "text-success" : "text-warning-foreground"}`}
                  title={field.check.summary}
                >
                  {broken ? <ShieldAlert className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                  {broken ? "Signature broken: the PDF was changed" : field.check.trusted ? "Valid and trusted" : "Valid, but the issuer is not trusted"}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
