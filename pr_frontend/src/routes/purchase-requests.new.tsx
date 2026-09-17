import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Eye, FileSpreadsheet, Loader2, Pencil, Plus, Printer, Save, Send, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { exportPurchaseRequestExcel } from "@/lib/pr-excel";
import {
  ApiError,
  apiCreatePurchaseRequest,
  apiGetPurchaseRequest,
  apiGetPurchaseRequests,
  apiGetSignatories,
  apiSubmitPurchaseRequest,
  apiUpdatePurchaseRequest,
  type PurchaseRequestCreatePayload,
  type Signatory as SignatoryOption,
} from "@/lib/api";
import { ValidationResultPanel } from "@/components/app/validation-result-panel";
import type { PRItem, ValidationCheck } from "@/lib/mock-data";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCurrentUser } from "@/lib/current-user";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { listAllPpmps, syncPpmpsFromDatabase, type PpmpForLib } from "@/lib/ppmp-store";
import { getLib } from "@/lib/lib-store";

export const Route = createFileRoute("/purchase-requests/new")({
  validateSearch: (search: Record<string, unknown>): { edit?: string; view?: string } => ({
    edit: typeof search.edit === "string" ? search.edit : undefined,
    view: typeof search.view === "string" ? search.view : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Create Purchase Request — DOST Caraga" },
      { name: "description", content: "Fill out the official DOST Purchase Request form and preview it before submitting." },
    ],
  }),
  component: NewPR,
});

const SERIF = '"Times New Roman", Times, serif';

const OFFICES = [
  { code: "RO", name: "Regional Office" },
  { code: "PMD", name: "Planning & Management Division" },
  { code: "STSD", name: "S&T Services Division" },
  { code: "FAD", name: "Finance & Admin" },
  { code: "ORD", name: "Office of the Director" },
  { code: "ICTU", name: "ICTU" },
];
const FUND_SOURCES = ["GAA 2026 - MOOE", "Trust Fund - SETUP"];

// "Charged to" identifies the approved PPMP this PR draws its budget from —
// labelled by PPMP number plus the LIB project it was built for.
function ppmpChargeLabel(p: PpmpForLib): string {
  const title = getLib(p.libId)?.projectTitle.trim();
  const detail = title || p.endUserUnit;
  return `PPMP ${p.ppmpNo}${detail ? ` — ${detail}` : ""}`;
}

// PPMP Column 3 is rich text — reduce it to plain text before parsing.
function stripHtml(value: string): string {
  return value
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&");
}

// Every "Quantity: N unit" declared in a PPMP item's Column 3 — e.g.
// "Quantity: 5 pax, Quantity: 38 ream" → pax×5 and ream×38. These are the only
// units (and the quantity ceilings) a PR may draw against for that item.
function parseQuantityUnits(quantitySize: string): { qty: number; unit: string }[] {
  const out: { qty: number; unit: string }[] = [];
  const re = /(?:quantity|qty)\s*:\s*([\d,]+(?:\.\d+)?)\s*([A-Za-z]+)?/gi;
  for (const m of stripHtml(quantitySize).matchAll(re)) {
    const qty = Number(m[1].replace(/,/g, ""));
    if (Number.isFinite(qty) && qty > 0) out.push({ qty, unit: (m[2] ?? "").trim().toLowerCase() });
  }
  return out;
}

// One orderable item from the charged PPMP: its declared units/quantities and
// its total budget — the ceilings every PR against it must respect.
type ChargeItem = {
  name: string;
  units: { qty: number; unit: string }[];
  budget: number;
  unitCost: number;
};

function buildChargeItems(ppmp: PpmpForLib | undefined): ChargeItem[] {
  if (!ppmp) return [];
  const byName = new Map<string, ChargeItem>();
  for (const row of ppmp.rows) {
    const name = (row.item_name || row.general_description || "").trim();
    if (!name) continue;
    const budget = Number(row.estimated_budget) || 0;
    const qty = Number(row.quantity) || 0;
    const units = parseQuantityUnits(row.quantity_size || "").filter((u) => u.unit);
    const existing = byName.get(name);
    if (existing) {
      existing.budget += budget;
      existing.units.push(...units);
    } else {
      byName.set(name, { name, units, budget, unitCost: qty > 0 ? budget / qty : budget });
    }
  }
  return [...byName.values()];
}
const MODES = ["Shopping", "Small Value Procurement", "Public Bidding", "Negotiated Procurement"];

type FormItem = { id: string; stockNo: string; unit: string; description: string; qty: string; unitCost: string };

const parseNum = (v: string) => {
  const n = Number(String(v).replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : 0;
};
const money = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function newItem(): FormItem {
  return { id: String(Date.now() + Math.random()), stockNo: "", unit: "", description: "", qty: "", unitCost: "" };
}

/* ---- Inline field primitives: render an input while editing, plain text in preview ---- */

type Align = "left" | "center" | "right";
const alignClass: Record<Align, string> = { left: "text-left", center: "text-center", right: "text-right" };

function TextField({
  value,
  onChange,
  editing,
  align = "left",
  bold = false,
  italic = false,
  placeholder,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  editing: boolean;
  align?: Align;
  bold?: boolean;
  italic?: boolean;
  placeholder?: string;
  className?: string;
}) {
  const shared = cn(
    "w-full bg-transparent px-1 py-0.5 leading-snug",
    alignClass[align],
    bold && "font-bold",
    italic && "italic",
    className,
  );
  if (!editing) {
    return <div className={cn(shared, "min-h-[1.4em] whitespace-pre-wrap break-words")}>{value || " "}</div>;
  }
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={cn(
        shared,
        "rounded-sm outline-none placeholder:italic placeholder:text-black/30 hover:bg-amber-50 focus:bg-amber-100 print:hover:bg-transparent",
      )}
    />
  );
}

// Signatory name cell: a dropdown of approved accounts while editing, plain text
// otherwise. Keeps the current value selectable even if that account is gone.
function SignatorySelect({
  value,
  options,
  editing,
  onPick,
}: {
  value: string;
  options: SignatoryOption[];
  editing: boolean;
  onPick: (name: string) => void;
}) {
  if (!editing) return <TextField value={value} onChange={() => {}} editing={false} align="center" bold />;
  const items =
    value && !options.some((o) => o.name === value)
      ? [{ id: -1, name: value, tier: "regular" as const, position: null }, ...options]
      : options;
  return (
    <div className="px-1 py-0.5" style={{ fontFamily: "var(--font-sans)" }}>
      <Select value={value || undefined} onValueChange={onPick}>
        <SelectTrigger className="h-7 border-black/20 text-center font-bold">
          <SelectValue placeholder="Select…" />
        </SelectTrigger>
        <SelectContent>
          {items.length === 0 ? (
            <div className="px-2 py-1.5 text-sm text-muted-foreground">No approved accounts yet</div>
          ) : (
            items.map((o) => (
              <SelectItem key={o.name} value={o.name}>
                {o.name}
              </SelectItem>
            ))
          )}
        </SelectContent>
      </Select>
    </div>
  );
}

function NumField({
  value,
  onChange,
  editing,
  align = "right",
  format = false,
  placeholder,
  integer = false,
}: {
  value: string;
  onChange: (v: string) => void;
  editing: boolean;
  align?: Align;
  format?: boolean;
  placeholder?: string;
  integer?: boolean;
}) {
  const shared = cn("w-full bg-transparent px-1 py-0.5 leading-snug tabular-nums", alignClass[align]);
  if (!editing) {
    return (
      <div className={cn(shared, "min-h-[1.4em]")}>{value === "" ? " " : format ? money(parseNum(value)) : value}</div>
    );
  }
  return (
    <input
      inputMode={integer ? "numeric" : "decimal"}
      value={value}
      // Quantity is whole units only — strip anything that isn't a digit.
      onChange={(e) => onChange(integer ? e.target.value.replace(/\D/g, "") : e.target.value)}
      placeholder={placeholder}
      className={cn(
        shared,
        "rounded-sm outline-none placeholder:text-black/30 hover:bg-amber-50 focus:bg-amber-100 print:hover:bg-transparent",
      )}
    />
  );
}

function AutoTextarea({
  value,
  onChange,
  editing,
  bold = false,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  editing: boolean;
  bold?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value, editing]);

  const shared = cn("w-full bg-transparent px-1 py-0.5 leading-snug", bold && "font-bold", className);
  if (!editing) {
    return <div className={cn(shared, "min-h-[1.4em] whitespace-pre-wrap break-words")}>{value || " "}</div>;
  }
  return (
    <textarea
      ref={ref}
      rows={1}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        shared,
        "resize-none overflow-hidden rounded-sm outline-none hover:bg-amber-50 focus:bg-amber-100 print:hover:bg-transparent",
      )}
    />
  );
}

function BlendSelect({
  value,
  onChange,
  editing,
  options,
  align = "left",
  render,
}: {
  value: string;
  onChange: (v: string) => void;
  editing: boolean;
  options: { value: string; label: string }[];
  align?: Align;
  render?: (v: string) => string;
}) {
  if (!editing) {
    return <div className={cn("min-h-[1.4em] px-1 py-0.5 leading-snug", alignClass[align])}>{render ? render(value) : value || " "}</div>;
  }
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        "w-full cursor-pointer bg-transparent px-1 py-0.5 leading-snug outline-none hover:bg-amber-50 focus:bg-amber-100",
        alignClass[align],
      )}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

/* ---------------------------------- Page ---------------------------------- */

function NewPR() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { edit: editId, view: viewId } = Route.useSearch();
  const isEditing = Boolean(editId);
  const isViewOnly = Boolean(viewId);
  const loadId = editId || viewId;
  const today = new Date().toISOString().slice(0, 10);

  const { data: existing } = useQuery({
    queryKey: ["purchase-request", loadId],
    queryFn: () => apiGetPurchaseRequest(loadId!),
    enabled: Boolean(loadId),
  });

  const [mode, setMode] = useState<"edit" | "preview">(isViewOnly ? "preview" : "edit");
  const editing = mode === "edit" && !isViewOnly;

  const [entityName, setEntityName] = useState("DEPARTMENT OF SCIENCE AND TECHNOLOGY - CARAGA");
  const [fundCluster, setFundCluster] = useState("01");
  const [office, setOffice] = useState("RO");
  const [prNo, setPrNo] = useState("");
  const [date, setDate] = useState(today);
  const [rcc, setRcc] = useState("");
  const [fundSource, setFundSource] = useState(FUND_SOURCES[0]);
  const [modeOfProcurement, setModeOfProcurement] = useState(MODES[0]);

  // "Charged to" lists the user's APPROVED PPMPs. Local cache renders instantly;
  // the database sync then refreshes the list in the background.
  const [approvedPpmps, setApprovedPpmps] = useState<PpmpForLib[]>([]);
  useEffect(() => {
    const approvedOnly = (list: PpmpForLib[]) => list.filter((p) => p.status === "Approved");
    setApprovedPpmps(approvedOnly(listAllPpmps()));
    syncPpmpsFromDatabase()
      .then((list) => setApprovedPpmps(approvedOnly(list)))
      .catch(() => {});
  }, []);

  // A brand-new PR charges to the first approved PPMP once the list arrives
  // (never overrides a loaded PR or a choice the user already made).
  useEffect(() => {
    if (loadId || approvedPpmps.length === 0) return;
    setFundSource((cur) => (cur === FUND_SOURCES[0] ? ppmpChargeLabel(approvedPpmps[0]) : cur));
  }, [approvedPpmps, loadId]);

  const chargeToOptions = (() => {
    const seen = new Set<string>();
    const opts = approvedPpmps
      .map((p) => ppmpChargeLabel(p))
      .filter((label) => !seen.has(label) && (seen.add(label), true))
      .map((label) => ({ value: label, label }));
    // Keep a legacy/unknown current value visible (PRs saved before PPMP linking).
    if (fundSource && !seen.has(fundSource)) opts.unshift({ value: fundSource, label: fundSource });
    return opts;
  })();

  // The PPMP being charged, and its orderable items (with budget/qty ceilings).
  const selectedPpmp = approvedPpmps.find((p) => ppmpChargeLabel(p) === fundSource);
  const chargeItems = useMemo(() => buildChargeItems(selectedPpmp), [selectedPpmp]);

  // Every other PR already drawn against this PPMP — used to compute what's left
  // of each item's budget and quantity before this PR takes its share.
  const { data: allPrs } = useQuery({ queryKey: ["purchase-requests"], queryFn: apiGetPurchaseRequests, enabled: Boolean(selectedPpmp) });
  const priorUse = useMemo(() => {
    const byName = new Map<string, { amount: number; qtyByUnit: Map<string, number> }>();
    if (!selectedPpmp) return byName;
    for (const pr of allPrs ?? []) {
      if (loadId && pr.id === String(loadId)) continue; // this PR's own saved rows don't count against it
      if (pr.status === "Rejected" || pr.status === "Returned") continue;
      if (pr.fundSource !== fundSource) continue;
      for (const item of pr.items) {
        const rec = byName.get(item.name) ?? { amount: 0, qtyByUnit: new Map<string, number>() };
        rec.amount += item.qty * item.unitCost;
        const unitKey = item.uom.trim().toLowerCase();
        rec.qtyByUnit.set(unitKey, (rec.qtyByUnit.get(unitKey) ?? 0) + item.qty);
        byName.set(item.name, rec);
      }
    }
    return byName;
  }, [allPrs, fundSource, loadId, selectedPpmp]);

  // Remaining ceilings for one catalog item, after prior PRs and after the OTHER
  // rows of this form (so two rows drawing the same item share one ceiling).
  const remainingFor = (chargeItem: ChargeItem, excludeRowId: string) => {
    const prior = priorUse.get(chargeItem.name);
    let amount = chargeItem.budget - (prior?.amount ?? 0);
    const qtyByUnit = new Map(chargeItem.units.map((u) => [u.unit, u.qty - (prior?.qtyByUnit.get(u.unit) ?? 0)]));
    for (const row of items) {
      if (row.id === excludeRowId) continue;
      if (row.description.split("\n")[0]?.trim() !== chargeItem.name) continue;
      amount -= parseNum(row.qty) * parseNum(row.unitCost);
      const unitKey = row.unit.trim().toLowerCase();
      if (qtyByUnit.has(unitKey)) qtyByUnit.set(unitKey, (qtyByUnit.get(unitKey) ?? 0) - parseNum(row.qty));
    }
    return { amount, qtyByUnit };
  };

  const chargeItemForRow = (row: FormItem): ChargeItem | undefined =>
    chargeItems.find((c) => c.name === row.description.split("\n")[0]?.trim());

  // Picking an item from the charged PPMP fills the description, locks the unit
  // to the item's declared unit, and seeds the unit cost from the PPMP figures.
  const pickChargeItem = (rowId: string, name: string) => {
    const chosen = chargeItems.find((c) => c.name === name);
    if (!chosen) {
      updateItem(rowId, { description: name });
      return;
    }
    updateItem(rowId, {
      description: chosen.name,
      unit: chosen.units[0]?.unit ?? "",
      unitCost: chosen.unitCost > 0 ? String(Math.round(chosen.unitCost * 100) / 100) : "",
    });
  };
  const [purpose, setPurpose] = useState("");

  const [items, setItems] = useState<FormItem[]>(() => [newItem(), newItem(), newItem()]);

  // Fields flagged by a failed save/submit validation: "purpose", "chargedTo",
  // or "item-<rowId>". Flagged fields get a red highlight and the page scrolls
  // to the first one; the flag clears as soon as the field is edited.
  const [missingFields, setMissingFields] = useState<Set<string>>(new Set());
  const fieldRefs = useRef<Record<string, HTMLElement | null>>({});
  const flagMissing = (keys: string[]) => {
    setMissingFields(new Set(keys));
    const first = keys[0];
    if (first) requestAnimationFrame(() => fieldRefs.current[first]?.scrollIntoView({ behavior: "smooth", block: "center" }));
  };
  const clearMissing = (key: string) =>
    setMissingFields((s) => {
      if (!s.has(key)) return s;
      const next = new Set(s);
      next.delete(key);
      return next;
    });

  // Requested by is the signed-in user (auto-filled below). Recommending/Approved
  // are chosen from the approved-accounts dropdowns.
  const [reqName, setReqName] = useState("");
  const [reqDesig, setReqDesig] = useState("");
  const [recName, setRecName] = useState("");
  const [recDesig, setRecDesig] = useState("");
  const [appName, setAppName] = useState("");
  const [appDesig, setAppDesig] = useState("");

  const [action, setAction] = useState<"draft" | "submit" | null>(null);

  // Approved accounts for the Recommending / Approved signatory dropdowns.
  const [signatories, setSignatories] = useState<SignatoryOption[]>([]);
  useEffect(() => {
    apiGetSignatories()
      .then(setSignatories)
      .catch(() => setSignatories([]));
  }, []);

  // "Requested by" is always the signed-in user — auto-fill their name and
  // position on a brand-new PR (never override an existing/edited one).
  const { user: currentUser } = useCurrentUser();
  useEffect(() => {
    if (existing || !currentUser) return;
    setReqName((prev) => prev || currentUser.name);
    setReqDesig((prev) => prev || currentUser.position);
  }, [currentUser, existing]);

  // Picking a signatory fills the name and auto-fills the designation from sign-up.
  const pickSignatory = (name: string, setName: (v: string) => void, setDesig: (v: string) => void) => {
    setName(name);
    const chosen = signatories.find((o) => o.name === name);
    if (chosen?.position) setDesig(chosen.position);
  };

  // Prefill the form once when editing an existing draft/returned PR.
  const prefilled = useRef(false);
  useEffect(() => {
    if (!existing || prefilled.current) return;
    prefilled.current = true;
    setOffice(OFFICES.find((o) => o.name === existing.office)?.code ?? office);
    setFundSource(existing.fundSource);
    setModeOfProcurement(existing.modeOfProcurement);
    setPurpose(existing.purpose);
    setPrNo(existing.prNo);
    setItems(
      existing.items.length
        ? existing.items.map((it) => ({
            id: it.id,
            stockNo: "",
            unit: it.uom,
            description: it.description ? `${it.name}\n${it.description}` : it.name,
            qty: String(it.qty),
            unitCost: String(it.unitCost),
          }))
        : [newItem()],
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existing]);

  const grandTotal = items.reduce((s, it) => s + parseNum(it.qty) * parseNum(it.unitCost), 0);

  const [validationFailure, setValidationFailure] = useState<{ items: PRItem[]; results: (ValidationCheck & { itemId?: string })[] } | null>(null);

  const mutation = useMutation({
    mutationFn: async ({ payload, submit }: { payload: PurchaseRequestCreatePayload; submit: boolean }) => {
      if (editId) {
        const updated = await apiUpdatePurchaseRequest(editId, payload);
        return submit ? apiSubmitPurchaseRequest(editId) : updated;
      }
      return apiCreatePurchaseRequest({ ...payload, submit });
    },
    onMutate: () => setValidationFailure(null),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ["purchase-requests"] });
      if (editId) await queryClient.invalidateQueries({ queryKey: ["purchase-request", editId] });
      toast.success(
        result.status === "For Recommendation"
          ? "Purchase Request submitted."
          : isEditing
            ? "Purchase Request updated."
            : "Purchase Request saved as draft.",
      );
      navigate({ to: "/purchase-requests/$prId", params: { prId: result.id } });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Unable to save Purchase Request.");
      if (error instanceof ApiError && error.validation && error.data) {
        setValidationFailure({ items: error.data.items, results: error.validation });
      }
    },
    onSettled: () => setAction(null),
  });

  function updateItem(id: string, patch: Partial<FormItem>) {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
    clearMissing(`item-${id}`);
  }
  function addItem() {
    setItems((prev) => [...prev, newItem()]);
  }
  // Insert a fresh item row directly below the given one.
  function addItemAfter(id: string) {
    setItems((prev) => {
      const i = prev.findIndex((it) => it.id === id);
      if (i < 0) return [...prev, newItem()];
      const next = [...prev];
      next.splice(i + 1, 0, newItem());
      return next;
    });
  }
  function removeItem(id: string) {
    setItems((prev) => (prev.length > 1 ? prev.filter((it) => it.id !== id) : prev));
  }

  function buildPayload(): PurchaseRequestCreatePayload | null {
    const mapped = items
      .map((it) => {
        const lines = it.description.split("\n").map((s) => s.trim()).filter(Boolean);
        const name = lines[0] ?? "";
        const description = lines.slice(1).join("\n");
        return { name, description, uom: it.unit.trim() || "unit", qty: parseNum(it.qty), unitCost: parseNum(it.unitCost) };
      })
      .filter((it) => it.name && it.qty > 0);

    setMissingFields(new Set());

    if (mapped.length === 0) {
      toast.error("Add at least one item with a description and quantity.");
      // Flag every row that is started but incomplete (or all rows when none are usable).
      flagMissing(items.map((it) => `item-${it.id}`));
      return null;
    }
    if (!purpose.trim()) {
      toast.error("Purpose is required.");
      flagMissing(["purpose"]);
      return null;
    }
    // The backend requires the charged PPMP (its fund source id) — catch it here
    // so the field is highlighted instead of a server error after submit.
    if (approvedPpmps.length > 0 && !selectedPpmp) {
      toast.error("Charged to must be one of your approved PPMPs — pick one from the list.");
      flagMissing(["chargedTo"]);
      return null;
    }

    // Charged to a PPMP: every line must be one of its items, within what's left
    // of that item's budget and declared unit quantities after earlier PRs.
    if (chargeItems.length > 0) {
      for (const it of items) {
        const first = it.description.split("\n")[0]?.trim() ?? "";
        if (!first || parseNum(it.qty) <= 0) continue; // blank rows aren't saved
        const chargeItem = chargeItems.find((c) => c.name === first);
        if (!chargeItem) {
          toast.error(`"${first}" is not an item of the charged PPMP — pick one from the list.`);
          flagMissing([`item-${it.id}`]);
          return null;
        }
        const remaining = remainingFor(chargeItem, it.id);
        const rowTotal = parseNum(it.qty) * parseNum(it.unitCost);
        if (rowTotal > remaining.amount + 0.005) {
          toast.error(`${chargeItem.name}: only ₱${money(Math.max(0, remaining.amount))} of its PPMP budget remains.`);
          flagMissing([`item-${it.id}`]);
          return null;
        }
        if (chargeItem.units.length > 0) {
          const unitKey = it.unit.trim().toLowerCase();
          if (!chargeItem.units.some((u) => u.unit === unitKey)) {
            toast.error(`${chargeItem.name}: unit must be ${chargeItem.units.map((u) => u.unit).join(" or ")} (as declared in the PPMP).`);
            flagMissing([`item-${it.id}`]);
            return null;
          }
          const qtyLeft = remaining.qtyByUnit.get(unitKey);
          if (qtyLeft != null && parseNum(it.qty) > qtyLeft) {
            toast.error(`${chargeItem.name}: only ${Math.max(0, qtyLeft)} ${unitKey} remain in the PPMP.`);
            flagMissing([`item-${it.id}`]);
            return null;
          }
        }
      }
    }

    return { office, fundSource, modeOfProcurement, purpose: purpose.trim(), items: mapped };
  }

  function saveDraft() {
    const payload = buildPayload();
    if (!payload) return;
    setAction("draft");
    mutation.mutate({ payload, submit: false });
  }
  function submitRequest() {
    const payload = buildPayload();
    if (!payload) return;
    setAction("submit");
    mutation.mutate({ payload, submit: true });
  }

  function exportExcel() {
    const rows = items
      .map((it) => ({
        stockNo: it.stockNo,
        unit: it.unit,
        description: it.description,
        qty: parseNum(it.qty),
        unitCost: parseNum(it.unitCost),
      }))
      .filter((it) => it.description.trim());
    if (rows.length === 0) {
      toast.error("Add at least one item before exporting.");
      return;
    }
    exportPurchaseRequestExcel(
      {
        entityName,
        fundCluster,
        officeName,
        prNo,
        date,
        rcc,
        fundSource,
        purpose,
        items: rows,
        requestedByName: reqName,
        requestedByDesignation: reqDesig,
        recommendingName: recName,
        recommendingDesignation: recDesig,
        approvedByName: appName,
        approvedByDesignation: appDesig,
      },
      prNo || "Purchase-Request",
    ).catch(() => toast.error("Unable to export to Excel."));
  }

  const officeName = OFFICES.find((o) => o.code === office)?.name ?? office;

  const cell = "border border-black align-top";

  return (
    <div className="min-h-full bg-background print:bg-white">
      {/* Toolbar */}
      <div className="no-print sticky top-0 z-10 border-b border-border bg-card/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-2 px-3 py-3 sm:px-6">
          <Button variant="ghost" size="sm" asChild className="gap-1.5 text-muted-foreground">
            <Link to="/purchase-requests">
              <ArrowLeft className="h-4 w-4" /> Back
            </Link>
          </Button>

          {isViewOnly && (
            <span className="hidden rounded-md bg-success/10 px-2 py-1 text-xs font-semibold text-success sm:inline">
              Approved PR · View Only
            </span>
          )}

          {isEditing && !isViewOnly && (
            <span className="hidden rounded-md bg-secondary px-2 py-1 text-xs font-semibold text-secondary-foreground sm:inline">
              Editing {prNo || "draft"}
            </span>
          )}

          {!isViewOnly && (
            <div className="ml-1 flex rounded-lg border border-border bg-background p-0.5">
              <button
                type="button"
                onClick={() => setMode("edit")}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                  editing ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Pencil className="h-3.5 w-3.5" /> Edit
              </button>
              <button
                type="button"
                onClick={() => setMode("preview")}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                  !editing ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Eye className="h-3.5 w-3.5" /> Preview
              </button>
            </div>
          )}

          {!isViewOnly && (
            <div className="hidden items-center gap-2 sm:flex">
              <span className="label-eyebrow">Mode of Procurement</span>
              <select
                value={modeOfProcurement}
                onChange={(e) => setModeOfProcurement(e.target.value)}
                className="h-9 rounded-md border border-border bg-background px-2 text-sm"
              >
                {MODES.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="ml-auto flex items-center gap-2">
            <Button variant="outline" size="sm" className="gap-1.5 border-border" onClick={exportExcel}>
              <FileSpreadsheet className="h-4 w-4" /> Export Excel
            </Button>
            {mode === "preview" && (
              <Button variant="outline" size="sm" className="gap-1.5 border-border" onClick={() => window.print()}>
                <Printer className="h-4 w-4" /> Print
              </Button>
            )}
            {!isViewOnly && (
              <>
                <Button variant="outline" size="sm" className="gap-1.5 border-border" onClick={saveDraft} disabled={mutation.isPending}>
                  {action === "draft" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  {isEditing ? "Save Changes" : "Save Draft"}
                </Button>
                <Button size="sm" className="gap-1.5" onClick={submitRequest} disabled={mutation.isPending}>
                  {action === "submit" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  Submit
                </Button>
              </>
            )}
          </div>
        </div>
      </div>

      {validationFailure && (
        <div className="no-print mx-auto w-full max-w-3xl px-3 pt-6 sm:px-6">
          <ValidationResultPanel items={validationFailure.items} results={validationFailure.results} />
        </div>
      )}

      {/* Document */}
      <div className="w-full overflow-x-auto px-3 py-6 sm:px-6 print:overflow-visible print:p-0">
        <div className="pr-print-root mx-auto w-[816px] max-w-full">
          <div
            className="bg-white text-[12px] text-black shadow-card ring-1 ring-black/5 print:shadow-none print:ring-0"
            style={{ fontFamily: SERIF }}
          >
            {/* Title */}
            <div className="py-2 text-center">
              <h2 className="text-[15px] font-bold uppercase tracking-wide text-black">Purchase Request</h2>
            </div>

            {/* Header block */}
            <table className="w-full border-collapse">
              <colgroup>
                <col className="w-[46%]" />
                <col className="w-[30%]" />
                <col className="w-[24%]" />
              </colgroup>
              <tbody>
                <tr>
                  <td className="align-top" colSpan={2}>
                    <div className="flex items-baseline gap-1">
                      <span className="shrink-0 pl-1 font-semibold">Entity Name:</span>
                      <div className="min-w-0 flex-1">
                        <TextField value={entityName} onChange={setEntityName} editing={editing} />
                      </div>
                    </div>
                  </td>
                  <td className="align-top" colSpan={1}>
                    <div className="flex items-baseline gap-1">
                      <span className="shrink-0 pl-1 font-semibold">Fund Cluster:</span>
                      <div className="min-w-0 flex-1">
                        <TextField value={fundCluster} onChange={setFundCluster} editing={editing} />
                      </div>
                    </div>
                  </td>
                </tr>
                <tr>
                  <td className={cell}>
                    <div className="flex items-baseline gap-1">
                      <span className="shrink-0 pl-1 font-semibold">Office/Section :</span>
                      <div className="min-w-0 flex-1">
                        <BlendSelect
                          value={office}
                          onChange={setOffice}
                          editing={editing}
                          options={OFFICES.map((o) => ({ value: o.code, label: o.name }))}
                          render={() => officeName}
                        />
                      </div>
                    </div>
                  </td>
                  <td className={cell}>
                    <div className="flex items-baseline gap-1">
                      <span className="shrink-0 pl-1 font-semibold">PR No.:</span>
                      <div className="min-w-0 flex-1">
                        <TextField value={prNo} onChange={setPrNo} editing={editing} placeholder="Auto-generated on save" />
                      </div>
                    </div>
                  </td>
                  <td className={cell} rowSpan={2}>
                    <div className="flex items-baseline gap-1">
                      <span className="shrink-0 pl-1 font-semibold">Date:</span>
                      <div className="min-w-0 flex-1">
                        {editing ? (
                          <input
                            type="date"
                            value={date}
                            onChange={(e) => setDate(e.target.value)}
                            className="w-full rounded-sm bg-transparent px-1 py-0.5 outline-none hover:bg-amber-50 focus:bg-amber-100"
                            style={{ fontFamily: SERIF }}
                          />
                        ) : (
                          <div className="min-h-[1.4em] px-1 py-0.5">{date || " "}</div>
                        )}
                      </div>
                    </div>
                  </td>
                </tr>
                <tr>
                  <td className={cell}>
                    <div className="min-h-[1.4em] px-1 py-0.5">{" "}</div>
                  </td>
                  <td className={cell}>
                    <div className="flex items-baseline gap-1">
                      <span className="shrink-0 pl-1 font-semibold">Responsibility Center Code :</span>
                      <div className="min-w-0 flex-1">
                        <TextField value={rcc} onChange={setRcc} editing={editing} />
                      </div>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>

            {/* Item table */}
            <table className="w-full table-fixed border-collapse">
              <colgroup>
                <col className="w-[13%]" />
                <col className="w-[9%]" />
                <col className="w-[44%]" />
                <col className="w-[10%]" />
                <col className="w-[12%]" />
                <col className="w-[12%]" />
              </colgroup>
              <thead>
                <tr>
                  <th className="border border-black px-1 py-1 text-center font-bold">Stock/ Property No.</th>
                  <th className="border border-black px-1 py-1 text-center font-bold">Unit</th>
                  <th className="border border-black px-1 py-1 text-center font-bold">Item Description</th>
                  <th className="border border-black px-1 py-1 text-center font-bold">Quantity</th>
                  <th className="border border-black px-1 py-1 text-center font-bold">Unit Cost</th>
                  <th className="border border-black px-1 py-1 text-center font-bold">Total Cost</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it) => {
                  // Ceilings from the charged PPMP: what's left of this item's
                  // budget and quantity after prior PRs and this form's other rows.
                  const chargeItem = chargeItemForRow(it);
                  const remaining = chargeItem ? remainingFor(chargeItem, it.id) : null;
                  const rowTotal = parseNum(it.qty) * parseNum(it.unitCost);
                  const amountLeft = remaining ? remaining.amount - rowTotal : null;
                  const unitKey = it.unit.trim().toLowerCase();
                  const declaredQtyLeft = remaining && remaining.qtyByUnit.has(unitKey) ? remaining.qtyByUnit.get(unitKey)! - parseNum(it.qty) : null;
                  const overBudgetRow = amountLeft != null && amountLeft < -0.005;
                  const overQtyRow = declaredQtyLeft != null && declaredQtyLeft < 0;
                  const descOptions = (() => {
                    const first = it.description.split("\n")[0]?.trim() ?? "";
                    const opts = chargeItems.map((c) => ({ value: c.name, label: c.name }));
                    if (first && !chargeItems.some((c) => c.name === first)) opts.unshift({ value: first, label: first });
                    if (!first) opts.unshift({ value: "", label: "Select item from PPMP…" });
                    return opts;
                  })();
                  const unitOptions = (() => {
                    if (!chargeItem) return [];
                    const opts = chargeItem.units.map((u) => ({ value: u.unit, label: u.unit }));
                    if (!opts.some((o) => o.value === it.unit)) opts.unshift({ value: it.unit, label: it.unit || "—" });
                    return opts;
                  })();
                  return (
                  <tr
                    key={it.id}
                    ref={(el) => {
                      fieldRefs.current[`item-${it.id}`] = el;
                    }}
                    className={missingFields.has(`item-${it.id}`) ? "bg-red-50 ring-2 ring-inset ring-red-400" : undefined}
                  >
                    <td className={cell}>
                      <TextField value={it.stockNo} onChange={(v) => updateItem(it.id, { stockNo: v })} editing={editing} align="center" />
                    </td>
                    <td className={cell}>
                      {editing && chargeItem && chargeItem.units.length > 0 ? (
                        // Only the units declared in the PPMP item ("Quantity: 5 pax…") are offered.
                        <BlendSelect value={it.unit} onChange={(v) => updateItem(it.id, { unit: v })} editing align="center" options={unitOptions} />
                      ) : (
                        <TextField value={it.unit} onChange={(v) => updateItem(it.id, { unit: v })} editing={editing} align="center" />
                      )}
                    </td>
                    <td className={cell}>
                      {editing && chargeItems.length > 0 ? (
                        <>
                          {/* Charged to a PPMP: items must come from that PPMP. */}
                          <BlendSelect
                            value={it.description.split("\n")[0]?.trim() ?? ""}
                            onChange={(v) => pickChargeItem(it.id, v)}
                            editing
                            options={descOptions}
                          />
                          {chargeItem && remaining && (
                            <div
                              className={cn(
                                "no-print px-1 pb-0.5 text-[9px]",
                                overBudgetRow || overQtyRow ? "font-semibold text-red-600" : "text-emerald-700",
                              )}
                              style={{ fontFamily: "var(--font-sans)" }}
                            >
                              ₱{money(amountLeft ?? 0)} of ₱{money(chargeItem.budget)} left
                              {declaredQtyLeft != null && ` · ${declaredQtyLeft} ${unitKey} left`}
                            </div>
                          )}
                        </>
                      ) : (
                        <AutoTextarea value={it.description} onChange={(v) => updateItem(it.id, { description: v })} editing={editing} />
                      )}
                    </td>
                    <td className={cn(cell, overQtyRow && "bg-red-100 ring-2 ring-inset ring-red-500")}>
                      <NumField value={it.qty} onChange={(v) => updateItem(it.id, { qty: v })} editing={editing} align="center" integer />
                    </td>
                    <td className={cell}>
                      <NumField value={it.unitCost} onChange={(v) => updateItem(it.id, { unitCost: v })} editing={editing} format />
                    </td>
                    <td className={cn(cell, "relative", overBudgetRow && "bg-red-100 text-red-950 ring-2 ring-inset ring-red-500")}>
                      <div className="min-h-[1.4em] px-1 py-0.5 text-right tabular-nums">
                        {parseNum(it.qty) * parseNum(it.unitCost) ? money(parseNum(it.qty) * parseNum(it.unitCost)) : " "}
                      </div>
                      {editing && (
                        <div className="no-print absolute right-[-3.6rem] top-1 flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => addItemAfter(it.id)}
                            title="Add item below"
                            className="text-emerald-500 hover:text-emerald-700"
                          >
                            <Plus className="h-4 w-4" />
                          </button>
                          {items.length > 1 && (
                            <button
                              type="button"
                              onClick={() => removeItem(it.id)}
                              title="Remove item"
                              className="text-red-500 hover:text-red-700"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                  );
                })}
                <tr>
                  <td className="border border-black" colSpan={4}>
                    {" "}
                  </td>
                  <td className="border border-black px-1 py-0.5 text-center font-bold">TOTAL</td>
                  <td className="border border-black px-1 py-0.5 text-right font-bold tabular-nums">
                    {grandTotal ? money(grandTotal) : " "}
                  </td>
                </tr>
              </tbody>
            </table>

            {editing && (
              <div className="no-print border-x border-b border-black bg-secondary/30 px-2 py-1.5">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={addItem}
                  className="h-7 gap-1.5 border-border transition-all hover:-translate-y-px hover:border-primary hover:bg-primary hover:text-primary-foreground hover:shadow-sm"
                  style={{ fontFamily: "var(--font-sans)" }}
                >
                  <Plus className="h-3.5 w-3.5" /> Add Item Row
                </Button>
              </div>
            )}

            {/* Purpose */}
            <table className="w-full border-collapse">
              <tbody>
                <tr>
                  <td className="border border-black px-1 py-1 align-top">
                    <div className="flex items-start gap-1">
                      <span className="shrink-0 pt-0.5 font-semibold leading-snug">Purpose:</span>
                      <div
                        ref={(el) => {
                          fieldRefs.current["purpose"] = el;
                        }}
                        className={cn("min-h-[3rem] min-w-0 flex-1", missingFields.has("purpose") && "rounded-sm bg-red-50 ring-2 ring-inset ring-red-400")}
                      >
                        <AutoTextarea
                          value={purpose}
                          onChange={(v) => {
                            setPurpose(v);
                            if (v.trim()) clearMissing("purpose");
                          }}
                          editing={editing}
                        />
                      </div>
                    </div>
                    <div className="mt-2 flex items-baseline gap-1">
                      <span className="shrink-0 font-semibold italic">Charged to:</span>
                      <div
                        ref={(el) => {
                          fieldRefs.current["chargedTo"] = el;
                        }}
                        className={cn("min-w-0 flex-1 italic", missingFields.has("chargedTo") && "rounded-sm bg-red-50 ring-2 ring-inset ring-red-400")}
                      >
                        <BlendSelect
                          value={fundSource}
                          onChange={(v) => {
                            setFundSource(v);
                            clearMissing("chargedTo");
                          }}
                          editing={editing}
                          options={chargeToOptions}
                        />
                      </div>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>

            {/* Signatures — faint guide lines on screen, only the outer box prints */}
            <div className="border-x border-b border-black">
              <table className="w-full border-collapse">
                <colgroup>
                  <col className="w-[16%]" />
                  <col className="w-[28%]" />
                  <col className="w-[28%]" />
                  <col className="w-[28%]" />
                </colgroup>
                <tbody>
                  <tr>
                    <td className="border border-black/20 print:border-transparent">&nbsp;</td>
                    <td className="border border-black/20 print:border-transparent px-1 py-0.5">Requested by:</td>
                    <td className="border border-black/20 print:border-transparent px-1 py-0.5">Recommending Approval:</td>
                    <td className="border border-black/20 print:border-transparent px-1 py-0.5">Approved by:</td>
                  </tr>
                  <tr>
                    <td className="border border-black/20 print:border-transparent px-1 py-0.5 align-top">Signature :</td>
                    <td className="h-12 border border-black/20 print:border-transparent">&nbsp;</td>
                    <td className="h-12 border border-black/20 print:border-transparent">&nbsp;</td>
                    <td className="h-12 border border-black/20 print:border-transparent">&nbsp;</td>
                  </tr>
                  <tr>
                    <td className="border border-black/20 print:border-transparent px-1 py-0.5 align-bottom">Printed Name :</td>
                    <td className="border border-black/20 print:border-transparent align-bottom">
                      <TextField value={reqName} onChange={setReqName} editing={false} align="center" bold />
                    </td>
                    <td className="border border-black/20 print:border-transparent align-bottom">
                      <SignatorySelect value={recName} options={signatories} editing={editing} onPick={(n) => pickSignatory(n, setRecName, setRecDesig)} />
                    </td>
                    <td className="border border-black/20 print:border-transparent align-bottom">
                      <SignatorySelect value={appName} options={signatories} editing={editing} onPick={(n) => pickSignatory(n, setAppName, setAppDesig)} />
                    </td>
                  </tr>
                  <tr>
                    <td className="border border-black/20 print:border-transparent px-1 py-0.5 align-top">Designation :</td>
                    <td className="border border-black/20 print:border-transparent align-top">
                      <TextField value={reqDesig} onChange={setReqDesig} editing={false} align="center" />
                    </td>
                    <td className="border border-black/20 print:border-transparent align-top">
                      <TextField value={recDesig} onChange={setRecDesig} editing={editing} align="center" />
                    </td>
                    <td className="border border-black/20 print:border-transparent align-top">
                      <TextField value={appDesig} onChange={setAppDesig} editing={editing} align="center" />
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {editing && (
            <p className="no-print mx-auto mt-3 max-w-xl text-center text-xs text-muted-foreground">
              Type directly on the form. Highlighted fields are editable — switch to{" "}
              <span className="font-semibold text-foreground">Preview</span> to see the clean, printable version.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
