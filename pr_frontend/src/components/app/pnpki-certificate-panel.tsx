import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound, Loader2, ShieldCheck, ShieldAlert, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiGetMyPnpkiCertificate, apiMe, apiRegisterPnpkiCertificate, apiRemovePnpkiCertificate, apiVerifyPnpkiPassword } from "@/lib/api";

const dateText = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-PH", { month: "long", day: "numeric", year: "numeric" }) : "—");

/**
 * The user's PNPKI certificate (.p12 from DICT): registered once and kept encrypted on the server.
 * Its password is typed at every signing and never saved.
 */
export function PnpkiCertificatePanel({ onChanged }: { onChanged?: () => void }) {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["my-pnpki-certificate"], queryFn: apiGetMyPnpkiCertificate });
  const [replacing, setReplacing] = useState(false);
  const certificate = data?.certificate ?? null;

  async function changed() {
    await queryClient.invalidateQueries({ queryKey: ["my-pnpki-certificate"] });
    await apiMe(); // refresh hasPnpkiCertificate on the current user
    onChanged?.();
  }

  if (isLoading) {
    return (
      <div className="flex min-h-[80px] items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Your certificate is kept encrypted on the server. You type its password each time you sign. The password is never saved.
      </p>

      {certificate && !replacing ? (
        <>
          <CertificateCard certificate={certificate} />
          <PasswordCheck />
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" className="border-border" onClick={() => setReplacing(true)}>
              Replace certificate
            </Button>
            <RemoveButton onRemoved={changed} />
          </div>
        </>
      ) : (
        <RegisterForm
          replacing={certificate !== null}
          onCancel={certificate ? () => setReplacing(false) : undefined}
          onRegistered={async () => {
            setReplacing(false);
            await changed();
          }}
        />
      )}
    </div>
  );
}

function CertificateCard({ certificate }: { certificate: NonNullable<Awaited<ReturnType<typeof apiGetMyPnpkiCertificate>>["certificate"]> }) {
  const Icon = certificate.expired ? ShieldAlert : ShieldCheck;
  return (
    <div className={`rounded-md border p-3 text-sm ${certificate.expired ? "border-destructive/40 bg-destructive/5" : "border-success/40 bg-success/5"}`}>
      <p className="flex items-center gap-1.5 font-semibold text-navy">
        <Icon className={`h-4 w-4 ${certificate.expired ? "text-destructive" : "text-success"}`} /> {certificate.subjectCn}
      </p>
      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
        <dt className="text-muted-foreground">Issued by</dt>
        <dd className="text-foreground">{certificate.issuerCn ?? "—"}</dd>
        <dt className="text-muted-foreground">Valid until</dt>
        <dd className={certificate.expired ? "font-semibold text-destructive" : "text-foreground"}>
          {dateText(certificate.validTo)}
          {certificate.expired && " · expired, register your renewed certificate"}
        </dd>
        <dt className="text-muted-foreground">Fingerprint</dt>
        <dd className="font-mono text-foreground">{certificate.fingerprint}</dd>
        <dt className="text-muted-foreground">Registered</dt>
        <dd className="text-foreground">{dateText(certificate.registeredAt)}</dd>
      </dl>
    </div>
  );
}

function RegisterForm({ replacing, onCancel, onRegistered }: { replacing: boolean; onCancel?: () => void; onRegistered: () => Promise<void> }) {
  const [file, setFile] = useState<File | null>(null);
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!file || !password) return;
    setSaving(true);
    try {
      const { message } = await apiRegisterPnpkiCertificate(file, password);
      toast.success(message);
      setPassword("");
      await onRegistered();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to register the certificate.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-md border border-border p-3">
      {replacing && <p className="text-xs text-warning-foreground">The new certificate replaces the current one, and the current one is erased from the system.</p>}
      <div className="space-y-1.5">
        <Label htmlFor="pnpki-file">Certificate file (.p12 or .pfx)</Label>
        <Input id="pnpki-file" type="file" accept=".p12,.pfx" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="border-border text-sm" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="pnpki-password">Certificate password</Label>
        <Input id="pnpki-password" type="password" autoComplete="off" value={password} onChange={(e) => setPassword(e.target.value)} className="border-border" />
        <p className="text-xs text-muted-foreground">Used only to check the certificate. It is not saved.</p>
      </div>
      <div className="flex gap-2">
        <Button type="submit" size="sm" className="gap-1.5" disabled={saving || !file || !password}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />} Register certificate
        </Button>
        {onCancel && (
          <Button type="button" size="sm" variant="outline" className="border-border" onClick={onCancel} disabled={saving}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}

/** Lets the user confirm their password opens the stored certificate before they need to sign. */
function PasswordCheck() {
  const [password, setPassword] = useState("");
  const [checking, setChecking] = useState(false);

  async function check(e: React.FormEvent) {
    e.preventDefault();
    if (!password) return;
    setChecking(true);
    try {
      toast.success(await apiVerifyPnpkiPassword(password));
      setPassword("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to check the password.");
    } finally {
      setChecking(false);
    }
  }

  return (
    <form onSubmit={check} className="flex flex-wrap items-end gap-2">
      <div className="min-w-[180px] flex-1 space-y-1.5">
        <Label htmlFor="pnpki-check">Test your certificate password</Label>
        <Input id="pnpki-check" type="password" autoComplete="off" value={password} onChange={(e) => setPassword(e.target.value)} className="h-9 border-border" />
      </div>
      <Button type="submit" size="sm" variant="outline" className="h-9 border-border" disabled={checking || !password}>
        {checking ? <Loader2 className="h-4 w-4 animate-spin" /> : "Test"}
      </Button>
    </form>
  );
}

function RemoveButton({ onRemoved }: { onRemoved: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);

  async function remove() {
    if (!window.confirm("Remove your PNPKI certificate from the system? Its stored copy is erased, and you will need to register it again to sign.")) return;
    setBusy(true);
    try {
      toast.success(await apiRemovePnpkiCertificate());
      await onRemoved();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to remove the certificate.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button type="button" variant="outline" size="sm" className="gap-1.5 border-border text-destructive" onClick={remove} disabled={busy}>
      <Trash2 className="h-4 w-4" /> Remove
    </Button>
  );
}
