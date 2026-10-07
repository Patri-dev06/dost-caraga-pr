import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, FileSignature, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { apiDownloadSignedCopy, apiGetPrSignedCopies, type SignedCopy } from "@/lib/api";

/** Signatures are wet for now: the scan of the signed paper is what moves a document past its final signing step. */
const SIGNED_COPY_ACCEPT = ".pdf,.jpg,.jpeg,.png";
const MAX_BYTES = 10 * 1024 * 1024;

export type SignedCopySubmit = { file: File; remarks: string; signedBy?: "chair" | "vice" };

/**
 * Asks for the scanned copy with the wet signatures before a final signing step goes through.
 * `onBehalfOf` names the signatory when the Supply team uploads it for them (it is recorded as such);
 * `askSignedBy` lets Supply say which BAC officer signed an RFQ on paper.
 */
export function SignedCopyDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  onBehalfOf,
  askSignedBy,
  withRemarks = true,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  onBehalfOf?: string | null;
  askSignedBy?: boolean;
  withRemarks?: boolean;
  onConfirm: (submit: SignedCopySubmit) => Promise<unknown>;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        {open && (
          <SignedCopyForm
            title={title}
            description={description}
            confirmLabel={confirmLabel}
            onBehalfOf={onBehalfOf}
            askSignedBy={askSignedBy}
            withRemarks={withRemarks}
            onConfirm={onConfirm}
            onClose={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function SignedCopyForm({
  title,
  description,
  confirmLabel,
  onBehalfOf,
  askSignedBy,
  withRemarks,
  onConfirm,
  onClose,
}: {
  title: string;
  description: string;
  confirmLabel: string;
  onBehalfOf?: string | null;
  askSignedBy?: boolean;
  withRemarks: boolean;
  onConfirm: (submit: SignedCopySubmit) => Promise<unknown>;
  onClose: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [remarks, setRemarks] = useState("");
  const [signedBy, setSignedBy] = useState<"chair" | "vice" | "">("");
  const [saving, setSaving] = useState(false);
  const tooBig = file !== null && file.size > MAX_BYTES;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!file || tooBig || (askSignedBy && !signedBy)) return;
    setSaving(true);
    try {
      await onConfirm({ file, remarks: remarks.trim(), signedBy: askSignedBy && signedBy ? signedBy : undefined });
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to save. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
      </DialogHeader>

      {onBehalfOf && (
        <p className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-foreground">
          You are uploading this for the <span className="font-semibold">{onBehalfOf}</span>. It will be recorded as uploaded by you on their behalf.
        </p>
      )}

      {askSignedBy && (
        <div className="space-y-1.5">
          <Label>Who signed it on paper?</Label>
          <div className="flex gap-2">
            {(
              [
                ["chair", "BAC Chairman"],
                ["vice", "BAC Vice-Chairman"],
              ] as const
            ).map(([value, label]) => (
              <Button key={value} type="button" size="sm" variant={signedBy === value ? "default" : "outline"} className="flex-1" onClick={() => setSignedBy(value)}>
                {label}
              </Button>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="signed-copy-file">Scanned signed copy</Label>
        <Input id="signed-copy-file" type="file" accept={SIGNED_COPY_ACCEPT} onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="border-border text-sm" />
        <p className={tooBig ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>
          {tooBig ? "This file is larger than 10 MB. Scan at a lower resolution or save it as a PDF." : "PDF or a clear photo (JPG/PNG) of the page with every signature, up to 10 MB."}
        </p>
      </div>

      {withRemarks && (
        <div className="space-y-1.5">
          <Label htmlFor="signed-copy-remarks">Remarks (optional)</Label>
          <Textarea id="signed-copy-remarks" value={remarks} onChange={(e) => setRemarks(e.target.value)} rows={2} className="border-border" />
        </div>
      )}

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button type="submit" disabled={saving || !file || tooBig || (askSignedBy && !signedBy)} className="gap-1.5">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSignature className="h-4 w-4" />} {confirmLabel}
        </Button>
      </DialogFooter>
    </form>
  );
}

function when(at: string | null): string {
  if (!at) return "";
  const date = new Date(at);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
}

/** The scans on file for a document (or a PR's whole trail), each downloadable. */
export function SignedCopiesList({ copies, emptyText }: { copies: SignedCopy[]; emptyText?: string }) {
  if (copies.length === 0) {
    return emptyText ? <p className="text-sm text-muted-foreground">{emptyText}</p> : null;
  }

  return (
    <ul className="space-y-2">
      {copies.map((copy) => (
        <li key={copy.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2">
          <div className="min-w-0">
            <p className="text-sm font-medium text-navy">
              {copy.label}
              {copy.document && <span className="font-normal text-muted-foreground"> · {copy.document}</span>}
            </p>
            <p className="text-xs text-muted-foreground">
              {[copy.signedFor && `Signed by ${copy.signedFor}`, copy.uploadedBy && (copy.onBehalf ? `uploaded by ${copy.uploadedBy} on their behalf` : `uploaded by ${copy.uploadedBy}`), when(copy.uploadedAt)]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="h-7 gap-1 border-border text-xs"
            onClick={() => apiDownloadSignedCopy(copy.id, copy.originalName).catch((e) => toast.error(e.message))}
          >
            <Download className="h-3.5 w-3.5" /> {copy.originalName}
          </Button>
        </li>
      ))}
    </ul>
  );
}

/** A PR's Supporting Documents: every scan along its trail (PR, RFQ, AOC, PO). */
export function PrSignedCopies({ prId }: { prId: string }) {
  const { data = [], isLoading } = useQuery({ queryKey: ["pr-signed-copies", prId], queryFn: () => apiGetPrSignedCopies(prId) });

  return (
    <Card className="border border-border p-4 sm:p-5">
      <h3 className="text-sm font-bold text-navy">Signed copies</h3>
      <p className="mb-3 text-xs text-muted-foreground">Scans of the wet-signed PR, RFQ, Abstract of Canvass and Purchase Orders, uploaded at each document's final signature.</p>
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Fetching data, kindly wait.</p>
      ) : (
        <SignedCopiesList copies={data} emptyText="No signed copy uploaded yet. The first one is the PR signed by the Regional Director." />
      )}
    </Card>
  );
}
