import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Check, ChevronsUpDown, Loader2, Plus, Trash2, ShieldCheck, Save, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/app/page-header";
import { ValidationResultPanel } from "@/components/app/validation-result-panel";
import { fmtPHP, PRItem } from "@/lib/mock-data";
import { toast } from "sonner";
import { apiCreatePurchaseRequest, apiGetUsers, type PurchaseRequestCreatePayload } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export const Route = createFileRoute("/purchase-requests/new")({
  head: () => ({
    meta: [
      { title: "Create Purchase Request — DOST Caraga" },
      { name: "description", content: "Create and submit a new Purchase Request with multi-section form and pre-validation." },
    ],
  }),
  component: NewPR,
});

function Section({ eyebrow, title, children }: { eyebrow: string; title: string; children: React.ReactNode }) {
  return (
    <Card className="border border-border bg-card p-4 sm:p-6">
      <div className="mb-4 sm:mb-5">
        <p className="label-eyebrow">{eyebrow}</p>
        <h3 className="mt-1 text-base font-bold text-navy">{title}</h3>
      </div>
      {children}
    </Card>
  );
}

function NewPR() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const today = new Date().toISOString().slice(0, 10);
  const [office, setOffice] = useState("RO");
  const [requestedBy, setRequestedBy] = useState<number | null>(null);
  const [requesterOpen, setRequesterOpen] = useState(false);
  const [fundSource, setFundSource] = useState("GAA 2026 - MOOE");
  const [modeOfProcurement, setModeOfProcurement] = useState("Shopping");
  const [projectTitle, setProjectTitle] = useState("Office Productivity Upgrade");
  const [purpose, setPurpose] = useState("Replacement of unserviceable office equipment for the Administrative Division to improve daily operations and productivity.");
  const [items, setItems] = useState<PRItem[]>([
    { id: "1", name: "Laptop, Business Class", description: "i7, 16GB RAM, 512GB SSD", uom: "unit", qty: 2, unitCost: 52000 },
    { id: "2", name: "Wireless Mouse", description: "Ergonomic, optical", uom: "pc", qty: 4, unitCost: 850 },
  ]);
  const [validated, setValidated] = useState(false);
  const [action, setAction] = useState<"draft" | "submit" | null>(null);
  const { data: users = [], isLoading: usersLoading } = useQuery({ queryKey: ["users"], queryFn: apiGetUsers });

  const total = items.reduce((s, i) => s + i.qty * i.unitCost, 0);
  const selectedRequester = useMemo(() => users.find((user) => user.id === requestedBy), [requestedBy, users]);
  const createMutation = useMutation({
    mutationFn: apiCreatePurchaseRequest,
    onSuccess: async (created) => {
      await queryClient.invalidateQueries({ queryKey: ["purchase-requests"] });
      toast.success(created.status === "For Recommendation" ? "Purchase request submitted." : "Purchase request saved as draft.");
      navigate({ to: "/purchase-requests/$prId", params: { prId: created.id } });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Unable to create purchase request."),
    onSettled: () => setAction(null),
  });

  function update(id: string, patch: Partial<PRItem>) {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));
    setValidated(false);
  }
  function add() {
    setItems((p) => [...p, { id: String(Date.now()), name: "", description: "", uom: "pc", qty: 1, unitCost: 0 }]);
    setValidated(false);
  }
  function remove(id: string) {
    setItems((p) => p.filter((i) => i.id !== id));
    setValidated(false);
  }
  function payload(submit: boolean): PurchaseRequestCreatePayload {
    return {
      office,
      requestedBy,
      fundSource,
      projectTitle,
      modeOfProcurement,
      purpose,
      submit,
      items: items.map((item) => ({
        name: item.name,
        description: item.description,
        uom: item.uom,
        qty: item.qty,
        unitCost: item.unitCost,
      })),
    };
  }
  function saveDraft() {
    setAction("draft");
    createMutation.mutate(payload(false));
  }
  function submitRequest() {
    setAction("submit");
    createMutation.mutate(payload(true));
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5 px-3 py-4 sm:space-y-6 sm:px-6 sm:py-8 lg:px-8">
      <PageHeader
        eyebrow="New Request"
        title="Create Purchase Request"
        subtitle="Complete each section, validate items, then submit for recommendation."
        actions={
          <>
            <Button variant="outline" className="gap-2 border-border" onClick={saveDraft} disabled={createMutation.isPending}>
              {action === "draft" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save Draft
            </Button>
            <Button variant="outline" className="gap-2 border-primary/50 text-primary hover:bg-secondary" onClick={() => { setValidated(true); toast.success("Pre-validation complete."); }}>
              <ShieldCheck className="h-4 w-4" /> Validate Items
            </Button>
            <Button className="gap-2" disabled={!validated || createMutation.isPending} onClick={submitRequest}>
              {action === "submit" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Submit for Recommendation
            </Button>
          </>
        }
      />

      <Section eyebrow="Step 1" title="Request Information">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div><Label className="label-eyebrow">PR No.</Label><Input defaultValue="PR-2026-0143" readOnly className="mt-1 h-10 border-border bg-secondary/40 font-semibold text-navy" /></div>
          <div><Label className="label-eyebrow">Date</Label><Input defaultValue={today} type="date" className="mt-1 h-10 border-border" /></div>
          <div><Label className="label-eyebrow">Requesting Office</Label>
            <Select value={office} onValueChange={setOffice}><SelectTrigger className="mt-1 h-10 border-border"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="RO">Regional Office</SelectItem><SelectItem value="PMD">Planning & Mgmt Division</SelectItem><SelectItem value="STSD">S&T Services Division</SelectItem><SelectItem value="FAD">Finance & Admin</SelectItem></SelectContent>
            </Select>
          </div>
          <div>
            <Label className="label-eyebrow">Requested By</Label>
            <Popover open={requesterOpen} onOpenChange={setRequesterOpen}>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  role="combobox"
                  aria-expanded={requesterOpen}
                  className="mt-1 h-10 w-full justify-between border-border px-3 font-normal"
                >
                  <span className="truncate">
                    {selectedRequester ? `${selectedRequester.name} — ${selectedRequester.email}` : usersLoading ? "Fetching data, kindly wait." : "Select requester"}
                  </span>
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 text-muted-foreground" />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-[min(calc(100vw-2rem),28rem)] p-0">
                <Command>
                  <CommandInput placeholder="Search user name or email..." />
                  <CommandList>
                    <CommandEmpty>No user found.</CommandEmpty>
                    <CommandGroup>
                      {users.map((user) => (
                        <CommandItem
                          key={user.id}
                          value={`${user.name} ${user.email} ${user.office}`}
                          onSelect={() => {
                            setRequestedBy(user.id);
                            setRequesterOpen(false);
                          }}
                        >
                          <Check className={cn("h-4 w-4", requestedBy === user.id ? "opacity-100" : "opacity-0")} />
                          <span className="flex min-w-0 flex-col">
                            <span className="truncate font-medium">{user.name}</span>
                            <span className="truncate text-xs text-muted-foreground">{user.email} · {user.office}</span>
                          </span>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>
          <div className="md:col-span-2"><Label className="label-eyebrow">Mode of Procurement</Label>
            <Select value={modeOfProcurement} onValueChange={setModeOfProcurement}><SelectTrigger className="mt-1 h-10 border-border"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="Shopping">Shopping</SelectItem><SelectItem value="Small Value Procurement">Small Value Procurement</SelectItem><SelectItem value="Public Bidding">Public Bidding</SelectItem><SelectItem value="Negotiated Procurement">Negotiated Procurement</SelectItem></SelectContent>
            </Select>
          </div>
        </div>
      </Section>

      <Section eyebrow="Step 2" title="Fund Source">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div><Label className="label-eyebrow">Fund Cluster</Label>
            <Select defaultValue="01"><SelectTrigger className="mt-1 h-10 border-border"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="01">01 - Regular Agency Fund</SelectItem><SelectItem value="06">06 - Trust Receipts</SelectItem></SelectContent>
            </Select>
          </div>
          <div><Label className="label-eyebrow">Source of Funds</Label>
            <Select value={fundSource} onValueChange={setFundSource}><SelectTrigger className="mt-1 h-10 border-border"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="GAA 2026 - MOOE">GAA 2026 - MOOE</SelectItem><SelectItem value="GAA">GAA 2026 - CO</SelectItem><SelectItem value="Trust Fund - SETUP">Trust Fund - SETUP</SelectItem></SelectContent>
            </Select>
          </div>
          <div><Label className="label-eyebrow">Account Code</Label><Input defaultValue="5021201000 — ICT Equipment" className="mt-1 h-10 border-border" /></div>
          <div><Label className="label-eyebrow">Available Balance</Label>
            <div className="mt-1 flex h-10 items-center justify-between rounded-md border border-border bg-secondary/40 px-3">
              <span className="text-sm font-semibold text-navy tabular-nums">{fmtPHP(1660000)}</span>
              <span className="label-eyebrow">Sufficient</span>
            </div>
          </div>
        </div>
      </Section>

      <Section eyebrow="Step 3" title="Project Information">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="md:col-span-2"><Label className="label-eyebrow">Project Title</Label><Input value={projectTitle} onChange={(e) => setProjectTitle(e.target.value)} className="mt-1 h-10 border-border" /></div>
          <div><Label className="label-eyebrow">PAP Code</Label><Input defaultValue="100000100001000" className="mt-1 h-10 border-border" /></div>
          <div><Label className="label-eyebrow">Location</Label><Input defaultValue="Regional Office, Butuan City" className="mt-1 h-10 border-border" /></div>
          <div className="md:col-span-2"><Label className="label-eyebrow">Beneficiary / End-User</Label><Input defaultValue="Administrative Division" className="mt-1 h-10 border-border" /></div>
        </div>
      </Section>

      <Section eyebrow="Step 4" title="Item Details">
        <div className="space-y-3 md:hidden">
          {items.map((it) => (
            <div key={it.id} className="rounded-lg border border-border bg-background p-3">
              <div className="mb-3 flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-navy">Line Item</p>
                <Button variant="ghost" size="icon" onClick={() => remove(it.id)} className="h-8 w-8 text-muted-foreground hover:text-destructive">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              <div className="grid grid-cols-1 gap-3">
                <div><Label className="label-eyebrow">Item Name</Label><Input value={it.name} onChange={(e) => update(it.id, { name: e.target.value })} className="mt-1 h-9 border-border" /></div>
                <div><Label className="label-eyebrow">Description</Label><Input value={it.description} onChange={(e) => update(it.id, { description: e.target.value })} className="mt-1 h-9 border-border" /></div>
                <div className="grid grid-cols-3 gap-2">
                  <div><Label className="label-eyebrow">UoM</Label><Input value={it.uom} onChange={(e) => update(it.id, { uom: e.target.value })} className="mt-1 h-9 border-border" /></div>
                  <div><Label className="label-eyebrow">Qty</Label><Input type="number" value={it.qty} onChange={(e) => update(it.id, { qty: Number(e.target.value) })} className="mt-1 h-9 border-border" /></div>
                  <div><Label className="label-eyebrow">Unit Cost</Label><Input type="number" value={it.unitCost} onChange={(e) => update(it.id, { unitCost: Number(e.target.value) })} className="mt-1 h-9 border-border" /></div>
                </div>
                <div className="rounded-md bg-secondary/40 px-3 py-2 text-right">
                  <p className="label-eyebrow">Total</p>
                  <p className="font-semibold tabular-nums text-navy">{fmtPHP(it.qty * it.unitCost)}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
        <div className="hidden overflow-x-auto rounded-lg border border-border md:block">
          <Table>
            <TableHeader>
              <TableRow className="bg-secondary/40 hover:bg-secondary/40">
                <TableHead className="label-eyebrow w-[20%]">Item Name</TableHead>
                <TableHead className="label-eyebrow w-[26%]">Description</TableHead>
                <TableHead className="label-eyebrow w-[8%]">UoM</TableHead>
                <TableHead className="label-eyebrow w-[8%]">Qty</TableHead>
                <TableHead className="label-eyebrow w-[14%]">Unit Cost</TableHead>
                <TableHead className="label-eyebrow w-[14%] text-right">Total</TableHead>
                <TableHead className="w-[40px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((it) => (
                <TableRow key={it.id}>
                  <TableCell><Input value={it.name} onChange={(e) => update(it.id, { name: e.target.value })} className="h-9 border-border" /></TableCell>
                  <TableCell><Input value={it.description} onChange={(e) => update(it.id, { description: e.target.value })} className="h-9 border-border" /></TableCell>
                  <TableCell><Input value={it.uom} onChange={(e) => update(it.id, { uom: e.target.value })} className="h-9 border-border" /></TableCell>
                  <TableCell><Input type="number" value={it.qty} onChange={(e) => update(it.id, { qty: Number(e.target.value) })} className="h-9 border-border" /></TableCell>
                  <TableCell><Input type="number" value={it.unitCost} onChange={(e) => update(it.id, { unitCost: Number(e.target.value) })} className="h-9 border-border" /></TableCell>
                  <TableCell className="text-right font-medium tabular-nums">{fmtPHP(it.qty * it.unitCost)}</TableCell>
                  <TableCell><Button variant="ghost" size="icon" onClick={() => remove(it.id)} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /></Button></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <div className="mt-4 flex flex-col gap-3 min-[420px]:flex-row min-[420px]:items-center min-[420px]:justify-between">
          <Button variant="outline" size="sm" onClick={add} className="gap-2 border-border"><Plus className="h-4 w-4" /> Add Item</Button>
          <div className="text-left min-[420px]:text-right">
            <p className="label-eyebrow">Grand Total</p>
            <p className="text-xl font-bold tabular-nums text-navy sm:text-2xl">{fmtPHP(total)}</p>
          </div>
        </div>
      </Section>

      <Section eyebrow="Step 5" title="Purpose">
        <Textarea
          rows={4}
          value={purpose}
          onChange={(e) => setPurpose(e.target.value)}
          className="border-border"
        />
      </Section>

      <Section eyebrow="Step 6" title="Validation Results">
        {validated ? (
          <ValidationResultPanel items={items} />
        ) : (
          <div className="rounded-lg border border-dashed border-border bg-secondary/30 p-8 text-center">
            <ShieldCheck className="mx-auto mb-2 h-8 w-8 text-primary/60" strokeWidth={1.5} />
            <p className="text-sm font-semibold text-navy">No validation run yet</p>
            <p className="mt-1 text-xs text-muted-foreground">Click "Validate Items" to check items against PPMP, Budget, APP-CSE, and APP-Non-CSE.</p>
          </div>
        )}
      </Section>
    </div>
  );
}
