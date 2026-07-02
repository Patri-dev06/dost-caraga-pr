import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowLeft, Loader2, Plus, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader } from "@/components/app/page-header";
import { apiCreateLibEntry, apiGetFundSources, apiGetProjects, type LibEntryCreatePayload, type LibLineItemPayload } from "@/lib/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Link } from "@tanstack/react-router";

export const Route = createFileRoute("/lib/new")({
  head: () => ({
    meta: [{ title: "New LIB Entry — DOST Caraga" }],
  }),
  component: NewLibPage,
});

const EXPENSE_CATEGORIES: Record<string, Record<string, string[]>> = {
  "Maintenance and Other Operating Expenses": {
    "Traveling Expenses": [],
    "Fuel Expenses": [],
    "Supplies and Materials Expenses": ["Office Supplies", "ICT Supplies"],
    "Communication Expenses": ["Public Network Service Subscription"],
    "Subscription Expenses": [
      "Office Productivity Tool",
      "Cloud-Hosting Service Renewal",
      "Virtual Conferencing Platform",
      "Domain Service Renewal",
    ],
    "Representation Expenses": [],
    "Training Expenses": [],
    "Other Professional Services": ["Gratuity"],
  },
  "Capital Outlay": {},
};

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec_amount"] as const;
const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

type LineItemRow = LibLineItemPayload & { id: string; showCustom: boolean };

function createEmptyLineItem(): LineItemRow {
  return {
    id: crypto.randomUUID(),
    main_category: "",
    sub_category: "",
    specific_item: null,
    custom_item_name: null,
    showCustom: false,
    approved_lib_amount: 0,
    jan: 0, feb: 0, mar: 0, apr: 0, may: 0, jun: 0,
    jul: 0, aug: 0, sep: 0, oct: 0, nov: 0, dec_amount: 0,
  };
}

function NewLibPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: fundSources = [] } = useQuery({ queryKey: ["fund-sources"], queryFn: apiGetFundSources });
  const { data: projects = [] } = useQuery({ queryKey: ["projects"], queryFn: apiGetProjects });

  const [form, setForm] = useState<LibEntryCreatePayload>({
    project_id: 0,
    fund_source_id: 0,
    budget_year: new Date().getFullYear(),
    pap_code: "",
    program_title: "",
    implementing_agency: "DOST-Caraga",
    total_duration: "",
    cooperating_agency: "",
    project_leader: "",
    monitoring_agency: "",
    object_of_expenditure: "",
    account_code: "",
    allocated_amount: 0,
  });

  const [lineItems, setLineItems] = useState<LineItemRow[]>([createEmptyLineItem()]);

  const mutation = useMutation({
    mutationFn: () => {
      const payload: LibEntryCreatePayload = {
        ...form,
        allocated_amount: form.allocated_amount || computeGrandTotal(),
        line_items: lineItems
          .filter((li) => li.main_category && li.sub_category)
          .map(({ id, showCustom, ...rest }) => rest),
      };
      return apiCreateLibEntry(payload);
    },
    onSuccess: (data) => {
      toast.success("LIB entry created successfully.");
      queryClient.invalidateQueries({ queryKey: ["lib-entries"] });
      navigate({ to: "/lib/$libId", params: { libId: String(data.id) } });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  function computeGrandTotal() {
    return lineItems.reduce((sum, li) => {
      const rowTotal = MONTHS.reduce((s, m) => s + ((li[m] as number) || 0), 0);
      return sum + rowTotal;
    }, 0);
  }

  function updateLineItem(index: number, updates: Partial<LineItemRow>) {
    setLineItems((prev) => prev.map((item, i) => (i === index ? { ...item, ...updates } : item)));
  }

  function removeLineItem(index: number) {
    setLineItems((prev) => prev.filter((_, i) => i !== index));
  }

  function addLineItem() {
    setLineItems((prev) => [...prev, createEmptyLineItem()]);
  }

  const canSubmit = form.project_id > 0 && form.fund_source_id > 0 && form.object_of_expenditure && form.account_code;

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6">
      <PageHeader eyebrow="Budget & Planning" title="New LIB Entry" subtitle="DOST Form 4 — Project Line-Item Budget" />

      <Link to="/lib">
        <Button variant="ghost" size="sm"><ArrowLeft className="mr-1.5 h-4 w-4" />Back to LIB</Button>
      </Link>

      {/* Project Header Information */}
      <Card>
        <CardHeader><CardTitle>Project Information (DOST Form 4)</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Program Title</Label>
              <Input value={form.program_title ?? ""} onChange={(e) => setForm({ ...form, program_title: e.target.value })} placeholder="e.g. DOST-Caraga Grants-In-Aid Programme" />
            </div>
            <div className="space-y-2">
              <Label>Project *</Label>
              <Select value={form.project_id ? String(form.project_id) : ""} onValueChange={(v) => setForm({ ...form, project_id: Number(v) })}>
                <SelectTrigger><SelectValue placeholder="Select project" /></SelectTrigger>
                <SelectContent>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={String(p.id)}>{p.title} ({p.code})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Implementing Agency</Label>
              <Input value={form.implementing_agency ?? ""} onChange={(e) => setForm({ ...form, implementing_agency: e.target.value })} placeholder="e.g. DOST-Caraga" />
            </div>
            <div className="space-y-2">
              <Label>Total Duration</Label>
              <Input value={form.total_duration ?? ""} onChange={(e) => setForm({ ...form, total_duration: e.target.value })} placeholder="e.g. January 1 - December 31, 2026" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Cooperating Agency</Label>
              <CooperatingAgencyInput
                value={form.cooperating_agency ?? ""}
                onChange={(val) => setForm({ ...form, cooperating_agency: val })}
              />
            </div>
            <div className="space-y-2">
              <Label>Project Leader</Label>
              <Input value={form.project_leader ?? ""} onChange={(e) => setForm({ ...form, project_leader: e.target.value })} placeholder="Full name of Project Leader" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Monitoring Agency</Label>
              <Input value={form.monitoring_agency ?? ""} onChange={(e) => setForm({ ...form, monitoring_agency: e.target.value })} placeholder="e.g. DOST-Caraga / Innovation Unit" />
            </div>
            <div className="space-y-2">
              <Label>Source of Funds *</Label>
              <Select value={form.fund_source_id ? String(form.fund_source_id) : ""} onValueChange={(v) => setForm({ ...form, fund_source_id: Number(v) })}>
                <SelectTrigger><SelectValue placeholder="Select fund source" /></SelectTrigger>
                <SelectContent>
                  {fundSources.map((fs) => (
                    <SelectItem key={fs.id} value={String(fs.id)}>{fs.name} ({fs.fund_type})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Budget Year *</Label>
              <Input type="number" value={form.budget_year} onChange={(e) => setForm({ ...form, budget_year: Number(e.target.value) })} />
            </div>
            <div className="space-y-2">
              <Label>Account Code *</Label>
              <Input value={form.account_code} onChange={(e) => setForm({ ...form, account_code: e.target.value })} placeholder="e.g. 5020301000" />
            </div>
            <div className="space-y-2">
              <Label>PAP Code</Label>
              <Input value={form.pap_code ?? ""} onChange={(e) => setForm({ ...form, pap_code: e.target.value })} placeholder="Optional" />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Object of Expenditure *</Label>
            <Input value={form.object_of_expenditure} onChange={(e) => setForm({ ...form, object_of_expenditure: e.target.value })} placeholder="e.g. Office Supplies Expenses" />
          </div>

          <div className="space-y-2">
            <Label>Total Allocated Amount (PHP) *</Label>
            <Input type="number" step="0.01" min="0" value={form.allocated_amount || ""} onChange={(e) => setForm({ ...form, allocated_amount: Number(e.target.value) })} placeholder="0.00 (will auto-compute from line items if left empty)" />
          </div>
        </CardContent>
      </Card>

      {/* Line Items with MCP Grid */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Line Items &amp; Monthly Cash Program (MCP)</CardTitle>
          <Button size="sm" variant="outline" onClick={addLineItem}><Plus className="mr-1.5 h-4 w-4" />Add Line Item</Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {lineItems.map((item, index) => (
            <LineItemEditor
              key={item.id}
              item={item}
              index={index}
              onUpdate={(updates) => updateLineItem(index, updates)}
              onRemove={() => removeLineItem(index)}
              canRemove={lineItems.length > 1}
            />
          ))}

          <div className="flex items-center justify-between border-t pt-4">
            <p className="text-sm font-medium text-muted-foreground">MCP Grand Total</p>
            <p className="text-lg font-bold tabular-nums">
              {new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(computeGrandTotal())}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Submit */}
      <div className="flex justify-end gap-3">
        <Button variant="outline" onClick={() => navigate({ to: "/lib" })}>Cancel</Button>
        <Button onClick={() => mutation.mutate()} disabled={!canSubmit || mutation.isPending}>
          {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Create LIB Entry
        </Button>
      </div>
    </div>
  );
}

function CooperatingAgencyInput({ value, onChange }: { value: string; onChange: (val: string) => void }) {
  const [rows, setRows] = useState<string[]>(() => {
    const parsed = value ? value.split("\n").filter(Boolean) : [];
    return parsed.length > 0 ? parsed : [""];
  });

  function updateRow(index: number, newVal: string) {
    const updated = [...rows];
    updated[index] = newVal;
    setRows(updated);
    onChange(updated.filter(Boolean).join("\n"));
  }

  function addRow() {
    setRows([...rows, ""]);
  }

  function removeRow(index: number) {
    const updated = rows.filter((_, i) => i !== index);
    const result = updated.length > 0 ? updated : [""];
    setRows(result);
    onChange(result.filter(Boolean).join("\n"));
  }

  return (
    <div className="space-y-2">
      {rows.map((agency, idx) => (
        <div key={idx} className="flex items-center gap-2">
          <Input
            value={agency}
            onChange={(e) => updateRow(idx, e.target.value)}
            placeholder={`e.g. ${idx === 0 ? "Caraga State University" : "Enter cooperating agency"}`}
          />
          {rows.length > 1 && (
            <Button type="button" size="icon" variant="ghost" className="h-8 w-8 text-red-500 hover:text-red-700 shrink-0" onClick={() => removeRow(idx)}>
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      ))}
      <Button type="button" size="sm" variant="outline" onClick={addRow} className="h-7 text-xs">
        <Plus className="mr-1 h-3 w-3" />Add Cooperating Agency
      </Button>
    </div>
  );
}

function LineItemEditor({ item, index, onUpdate, onRemove, canRemove }: {
  item: LineItemRow;
  index: number;
  onUpdate: (updates: Partial<LineItemRow>) => void;
  onRemove: () => void;
  canRemove: boolean;
}) {
  const mainCategories = Object.keys(EXPENSE_CATEGORIES);
  const subCategories = item.main_category
    ? Object.keys(EXPENSE_CATEGORIES[item.main_category] ?? {})
    : [];
  const specificItems: string[] = item.main_category && item.sub_category
    ? (EXPENSE_CATEGORIES[item.main_category]?.[item.sub_category] ?? [])
    : [];

  const rowTotal = MONTHS.reduce((s, m) => s + ((item[m] as number) || 0), 0);

  return (
    <div className="rounded-lg border p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-muted-foreground">Item #{index + 1}</span>
        {canRemove && (
          <Button size="sm" variant="ghost" className="text-red-500 hover:text-red-700" onClick={onRemove}>
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Category Dropdowns */}
      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Main Category *</Label>
          <Select value={item.main_category} onValueChange={(v) => onUpdate({ main_category: v, sub_category: "", specific_item: null, custom_item_name: null, showCustom: false })}>
            <SelectTrigger className="h-9"><SelectValue placeholder="Select category" /></SelectTrigger>
            <SelectContent>
              {mainCategories.map((cat) => (
                <SelectItem key={cat} value={cat}>
                  {cat === "Maintenance and Other Operating Expenses" ? "I. MOOE" : "II. Capital Outlay"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <Label className="text-xs">Sub Category *</Label>
          {item.main_category === "Capital Outlay" ? (
            <Input
              className="h-9"
              value={item.sub_category}
              onChange={(e) => onUpdate({ sub_category: e.target.value })}
              placeholder="e.g. Physical Server"
            />
          ) : (
            <Select value={item.sub_category} onValueChange={(v) => onUpdate({ sub_category: v, specific_item: null, custom_item_name: null, showCustom: false })}>
              <SelectTrigger className="h-9"><SelectValue placeholder="Select sub-category" /></SelectTrigger>
              <SelectContent>
                {subCategories.map((sub) => (
                  <SelectItem key={sub} value={sub}>{sub}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        <div className="space-y-1">
          <Label className="text-xs">Specific Item</Label>
          {specificItems.length > 0 ? (
            <Select
              value={item.showCustom ? "__others__" : (item.specific_item ?? "")}
              onValueChange={(v) => {
                if (v === "__others__") {
                  onUpdate({ specific_item: null, showCustom: true, custom_item_name: "" });
                } else {
                  onUpdate({ specific_item: v, showCustom: false, custom_item_name: null });
                }
              }}
            >
              <SelectTrigger className="h-9"><SelectValue placeholder="Optional" /></SelectTrigger>
              <SelectContent>
                {specificItems.map((sp) => (
                  <SelectItem key={sp} value={sp}>{sp}</SelectItem>
                ))}
                <SelectItem value="__others__">Others (specify)</SelectItem>
              </SelectContent>
            </Select>
          ) : (
            <Input
              className="h-9"
              value={item.custom_item_name ?? ""}
              onChange={(e) => onUpdate({ custom_item_name: e.target.value || null })}
              placeholder="Specify item (optional)"
            />
          )}
        </div>
      </div>

      {item.showCustom && (
        <div className="space-y-1">
          <Label className="text-xs">Specify Item Name</Label>
          <Input
            className="h-9"
            value={item.custom_item_name ?? ""}
            onChange={(e) => onUpdate({ custom_item_name: e.target.value || null })}
            placeholder="Enter custom item name"
          />
        </div>
      )}

      {/* Approved LIB and MCP Monthly Amounts */}
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <div className="space-y-1 w-40">
            <Label className="text-xs">Approved LIB</Label>
            <Input
              className="h-8 text-xs tabular-nums"
              type="number"
              step="0.01"
              min="0"
              value={item.approved_lib_amount || ""}
              onChange={(e) => onUpdate({ approved_lib_amount: Number(e.target.value) })}
              placeholder="0.00"
            />
          </div>
          <div className="flex-1">
            <Label className="text-xs mb-1 block">Monthly Cash Program (MCP)</Label>
            <div className="grid grid-cols-12 gap-1">
              {MONTHS.map((month, mi) => (
                <div key={month} className="space-y-0.5">
                  <span className="text-[10px] text-muted-foreground block text-center">{MONTH_LABELS[mi]}</span>
                  <Input
                    className="h-7 text-[11px] tabular-nums px-1 text-center"
                    type="number"
                    step="0.01"
                    min="0"
                    value={(item[month] as number) || ""}
                    onChange={(e) => onUpdate({ [month]: Number(e.target.value) })}
                    placeholder="0"
                  />
                </div>
              ))}
            </div>
          </div>
          <div className="w-28 text-right">
            <Label className="text-xs">Total</Label>
            <p className="text-sm font-bold tabular-nums mt-1">
              {new Intl.NumberFormat("en-PH", { minimumFractionDigits: 2 }).format(rowTotal)}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
