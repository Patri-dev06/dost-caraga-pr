import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, Copy, Loader2, Mail, Plus, Search, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiGetSuppliersPage, type PortalLink, type RfqSupplierPayload, type Supplier } from "@/lib/api";
import { toast } from "sonner";

/**
 * Flowchart: "Filter Supplier based on category (Goods, Services)". Searches the active directory
 * suppliers in the RFQ's category; a supplier not in the directory yet can be typed in and is added
 * to it (in that category) when picked.
 */
export function SupplierPicker({
  category,
  excludeSupplierIds,
  disabled,
  actionLabel = "Add",
  onPick,
}: {
  category: "Goods" | "Services";
  excludeSupplierIds: string[];
  disabled?: boolean;
  actionLabel?: string;
  onPick: (payload: RfqSupplierPayload, label: string) => void;
}) {
  const [q, setQ] = useState("");
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ name: "", email: "", contact: "", address: "" });

  const { data, isFetching } = useQuery({
    queryKey: ["suppliers", "picker", category, q],
    queryFn: () => apiGetSuppliersPage(1, 8, { category, q: q.trim() || undefined, active: true }),
  });
  const options = (data?.items ?? []).filter((s: Supplier) => !excludeSupplierIds.includes(s.id));

  return (
    <div className="space-y-2 rounded-lg border border-dashed border-border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={`Search ${category} suppliers…`}
            className="h-9 border-border pl-8"
            aria-label={`Search ${category} suppliers`}
          />
        </div>
        <Button type="button" variant="outline" size="sm" className="gap-1.5 border-border" onClick={() => setAdding((v) => !v)} disabled={disabled}>
          <UserPlus className="h-4 w-4" /> New supplier
        </Button>
      </div>

      {adding && (
        <div className="grid grid-cols-1 gap-2 rounded-md bg-secondary/40 p-2 sm:grid-cols-2">
          <Input placeholder="Supplier name *" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className="h-8 border-border" />
          <Input placeholder="Email (for the Supplier Portal link)" type="email" value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} className="h-8 border-border" />
          <Input placeholder="Contact no." value={draft.contact} onChange={(e) => setDraft({ ...draft, contact: e.target.value })} className="h-8 border-border" />
          <Input placeholder="Address" value={draft.address} onChange={(e) => setDraft({ ...draft, address: e.target.value })} className="h-8 border-border" />
          <div className="flex justify-end sm:col-span-2">
            <Button
              type="button"
              size="sm"
              className="gap-1.5"
              disabled={disabled || !draft.name.trim()}
              onClick={() => {
                onPick(
                  { supplier_name: draft.name.trim(), supplier_email: draft.email.trim() || undefined, supplier_contact_no: draft.contact.trim() || undefined, supplier_address: draft.address.trim() || undefined },
                  draft.name.trim(),
                );
                setDraft({ name: "", email: "", contact: "", address: "" });
                setAdding(false);
              }}
            >
              <Plus className="h-4 w-4" /> Add to directory &amp; {actionLabel.toLowerCase()}
            </Button>
          </div>
        </div>
      )}

      <div className="divide-y divide-border rounded-md border border-border">
        {isFetching && options.length === 0 ? (
          <p className="flex items-center gap-2 p-3 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Searching…</p>
        ) : options.length === 0 ? (
          <p className="p-3 text-xs text-muted-foreground">No {category} suppliers match. Add a new one above.</p>
        ) : (
          options.map((s) => (
            <div key={s.id} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-navy">{s.name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {s.email || "No email — you'll copy the portal link by hand"}
                  {s.address ? ` · ${s.address}` : ""}
                </p>
              </div>
              <Button type="button" size="sm" variant="outline" className="h-7 gap-1 border-border text-xs" disabled={disabled} onClick={() => onPick({ supplier_id: s.id }, s.name)}>
                <Plus className="h-3.5 w-3.5" /> {actionLabel}
              </Button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

/** Portal links just issued, so staff can hand them to suppliers that have no email on file. */
export function PortalLinksCard({ links, onDismiss }: { links: PortalLink[]; onDismiss: () => void }) {
  const [copied, setCopied] = useState<string | null>(null);
  if (links.length === 0) return null;

  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(url);
      toast.success("Portal link copied.");
    } catch {
      toast.error("Copy failed — select the link and copy it manually.");
    }
  }

  return (
    <div className="space-y-2 rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">
      <div className="flex items-center justify-between gap-2">
        <p className="font-semibold text-navy">Supplier Portal links</p>
        <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={onDismiss}>Done</Button>
      </div>
      <p className="text-xs text-muted-foreground">Each link opens only that supplier's request. Emailed where the supplier has an address; copy the rest and send them another way. Links are shown once.</p>
      {links.map((link) => (
        <div key={link.url} className="flex flex-wrap items-center gap-2 rounded-md bg-card p-2">
          <span className="min-w-0 flex-1">
            <span className="block truncate text-xs font-medium text-navy">{link.supplierName ?? "Supplier"}</span>
            <span className="block truncate font-mono text-[11px] text-muted-foreground">{link.url}</span>
          </span>
          {link.emailed ? (
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-success"><Mail className="h-3.5 w-3.5" /> Emailed</span>
          ) : (
            <span className="text-[11px] font-semibold text-warning-foreground">No email on file</span>
          )}
          <Button type="button" size="sm" variant="outline" className="h-7 gap-1 border-border text-xs" onClick={() => copy(link.url)}>
            {copied === link.url ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />} Copy
          </Button>
        </div>
      ))}
    </div>
  );
}
