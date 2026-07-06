import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Bar, BarChart, CartesianGrid, XAxis, YAxis,
} from "recharts";
import {
  SlidersHorizontal, Download, Clock, FilePlus2, BookOpen, ShoppingCart, Upload,
  CheckCircle2, XCircle, FileText, Filter,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { StatCard } from "@/components/app/stat-card";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Dashboard — DOST Caraga Procurement System" },
      { name: "description", content: "Overview of purchase requests, validation queue, and procurement activity for DOST Caraga." },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-navy sm:text-3xl">
            Dashboard <span className="text-[var(--brand-blue)]">Overview</span>
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Welcome back Supply Unit, here's the current status of procurement activities.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" className="gap-2">
            <SlidersHorizontal className="h-4 w-4" /> Filter
          </Button>
          <Button className="gap-2">
            <Download className="h-4 w-4" /> Export Report
          </Button>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Total LIB" value={42} delta="12% vs last month" trend="up" />
        <StatCard label="Total PPMP" value={18} delta="Unchanged" trend="neutral" />
        <StatCard label="Purchase Req" value={156} delta="3% vs last month" trend="down" />
        <StatCard label="Pending Approval" value={24} icon={Clock} accent />
        <StatCard label="Approved" value={89} delta="8% vs last month" trend="up" />
        <StatCard label="Drafts" value={12} delta="Unchanged" trend="neutral" />
      </div>

      {/* Main grid */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <BudgetChartCard />
          <QuickActions />
        </div>
        <div className="space-y-5">
          <NotificationsCard />
          <ActivitiesCard />
        </div>
      </div>
    </div>
  );
}

/* ── Budget Utilization chart ─────────────────────────────────────────── */

const budgetData = [
  { period: "Q1", lib: 1850, ppmp: 1200, pr: 900 },
  { period: "Q2", lib: 2100, ppmp: 1400, pr: 1100 },
  { period: "Q3", lib: 1600, ppmp: 980, pr: 760 },
  { period: "Q4", lib: 1980, ppmp: 1250, pr: 1020 },
];

const chartConfig = {
  lib: { label: "LIB", color: "var(--chart-1)" },
  ppmp: { label: "PPMP", color: "var(--chart-2)" },
  pr: { label: "PR", color: "var(--chart-3)" },
} satisfies ChartConfig;

function BudgetChartCard() {
  return (
    <Card className="border border-border p-5 shadow-card">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-navy">Budget Utilization</h2>
          <p className="text-xs text-muted-foreground">LIB vs PPMP vs PR · FY 2026 (₱ thousands)</p>
        </div>
      </div>
      <ChartContainer config={chartConfig} className="h-[260px] w-full">
        <BarChart data={budgetData} barGap={2} barCategoryGap="24%" margin={{ left: -8, top: 4 }}>
          <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 3" />
          <XAxis dataKey="period" tickLine={false} axisLine={false} tickMargin={8} className="text-xs" />
          <YAxis tickLine={false} axisLine={false} tickMargin={6} width={44}
            tickFormatter={(v) => `₱${v}K`} className="text-xs" />
          <ChartTooltip cursor={{ fill: "var(--secondary)", opacity: 0.5 }} content={<ChartTooltipContent />} />
          <ChartLegend content={<ChartLegendContent />} />
          <Bar dataKey="lib" fill="var(--color-lib)" radius={[4, 4, 0, 0]} maxBarSize={22} />
          <Bar dataKey="ppmp" fill="var(--color-ppmp)" radius={[4, 4, 0, 0]} maxBarSize={22} />
          <Bar dataKey="pr" fill="var(--color-pr)" radius={[4, 4, 0, 0]} maxBarSize={22} />
        </BarChart>
      </ChartContainer>
    </Card>
  );
}

/* ── Quick actions ────────────────────────────────────────────────────── */

const quickActions = [
  { label: "Create LIB", icon: FilePlus2, to: "/planning/lib" as const },
  { label: "Create PPMP", icon: BookOpen, to: "/references/ppmp" as const },
  { label: "Create PR", icon: ShoppingCart, to: "/purchase-requests/new" as const },
  { label: "Upload File", icon: Upload, to: "/purchase-requests" as const },
];

function QuickActions() {
  return (
    <Card className="border border-border p-5 shadow-card">
      <h2 className="mb-4 text-base font-bold text-navy">Quick Actions</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {quickActions.map((a) => (
          <Link
            key={a.label}
            to={a.to}
            className="group flex flex-col items-center justify-center gap-2 rounded-xl border border-border bg-background py-5 text-center transition-colors hover:border-primary/40 hover:bg-secondary"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-secondary text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
              <a.icon className="h-5 w-5" strokeWidth={1.75} />
            </span>
            <span className="text-xs font-medium text-navy">{a.label}</span>
          </Link>
        ))}
      </div>
    </Card>
  );
}

/* ── Notifications ────────────────────────────────────────────────────── */

const notifications = [
  { id: 1, text: "PR-2024-045 requires your approval", time: "10 mins ago", unread: true },
  { id: 2, text: "PPMP-2024-02 was approved by Admin", time: "2 hours ago", unread: false },
  { id: 3, text: "LIB-IT-001 was updated by J. Doe", time: "Yesterday", unread: false },
];

function NotificationsCard() {
  return (
    <Card className="border border-border p-5 shadow-card">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-base font-bold text-navy">Notifications</h2>
        <button className="text-xs font-medium text-primary hover:underline">Mark all read</button>
      </div>
      <ul className="space-y-2">
        {notifications.map((n) => (
          <li
            key={n.id}
            className={cn(
              "rounded-lg border p-3 text-sm",
              n.unread ? "border-primary/20 bg-primary/[0.06]" : "border-transparent bg-secondary/40",
            )}
          >
            <div className="flex items-start gap-2">
              {n.unread && <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />}
              <div className={cn(!n.unread && "pl-3.5")}>
                <p className="font-medium leading-snug text-navy">{n.text}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{n.time}</p>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/* ── Recent activities ────────────────────────────────────────────────── */

type Activity = {
  who: string;
  initials: string;
  action: string;
  ref: string;
  time: string;
  tone: "created" | "approved" | "rejected";
  reason?: string;
};

const activities: Activity[] = [
  { who: "Al France Franco", initials: "AF", action: "created", ref: "PR-2026-046", time: "Today, 09:30 AM", tone: "created" },
  { who: "Marites Apolinaria", initials: "MA", action: "rejected", ref: "LIB-HR-002", time: "Yesterday, 14:15 PM", tone: "rejected", reason: "Insufficient budget allocation." },
  { who: "Dir. Reyes", initials: "DR", action: "approved", ref: "PPMP-2024-01", time: "March 28, 10:00 AM", tone: "approved" },
];

const toneStyles: Record<Activity["tone"], { ring: string; icon: typeof CheckCircle2; color: string }> = {
  created: { ring: "bg-primary/10 text-primary", icon: FileText, color: "text-primary" },
  approved: { ring: "bg-success/10 text-success", icon: CheckCircle2, color: "text-success" },
  rejected: { ring: "bg-destructive/10 text-destructive", icon: XCircle, color: "text-destructive" },
};

function ActivitiesCard() {
  return (
    <Card className="border border-border p-5 shadow-card">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-base font-bold text-navy">Recent Activities</h2>
        <button className="text-muted-foreground hover:text-navy" aria-label="Filter activities">
          <Filter className="h-4 w-4" />
        </button>
      </div>
      <ul className="space-y-4">
        {activities.map((a, i) => {
          const tone = toneStyles[a.tone];
          const StatusIcon = tone.icon;
          return (
            <li key={i} className="flex gap-3">
              <div className="relative">
                <Avatar className="h-8 w-8 border border-border">
                  <AvatarFallback className="bg-secondary text-[10px] font-semibold text-navy">{a.initials}</AvatarFallback>
                </Avatar>
                <span className={cn("absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full ring-2 ring-card", tone.ring)}>
                  <StatusIcon className="h-3 w-3" />
                </span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm leading-snug text-foreground">
                  <span className="font-semibold text-navy">{a.who}</span>{" "}
                  <span className={tone.color}>{a.action}</span>{" "}
                  <span className="font-medium text-navy">{a.ref}</span>
                </p>
                {a.reason && (
                  <p className="mt-1 rounded-md border border-destructive/20 bg-destructive/5 px-2 py-1 text-xs text-destructive">
                    {a.reason}
                  </p>
                )}
                <p className="mt-0.5 text-xs text-muted-foreground">{a.time}</p>
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
