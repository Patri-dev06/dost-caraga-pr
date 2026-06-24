import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { FileText, ClipboardCheck, ShieldCheck, CheckCircle2, AlertTriangle, Inbox, FilePlus2, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StatCard } from "@/components/app/stat-card";
import { PRTable } from "@/components/app/pr-table";
import { apiGetPurchaseRequests } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";

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
  const now = useLiveNow();
  const { data: purchaseRequests = [], isLoading, error } = useQuery({
    queryKey: ["purchase-requests"],
    queryFn: apiGetPurchaseRequests,
  });
  const dashboardStats = {
    total: purchaseRequests.length,
    pendingValidation: purchaseRequests.filter((pr) => pr.status === "Pending Validation").length,
    forRecommendation: purchaseRequests.filter((pr) => pr.status === "For Recommendation").length,
    forApproval: purchaseRequests.filter((pr) => pr.status === "For Approval").length,
    approved: purchaseRequests.filter((pr) => pr.status === "Approved").length,
    returned: purchaseRequests.filter((pr) => pr.status === "Returned").length,
  };

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 px-3 py-4 sm:space-y-8 sm:px-6 sm:py-8 lg:px-8">
      {/* Hero */}
      <section className="overflow-hidden rounded-xl border border-border bg-gradient-to-br from-secondary via-background to-card p-4 sm:rounded-2xl sm:p-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="label-eyebrow mb-2">Welcome, M. Dela Cruz</p>
            <h1 className="text-2xl font-bold tracking-tight text-navy sm:text-4xl">
              DOST Caraga — Procurement System
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground sm:text-base">
              Procurement Management and Pre-Validation Platform
            </p>
          </div>
          <div className="flex flex-col items-start gap-1 sm:items-end">
            <p className="label-eyebrow">Today</p>
            <p className="text-sm font-semibold text-navy">{now ? formatDate(now) : "Loading date..."}</p>
            <p className="text-xs font-medium text-muted-foreground">{now ? formatTime(now) : "Loading time..."}</p>
            <p className="text-xs text-muted-foreground">Regional Office · Caraga (Region XIII)</p>
          </div>
        </div>
      </section>

      {/* Quick Actions */}
      <section className="grid grid-cols-1 gap-3 min-[430px]:grid-cols-2 lg:grid-cols-4">
        <Button asChild className="h-auto justify-start gap-3 whitespace-normal py-3 text-left"><Link to="/purchase-requests/new"><FilePlus2 className="h-4 w-4 shrink-0" /> Create Purchase Request</Link></Button>
        <Button asChild variant="outline" className="h-auto justify-start gap-3 py-3 border-border"><Link to="/validation"><ShieldCheck className="h-4 w-4" /> Validate Items</Link></Button>
        <Button asChild variant="outline" className="h-auto justify-start gap-3 py-3 border-border"><Link to="/approval-inbox"><Inbox className="h-4 w-4" /> View Approval Inbox</Link></Button>
        <Button asChild variant="outline" className="h-auto justify-start gap-3 py-3 border-border"><Link to="/references/ppmp"><BookOpen className="h-4 w-4" /> Manage References</Link></Button>
      </section>

      {/* Stats */}
      <section>
        <div className="mb-3 flex items-end justify-between">
          <h2 className="text-sm font-bold uppercase tracking-wider text-navy">Procurement Summary</h2>
          <p className="text-xs text-muted-foreground">FY {now?.getFullYear() ?? 2026} · As of today</p>
        </div>
        <div className="grid grid-cols-1 gap-3 min-[430px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <StatCard label="Total PRs" value={dashboardStats.total} icon={FileText} delta="+12 this month" accent />
          <StatCard label="Pending Validation" value={dashboardStats.pendingValidation} icon={ClipboardCheck} delta="+3 today" />
          <StatCard label="For Recommendation" value={dashboardStats.forRecommendation} icon={ShieldCheck} delta="2 due today" />
          <StatCard label="For Approval" value={dashboardStats.forApproval} icon={Inbox} delta="awaiting director" />
          <StatCard label="Approved" value={dashboardStats.approved} icon={CheckCircle2} delta="this FY" />
          <StatCard label="Returned" value={dashboardStats.returned} icon={AlertTriangle} delta="needs revision" />
        </div>
      </section>

      {/* Recent PRs */}
      <section>
        <div className="mb-3 flex items-end justify-between">
          <div>
            <h2 className="text-sm font-bold uppercase tracking-wider text-navy">Recent Purchase Requests</h2>
            <p className="text-xs text-muted-foreground">Latest activity across all offices.</p>
          </div>
          <Button asChild variant="ghost" size="sm" className="text-primary hover:text-primary"><Link to="/purchase-requests">View all →</Link></Button>
        </div>
        {error && <BackendNotice message={error instanceof Error ? error.message : "Unable to load purchase requests."} />}
        {isLoading ? <BackendNotice message="Fetching data, kindly wait." /> : <PRTable rows={purchaseRequests.slice(0, 6)} />}
      </section>

      <Card className="border border-border bg-card p-5">
        <p className="label-eyebrow mb-1">System Notice</p>
        <p className="text-sm text-foreground">
          The PPMP for FY 2027 submission window opens on <span className="font-semibold text-navy">June 1, 2026</span>. Please ensure all reference data is updated.
        </p>
      </Card>
    </div>
  );
}

function BackendNotice({ message }: { message: string }) {
  return <div className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">{message}</div>;
}

function useLiveNow() {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const timer = window.setInterval(() => setNow(new Date()), 1000);

    return () => window.clearInterval(timer);
  }, []);

  return now;
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function formatTime(date: Date) {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  }).format(date);
}
