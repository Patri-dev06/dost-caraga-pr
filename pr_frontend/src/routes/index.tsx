import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, XAxis, YAxis } from "recharts";
import {
  FilePlus2, BookOpen, ShoppingCart, ScrollText, ShieldCheck, Inbox, BarChart3, Library,
  FileText, ArrowRight, Clock, CheckCircle2, Truck,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { StatCard } from "@/components/app/stat-card";
import { cn } from "@/lib/utils";
import { apiGetPurchaseRequests, hasValidToken } from "@/lib/api";
import { useCanAccess } from "@/lib/current-user";
import { moduleForPath } from "@/lib/modules";
import { PrTrackerSection } from "@/components/app/pr-tracker-card";
import { type PurchaseRequest } from "@/lib/mock-data";
import { fmtAmount, libTotals, listLibs, type LibDoc } from "@/lib/lib-store";
import { listAllPpmps, type PpmpForLib } from "@/lib/ppmp-store";
import { listAllRfqs, type RfqDoc } from "@/lib/rfq-store";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Dashboard — DOST Caraga Procurement System" },
      { name: "description", content: "Overview of every procurement module — LIB, PPMP, Purchase Requests, and RFQ — for DOST Caraga." },
    ],
  }),
  component: Dashboard,
});

const peso = (n: number) => `₱${fmtAmount(n)}`;

function Dashboard() {
  const canAccess = useCanAccess();
  const [local, setLocal] = useState<{ libs: LibDoc[]; ppmps: PpmpForLib[]; rfqs: RfqDoc[] }>({ libs: [], ppmps: [], rfqs: [] });

  // localStorage-backed modules are client-only — read after mount.
  useEffect(() => {
    setLocal({ libs: listLibs(), ppmps: listAllPpmps(), rfqs: listAllRfqs() });
  }, []);

  const { data: prs = [] } = useQuery({
    queryKey: ["purchase-requests"],
    queryFn: apiGetPurchaseRequests,
    enabled: hasValidToken(),
    staleTime: 30_000,
  });

  const { libs, ppmps, rfqs } = local;

  const prPending = prs.filter((p) => /pending|validation|for approval|review/i.test(p.status)).length;
  const prApproved = prs.filter((p) => /approved/i.test(p.status)).length;

  const libBudget = useMemo(() => libs.reduce((s, l) => s + libTotals(l.rows).approved, 0), [libs]);
  const ppmpBudget = useMemo(() => ppmps.reduce((s, p) => s + (p.totalBudget || 0), 0), [ppmps]);
  const rfqBudget = useMemo(() => rfqs.reduce((s, r) => s + (r.estimatedBudget || 0), 0), [rfqs]);
  const prBudget = useMemo(() => prs.reduce((s, p) => s + (p.amount || 0), 0), [prs]);

  // Every module the dashboard could show — filtered below to only what this user is actually
  // allowed into. Was previously shown unfiltered to everyone, including modules a regular user
  // has no access to and would just bounce off of.
  const allModules: ModuleCardProps[] = [
    { name: "Line Item Budget", desc: "DOST Form 4 budgets & reprogramming", icon: FileText, to: "/planning/lib", count: libs.length, value: peso(libBudget) },
    { name: "PPMP", desc: "Project procurement management plans", icon: BookOpen, to: "/planning/ppmp", count: ppmps.length, value: peso(ppmpBudget) },
    { name: "Purchase Requests", desc: "Requests across offices & fund sources", icon: ShoppingCart, to: "/purchase-requests", count: prs.length, value: peso(prBudget) },
    { name: "RFQ", desc: "Requests for quotation & canvassing", icon: ScrollText, to: "/rfq", count: rfqs.length, value: peso(rfqBudget) },
    { name: "Purchase Orders", desc: "Budget, accounting & RD approval chain", icon: Truck, to: "/po", value: "track POs" },
    { name: "Validation", desc: "Pre-approval budget & document checks", icon: ShieldCheck, to: "/validation", count: prPending, value: "items to review" },
    { name: "Approval Inbox", desc: "Recommend, approve, or return", icon: Inbox, to: "/approval-inbox", count: prPending, value: "awaiting action" },
    { name: "References", desc: "APP-CSE, APP-Non-CSE & budget", icon: Library, to: "/references/app-cse", value: "master data" },
    { name: "Reports", desc: "Analytics & exports", icon: BarChart3, to: "/reports", value: "view reports" },
  ];
  const modules = allModules.filter((m) => {
    const key = moduleForPath(m.to);
    return !key || canAccess(key);
  });

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-navy sm:text-3xl">
            Procurement <span className="text-[var(--brand-blue)]">Modules</span>
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Everything in one place — jump into any module and pick up where the office left off.
          </p>
        </div>
      </div>

      {/* Stat cards — live counts */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Line Item Budgets" value={libs.length} to="/planning/lib" />
        <StatCard label="PPMP" value={ppmps.length} to="/planning/ppmp" />
        <StatCard label="Purchase Requests" value={prs.length} to="/purchase-requests" />
        <StatCard label="RFQ" value={rfqs.length} to="/rfq" />
        <StatCard label="Pending Approval" value={prPending} icon={Clock} accent to="/approval-inbox" />
        <StatCard label="Approved PR" value={prApproved} icon={CheckCircle2} to="/purchase-requests" />
      </div>

      {/* Module tiles — the heart of the dashboard */}
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Modules</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {modules.map((m) => (
            <ModuleCard key={m.name} {...m} />
          ))}
        </div>
      </section>

      {/* Your Purchase Requests + what needs your action */}
      <PrTrackerSection />

      {/* Budget by module + recent activity */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <BudgetByModuleCard libBudget={libBudget} ppmpBudget={ppmpBudget} prBudget={prBudget} rfqBudget={rfqBudget} />
        </div>
        <RecentActivityCard libs={libs} ppmps={ppmps} rfqs={rfqs} prs={prs} />
      </div>
    </div>
  );
}

/* ── Module card ──────────────────────────────────────────────────────── */

type ModuleCardProps = {
  name: string;
  desc: string;
  icon: typeof FileText;
  to: string;
  count?: number;
  value?: string;
  accent?: boolean;
};

function ModuleCard({ name, desc, icon: Icon, to, count, value, accent }: ModuleCardProps) {
  return (
    <Link
      to={to}
      className={cn(
        "group flex flex-col justify-between gap-4 rounded-xl border bg-card p-4 shadow-card transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md",
        accent ? "border-primary/30" : "border-border",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className={cn(
          "flex h-10 w-10 items-center justify-center rounded-lg transition-colors",
          accent ? "bg-primary text-primary-foreground" : "bg-secondary text-primary group-hover:bg-primary group-hover:text-primary-foreground",
        )}>
          <Icon className="h-5 w-5" strokeWidth={1.75} />
        </span>
        {count !== undefined && <span className="text-2xl font-bold tabular-nums text-navy">{count}</span>}
      </div>
      <div>
        <p className="flex items-center gap-1 text-sm font-semibold text-navy">
          {name}
          <ArrowRight className="h-3.5 w-3.5 -translate-x-1 opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100" />
        </p>
        <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{desc}</p>
        {value && <p className="mt-1.5 text-xs font-medium text-primary">{value}</p>}
      </div>
    </Link>
  );
}

/* ── Budget by module chart ───────────────────────────────────────────── */

const chartConfig = {
  amount: { label: "Budget (₱K)", color: "var(--chart-1)" },
} satisfies ChartConfig;

const MODULE_COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)"];

function BudgetByModuleCard({ libBudget, ppmpBudget, prBudget, rfqBudget }: { libBudget: number; ppmpBudget: number; prBudget: number; rfqBudget: number }) {
  const data = [
    { module: "LIB", amount: Math.round(libBudget / 1000) },
    { module: "PPMP", amount: Math.round(ppmpBudget / 1000) },
    { module: "PR", amount: Math.round(prBudget / 1000) },
    { module: "RFQ", amount: Math.round(rfqBudget / 1000) },
  ];
  const empty = data.every((d) => d.amount === 0);

  return (
    <Card className="border border-border p-5 shadow-card">
      <div className="mb-4">
        <h2 className="text-base font-bold text-navy">Budget by Module</h2>
        <p className="text-xs text-muted-foreground">Total value tracked per module · ₱ thousands</p>
      </div>
      {empty ? (
        <div className="flex h-[260px] items-center justify-center text-sm text-muted-foreground">
          No budget data yet — create a LIB, PPMP, PR, or RFQ to see it here.
        </div>
      ) : (
        <ChartContainer config={chartConfig} className="h-[260px] w-full">
          <BarChart data={data} margin={{ left: -8, top: 4 }}>
            <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 3" />
            <XAxis dataKey="module" tickLine={false} axisLine={false} tickMargin={8} className="text-xs" />
            <YAxis tickLine={false} axisLine={false} tickMargin={6} width={52} tickFormatter={(v) => `₱${v}K`} className="text-xs" />
            <ChartTooltip cursor={{ fill: "var(--secondary)", opacity: 0.5 }} content={<ChartTooltipContent />} />
            <Bar dataKey="amount" radius={[4, 4, 0, 0]} maxBarSize={64}>
              {data.map((_, i) => (
                <Cell key={i} fill={MODULE_COLORS[i % MODULE_COLORS.length]} />
              ))}
            </Bar>
          </BarChart>
        </ChartContainer>
      )}
    </Card>
  );
}

/* ── Recent activity (merged across modules) ──────────────────────────── */

type RecentItem = { key: string; kind: "LIB" | "PPMP" | "PR" | "RFQ"; title: string; subtitle: string; time: number; to: string; params?: Record<string, string>; search?: Record<string, string> };

const kindStyles: Record<RecentItem["kind"], { icon: typeof FileText; tone: string }> = {
  LIB: { icon: FileText, tone: "bg-primary/10 text-primary" },
  PPMP: { icon: BookOpen, tone: "bg-chart-2/10 text-chart-2" },
  PR: { icon: ShoppingCart, tone: "bg-success/10 text-success" },
  RFQ: { icon: ScrollText, tone: "bg-warning/15 text-warning-foreground" },
};

function RecentActivityCard({ libs, ppmps, rfqs, prs }: { libs: LibDoc[]; ppmps: PpmpForLib[]; rfqs: RfqDoc[]; prs: PurchaseRequest[] }) {
  const items: RecentItem[] = [
    ...libs.map((l) => ({ key: `lib-${l.id}`, kind: "LIB" as const, title: l.projectTitle || "Untitled LIB", subtitle: `CY ${l.fiscalYear} · ${l.status}`, time: Date.parse(l.updatedAt || l.createdAt) || 0, to: "/planning/lib/new", search: { edit: l.id } })),
    ...ppmps.map((p) => ({ key: `ppmp-${p.id}`, kind: "PPMP" as const, title: p.ppmpNo || "PPMP", subtitle: `${p.endUserUnit} · FY ${p.fiscalYear}`, time: Date.parse(p.createdAt) || 0, to: "/planning/ppmp" })),
    ...rfqs.map((r) => ({ key: `rfq-${r.id}`, kind: "RFQ" as const, title: r.quotationNo || "RFQ", subtitle: `${r.prNo}${r.supplierName ? ` · ${r.supplierName}` : ""}`, time: Date.parse(r.createdAt) || 0, to: "/rfq/$rfqId", params: { rfqId: r.id } })),
    ...prs.map((p) => ({ key: `pr-${p.id}`, kind: "PR" as const, title: p.prNo, subtitle: `${p.office} · ${p.status}`, time: Date.parse(p.dateSubmitted) || 0, to: "/purchase-requests/$prId", params: { prId: p.id } })),
  ]
    .sort((a, b) => b.time - a.time)
    .slice(0, 7);

  return (
    <Card className="border border-border p-5 shadow-card">
      <h2 className="mb-3 text-base font-bold text-navy">Recent Activity</h2>
      {items.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Nothing here yet. Documents you create will appear here.</p>
      ) : (
        <ul className="space-y-1">
          {items.map((it) => {
            const s = kindStyles[it.kind];
            const Icon = s.icon;
            return (
              <li key={it.key}>
                <Link
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  to={it.to as any}
                  params={it.params as never}
                  search={it.search as never}
                  className="flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-secondary/50"
                >
                  <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", s.tone)}>
                    <Icon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-navy">
                      <span className="mr-1.5 rounded bg-secondary px-1 py-0.5 text-[10px] font-semibold text-muted-foreground">{it.kind}</span>
                      {it.title}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">{it.subtitle}</p>
                  </div>
                  <span className="text-xs text-muted-foreground">{it.time ? new Date(it.time).toLocaleDateString("en-PH", { month: "short", day: "numeric" }) : "—"}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      <Link to="/planning/lib" className="mt-3 flex items-center justify-center gap-1 text-xs font-medium text-primary hover:underline">
        <FilePlus2 className="h-3.5 w-3.5" /> Create a new document
      </Link>
    </Card>
  );
}
