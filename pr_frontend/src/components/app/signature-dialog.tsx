import { useEffect, useRef, useState } from "react";
import { Loader2, Trash2, Upload } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { apiDeleteMySignature, apiGetMySignature, apiMe, apiSetMySignature } from "@/lib/api";
import { toast } from "sonner";

const MAX_BYTES = 1_500_000; // ~1.5 MB image cap

/**
 * Upload / preview / remove the current user's e-signature. A signature is
 * required before the user can sign or approve documents (enforced server-side).
 */
export function SignatureDialog({
  open,
  onOpenChange,
  onChanged,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChanged?: () => void;
}) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setDirty(false);
    setLoading(true);
    apiGetMySignature()
      .then(setDataUrl)
      .catch(() => setDataUrl(null))
      .finally(() => setLoading(false));
  }, [open]);

  function pickFile(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Please choose an image file (PNG or JPG).");
      return;
    }
    if (file.size > MAX_BYTES) {
      toast.error("Image is too large — keep it under 1.5 MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setDataUrl(String(reader.result));
      setDirty(true);
    };
    reader.readAsDataURL(file);
  }

  async function save() {
    if (!dataUrl) return;
    setSaving(true);
    try {
      await apiSetMySignature(dataUrl);
      await apiMe(); // refresh hasSignature on the current user
      toast.success("E-signature saved.");
      onChanged?.();
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Unable to save the signature.");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    setSaving(true);
    try {
      await apiDeleteMySignature();
      await apiMe();
      setDataUrl(null);
      setDirty(false);
      toast.success("E-signature removed.");
      onChanged?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Unable to remove the signature.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>My E-Signature</DialogTitle>
          <DialogDescription>
            Upload a photo or scan of your signature. It's required before you can sign or approve documents.
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-h-[140px] items-center justify-center rounded-md border border-dashed border-border bg-secondary/20 p-4">
          {loading ? (
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          ) : dataUrl ? (
            <img src={dataUrl} alt="E-signature" className="max-h-32 max-w-full object-contain" />
          ) : (
            <p className="text-sm text-muted-foreground">No signature uploaded yet.</p>
          )}
        </div>

        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg"
          className="hidden"
          onChange={(e) => pickFile(e.target.files?.[0])}
        />

        <DialogFooter className="gap-2 sm:justify-between">
          <div className="flex gap-2">
            <Button type="button" variant="outline" className="gap-1.5" onClick={() => fileRef.current?.click()} disabled={saving}>
              <Upload className="h-4 w-4" /> Choose image
            </Button>
            {dataUrl && (
              <Button type="button" variant="outline" className="gap-1.5 text-destructive" onClick={remove} disabled={saving}>
                <Trash2 className="h-4 w-4" /> Remove
              </Button>
            )}
          </div>
          <Button type="button" className="gap-1.5" onClick={save} disabled={saving || !dirty || !dataUrl}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Save signature
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
