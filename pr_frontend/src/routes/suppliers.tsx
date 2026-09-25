import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Pencil, Plus, RotateCcw, Search, UserX, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader } from "@/components/app/page-header";
import { ListPagination } from "@/components/app/list-pagination";
import { apiCreateSupplier, apiDeactivateSupplier, apiGetSuppliersPage, apiUpdateSupplier, type Supplier, type SupplierPayload } from "@/lib/api";
import { toast } from "sonner";

export const Route = createFileRoute("/suppliers")({
  head: () => ({
    meta: [
      { title: "Suppliers — DOST Caraga" },
      { name: "description", content: "Supplier directory used to choose the 3 suppliers canvassed on each RFQ." },
    ],
  }),
  component: SuppliersPage,
});

type Form = { name: string; category: "Goods" | "Services"; email: string; contactNo: string; address: string; tin: string };
const EMPTY: Form = { name: "", category: "Goods", email: "", contactNo: "", address: "", tin: "" };

function toPayload(form: Form): SupplierPayload {
  return { name: form.name.trim(), category: form.category, email: form.email.trim() || undefined, contact_no: form.contactNo.trim() || undefined, address: form.address.trim() || undefined, tin: form.tin.trim() || undefined };
}

/** Flowchart: "Filter Supplier based on category (Goods, Services)" picks from this directory. */
function SuppliersPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [category, setCategory] = useState<"all" | "Goods" | "Services">("all");
  const [showInactive, setShowInactive] = useState(false);
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [form, setForm] = useState<Form>(EMPTY);

  const { data, isLoading } = useQuery({
    queryKey: ["suppliers", "directory", page, q, category, showInactive],
    queryFn: () => apiGetSuppliersPage(page, 20, { q: q.trim() || undefined, category: category === "all" ? undefined : category, active: showInactive ? undefined : true }),
  });

  const save = useMutation({
    mutationFn: () => (editing === "new" ? apiCreateSupplier(toPayload(form)) : apiUpdateSupplier(editing!, toPayload(form))),
    onSuccess: async (supplier) => {
      toast.success(editing === "new" ? `${supplier.name} added.` : `${supplier.name} updated.`);
      setEditing(null);
      setForm(EMPTY);
      await queryClient.invalidateQueries({ queryKey: ["suppliers"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Unable to save the supplier."),
  });

  const toggleActive = useMutation({
    mutationFn: (s: Supplier) => (s.active ? apiDeactivateSupplier(s.id) : apiUpdateSupplier(s.id, { active: true })),
    onSuccess: async (s) => {
      toast.success(s.active ? `${s.name} reactivated.` : `${s.name} deactivated — it stays on past RFQs but can't be chosen for new ones.`);
      await queryClient.invalidateQueries({ queryKey: ["suppliers"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Unable to update the supplier."),
  });

  function startEdit(s: Supplier) {
    setEditing(s.id);
    setForm({ name: s.name, category: s.category, email: s.email, contactNo: s.contactNo, address: s.address, tin: s.tin });
  }

  const formCard = (
    <Card className="space-y-3 border border-primary/30 bg-card p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-navy">{editing === "new" ? "New supplier" : "Edit supplier"}</h2>
        <Button variant="ghost" size="sm" className="h-7" onClick={() => { setEditing(null); setForm(EMPTY); }} aria-label="Close">
          <X className="h-4 w-4" />
        </Button>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-xs">
          <span className="label-eyebrow">Name *</span>
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="border-border" />
        </label>
        <label className="space-y-1 text-xs">
          <span className="label-eyebrow">Category *</span>
          <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v as Form["category"] })}>
            <SelectTrigger className="border-border"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="Goods">Goods (goods &amp; equipment RFQs)</SelectItem>
              <SelectItem value="Services">Services (venue RFQs)</SelectItem>
            </SelectContent>
          </Select>
        </label>
        <label className="space-y-1 text-xs">
          <span className="label-eyebrow">Email</span>
          <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="Email (optional)" className="border-border" />
        </label>
        <label className="space-y-1 text-xs">
          <span className="label-eyebrow">Contact no.</span>
          <Input value={form.contactNo} onChange={(e) => setForm({ ...form, contactNo: e.target.value })} className="border-border" />
        </label>
        <label className="space-y-1 text-xs">
          <span className="label-eyebrow">Address</span>
          <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className="border-border" />
        </label>
        <label className="space-y-1 text-xs">
          <span className="label-eyebrow">TIN</span>
          <Input value={form.tin} onChange={(e) => setForm({ ...form, tin: e.target.value })} className="border-border" />
        </label>
      </div>
      <Button className="gap-1.5" disabled={save.isPending || !form.name.trim()} onClick={() => save.mutate()}>
        {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Save supplier
      </Button>
    </Card>
  );

  const suppliers = data?.items ?? [];

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5 px-3 py-4 sm:space-y-6 sm:px-6 sm:py-8 lg:px-8">
      <PageHeader
        eyebrow="Procurement"
        title="Suppliers"
        subtitle="The directory each RFQ picks its 3 suppliers from, filtered by category. Contact details are for the Supply team reaching the supplier."
        actions={
          <Button className="gap-1.5" onClick={() => { setEditing("new"); setForm(EMPTY); }}>
            <Plus className="h-4 w-4" /> Add supplier
          </Button>
        }
      />

      {editing === "new" && formCard}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="Search name, email or address…" className="border-border pl-8" aria-label="Search suppliers" />
        </div>
        <Select value={category} onValueChange={(v) => { setCategory(v as typeof category); setPage(1); }}>
          <SelectTrigger className="w-40 border-border"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            <SelectItem value="Goods">Goods</SelectItem>
            <SelectItem value="Services">Services</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" className="border-border" onClick={() => { setShowInactive((v) => !v); setPage(1); }}>
          {showInactive ? "Hide deactivated" : "Show deactivated"}
        </Button>
      </div>

      <Card className="divide-y divide-border border border-border bg-card">
        {isLoading ? (
          <p className="p-6 text-center text-sm text-muted-foreground">Loading…</p>
        ) : suppliers.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted-foreground">No suppliers yet. Add one, or type a new supplier's name while choosing suppliers on an RFQ.</p>
        ) : (
          suppliers.map((s) =>
            editing === s.id ? (
              <div key={s.id} className="p-3">{formCard}</div>
            ) : (
              <div key={s.id} className={`flex flex-wrap items-center gap-3 px-4 py-3 text-sm ${s.active ? "" : "opacity-60"}`}>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-navy">
                    {s.name}
                    <span className="ml-2 rounded-full bg-secondary px-2 py-0.5 text-[10px] font-semibold uppercase text-navy">{s.category}</span>
                    {!s.active && <span className="ml-2 text-[10px] font-semibold uppercase text-muted-foreground">Deactivated</span>}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">{[s.email || "No email", s.contactNo, s.address].filter(Boolean).join(" · ")}</p>
                </div>
                <Button size="sm" variant="outline" className="h-8 gap-1 border-border" onClick={() => startEdit(s)}>
                  <Pencil className="h-3.5 w-3.5" /> Edit
                </Button>
                <Button size="sm" variant="outline" className="h-8 gap-1 border-border" disabled={toggleActive.isPending} onClick={() => toggleActive.mutate(s)}>
                  {s.active ? <><UserX className="h-3.5 w-3.5" /> Deactivate</> : <><RotateCcw className="h-3.5 w-3.5" /> Reactivate</>}
                </Button>
              </div>
            ),
          )
        )}
      </Card>

      {data && <ListPagination page={data.page} lastPage={data.lastPage} total={data.total} onPageChange={setPage} />}
    </div>
  );
}
