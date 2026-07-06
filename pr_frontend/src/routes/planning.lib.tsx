import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  ChevronRight, Undo2, Redo2, Copy, CalendarDays, SlidersHorizontal, Eye, Download,
  Save, Send, X, CloudCheck, Circle, PanelsTopLeft, Minimize2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/planning/lib")({
  head: () => ({
    meta: [
      { title: "Line Item Budget (LIB) — DOST Caraga Procurement System" },
      { name: "description", content: "Prepare and submit the Line Item Budget for the fiscal year." },
    ],
  }),
  component: LibPage,
});

const peso = (n: number) =>
  new Intl.NumberFormat("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

type Line = { object: string; mode: string; qty: number; unit: string; unitCost: number; source: string; quarter: string; italic?: boolean };
type Group = { title: string; lines: Line[] };
type Section = { title: string; groups: Group[] };

const SECTIONS: Section[] = [
  {
    title: "I. Maintenance and Other Operating Expenses",
    groups: [
      {
        title: "Traveling Expenses",
        lines: [
          { object: "Travel Expenses", mode: "N/A", qty: 1, unit: "lot", unitCost: 88220, source: "GAA 2026", quarter: "Q1" },
          { object: "Fuel Expenses", mode: "Shopping", qty: 1, unit: "lot", unitCost: 10000, source: "GAA 2026", quarter: "Q1" },
        ],
      },
      {
        title: "Supplies and Materials Expenses",
        lines: [
          { object: "Office Supplies", mode: "Public Bidding", qty: 1, unit: "lot", unitCost: 68990, source: "GAA 2026", quarter: "Q1", italic: true },
          { object: "ICT Supplies", mode: "Public Bidding", qty: 1, unit: "lot", unitCost: 59990, source: "GAA 2026", quarter: "Q1", italic: true },
        ],
      },
    ],
  },
];

const WORKFLOW = [
  { label: "Draft", note: "Initial Stage", state: "current" as const },
  { label: "Pending Supervisor Review", note: "", state: "upcoming" as const },
  { label: "Forwarded to Budget Officer", note: "", state: "upcoming" as const },
  { label: "Pending Regional Director Approval", note: "", state: "upcoming" as const },
];

const GRAND_TOTAL = 2000000;
const ALLOCATION = 2000000;
const TOTAL_ITEMS = 15;

function LibPage() {
  const [focus, setFocus] = useState(false);

  return (
    <div className="flex min-h-full flex-col bg-background">
      <LibHeader onFocus={() => setFocus(true)} />

      <div className="grid flex-1 grid-cols-1 gap-0 xl:grid-cols-[1fr_320px]">
        {/* Budget sheet */}
        <div className="min-w-0 overflow-x-auto p-4 sm:p-6">
          <BudgetSheet />
        </div>

        {/* Properties panel */}
        <aside className="hidden border-l border-border bg-card/40 p-5 xl:block">
          <PropertiesPanel />
        </aside>
      </div>

      <LibFooter />

      {focus && <FocusMode onClose={() => setFocus(false)} />}
    </div>
  );
}

function LibHeader({ onFocus }: { onFocus: () => void }) {
  return (
    <div className="border-b border-border bg-card px-4 py-4 sm:px-6">
      <nav className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <span>Planning</span>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="font-semibold text-navy">Line Item Budget</span>
      </nav>

      <div className="mt-2 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-xl font-bold text-navy sm:text-2xl">Line Item Budget (LIB) FY 2026</h1>
          <p className="mt-1 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <CloudCheck className="h-3.5 w-3.5 text-success" /> Auto-saved 2 mins ago
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <div className="flex items-center rounded-lg border border-border bg-background p-0.5">
            {[Undo2, Redo2, Copy, CalendarDays, SlidersHorizontal].map((Icon, i) => (
              <Button key={i} variant="ghost" size="icon" className="h-8 w-8 text-navy">
                <Icon className="h-4 w-4" />
              </Button>
            ))}
          </div>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={onFocus}>
            <Eye className="h-4 w-4" /> View Final Draft
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1.5">
                <Download className="h-4 w-4" /> Export
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem>Export as Excel</DropdownMenuItem>
              <DropdownMenuItem>Export as PDF</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button variant="outline" size="sm" className="gap-1.5">
            <Save className="h-4 w-4" /> Save as Draft
          </Button>
          <Button size="sm" className="gap-1.5">
            <Send className="h-4 w-4" /> Submit for Approval
          </Button>
        </div>
      </div>
    </div>
  );
}

const COLS = ["Object of Expenditure", "Mode", "Qty", "Unit", "Unit Cost", "Total Cost", "Funding Source", "Quarter"];

function BudgetSheet() {
  return (
    <Card className="min-w-[820px] overflow-hidden border border-border p-0 shadow-card">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="bg-secondary/60 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {COLS.map((c, i) => (
              <th key={c} className={cn("border-b border-border px-3 py-2.5", i >= 2 && i <= 5 && "text-right")}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {SECTIONS.map((section) => (
            <SectionRows key={section.title} section={section} />
          ))}
        </tbody>
      </table>
    </Card>
  );
}

function SectionRows({ section }: { section: Section }) {
  return (
    <>
      <tr>
        <td colSpan={COLS.length} className="border-b border-border bg-navy/[0.04] px-3 py-2 text-sm font-bold text-navy">
          {section.title}
        </td>
      </tr>
      {section.groups.map((group) => (
        <GroupRows key={group.title} group={group} />
      ))}
    </>
  );
}

function GroupRows({ group }: { group: Group }) {
  return (
    <>
      <tr>
        <td colSpan={COLS.length} className="border-b border-border px-3 py-1.5 pl-6 text-sm font-semibold text-primary">
          {group.title}
        </td>
      </tr>
      {group.lines.map((line, i) => (
        <tr key={i} className="border-b border-border/70 hover:bg-secondary/40">
          <td className={cn("px-3 py-2 pl-9", line.italic && "italic")}>{line.object}</td>
          <td className="px-3 py-1.5">
            <div className="flex h-8 items-center justify-between gap-2 rounded-md border border-input bg-background px-2 text-xs text-muted-foreground">
              {line.mode} <ChevronRight className="h-3 w-3 rotate-90" />
            </div>
          </td>
          <td className="px-3 py-2 text-right tabular-nums">{line.qty}</td>
          <td className="px-3 py-2 text-right text-muted-foreground">{line.unit}</td>
          <td className="px-3 py-1.5 text-right">
            <Input defaultValue={peso(line.unitCost)} className="h-8 border-transparent bg-transparent px-1 text-right tabular-nums hover:border-input focus-visible:border-input" />
          </td>
          <td className="px-3 py-2 text-right font-semibold tabular-nums text-navy">{peso(line.qty * line.unitCost)}</td>
          <td className="px-3 py-2 text-muted-foreground">{line.source}</td>
          <td className="px-3 py-2 text-right text-muted-foreground">{line.quarter}</td>
        </tr>
      ))}
    </>
  );
}

function PropertiesPanel() {
  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-navy">Properties</h2>
          <button className="text-muted-foreground hover:text-navy" aria-label="Close panel"><X className="h-4 w-4" /></button>
        </div>
      </div>

      <div>
        <p className="label-eyebrow mb-3">Workflow Status</p>
        <ol className="space-y-4">
          {WORKFLOW.map((step, i) => (
            <li key={step.label} className="flex gap-3">
              <div className="flex flex-col items-center">
                {step.state === "current" ? (
                  <span className="mt-0.5 flex h-4 w-4 items-center justify-center">
                    <span className="h-2.5 w-2.5 rounded-full bg-primary ring-4 ring-primary/15" />
                  </span>
                ) : (
                  <Circle className="mt-0.5 h-4 w-4 text-border" />
                )}
                {i < WORKFLOW.length - 1 && <span className="mt-1 w-px flex-1 bg-border" />}
              </div>
              <div className="pb-1">
                <p className={cn("text-sm font-medium", step.state === "current" ? "text-navy" : "text-muted-foreground")}>{step.label}</p>
                {step.note && <p className="text-xs text-muted-foreground">{step.note}</p>}
              </div>
            </li>
          ))}
        </ol>
      </div>

      <div>
        <p className="label-eyebrow mb-2">Comments <span className="ml-1 text-muted-foreground">1</span></p>
        <Input placeholder="Add a comment…" className="h-9 bg-background" />
      </div>
    </div>
  );
}

function LibFooter() {
  return (
    <div className="sticky bottom-0 z-10 flex flex-wrap items-center justify-between gap-3 border-t border-border bg-card px-4 py-3 sm:px-6">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-xs text-muted-foreground">
        <span>Total Items: <span className="font-semibold text-navy">{TOTAL_ITEMS}</span></span>
        <span>Allocation: <span className="font-semibold text-navy">₱ {peso(ALLOCATION)}</span></span>
      </div>
      <div className="flex items-center gap-2 rounded-lg bg-secondary px-4 py-2">
        <span className="label-eyebrow">Grand Total</span>
        <span className="text-base font-bold text-navy">₱ {peso(GRAND_TOTAL)}</span>
      </div>
    </div>
  );
}

/* ── Focus mode: clean, read-only "Approved LIB" view ─────────────────── */

function FocusMode({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy/70 p-3 backdrop-blur-sm sm:p-8">
      <div className="flex max-h-full w-full max-w-4xl flex-col overflow-hidden rounded-xl border-2 border-primary bg-card shadow-2xl ring-4 ring-primary/20">
        {/* mini topbar */}
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <span className="text-sm font-bold text-[var(--brand-blue)]">Procurement Management System</span>
          <button onClick={onClose} className="text-muted-foreground hover:text-navy" aria-label="Exit focus mode"><X className="h-4 w-4" /></button>
        </div>

        {/* header + toolbar */}
        <div className="flex flex-col gap-3 border-b border-border px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-lg font-bold text-navy">LIB — Focus Mode</h2>
            <p className="mt-0.5 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <CloudCheck className="h-3.5 w-3.5 text-success" /> Auto-saved 2 mins ago
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <Button variant="outline" size="sm" className="gap-1.5"><Eye className="h-4 w-4" /> View Final Draft</Button>
            <Button variant="outline" size="sm" className="gap-1.5"><Download className="h-4 w-4" /> Export</Button>
            <Button variant="outline" size="sm" className="gap-1.5"><Save className="h-4 w-4" /> Save as Draft</Button>
            <Button size="sm" className="gap-1.5"><Send className="h-4 w-4" /> Submit for Approval</Button>
          </div>
        </div>

        {/* sheet */}
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
          <div className="mb-5 space-y-1 rounded-lg bg-secondary/50 p-4 text-xs text-muted-foreground">
            {["Program Title", "Project Title", "Implementing Agency", "Total Duration", "Cooperating Agency", "Project Leader", "Monitoring Agency"].map((f) => (
              <div key={f} className="flex gap-2">
                <span className="w-40 shrink-0 font-semibold uppercase tracking-wide text-navy/70">{f}:</span>
                <span className="h-4 flex-1 border-b border-dashed border-border" />
              </div>
            ))}
          </div>

          {SECTIONS.map((section) => (
            <div key={section.title} className="mb-4">
              <div className="flex items-baseline justify-between border-b-2 border-navy/20 pb-1">
                <h3 className="text-sm font-bold text-navy">{section.title}</h3>
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Approved LIB</span>
              </div>
              {section.groups.map((group) => (
                <div key={group.title} className="mt-2">
                  <p className="py-1 pl-4 text-sm font-semibold text-navy">{group.title}</p>
                  {group.lines.map((line, i) => (
                    <div key={i} className="flex items-center justify-between py-1 pl-8 text-sm">
                      <span className={cn("text-foreground", line.italic && "italic")}>{line.object}</span>
                      <span className="font-medium tabular-nums text-navy">{peso(line.qty * line.unitCost)}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          ))}
        </div>

        {/* footer */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-3">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-xs text-muted-foreground">
            <span>Total Items: <span className="font-semibold text-navy">{TOTAL_ITEMS}</span></span>
            <span>Allocation: <span className="font-semibold text-navy">₱ {peso(ALLOCATION)}</span></span>
          </div>
          <div className="flex items-center gap-2 rounded-lg bg-secondary px-4 py-2">
            <span className="label-eyebrow">Grand Total</span>
            <span className="text-base font-bold text-navy">₱ {peso(GRAND_TOTAL)}</span>
          </div>
        </div>

        {/* focus toggles */}
        <div className="pointer-events-none absolute bottom-20 left-4 flex flex-col gap-2">
          <Button size="icon" className="pointer-events-auto h-9 w-9 rounded-md shadow-lg"><PanelsTopLeft className="h-4 w-4" /></Button>
        </div>
        <div className="pointer-events-none absolute bottom-20 right-4">
          <Button size="icon" onClick={onClose} className="pointer-events-auto h-9 w-9 rounded-md shadow-lg" aria-label="Exit focus mode"><Minimize2 className="h-4 w-4" /></Button>
        </div>
      </div>
    </div>
  );
}
