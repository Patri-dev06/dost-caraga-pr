import { createFileRoute } from "@tanstack/react-router";
import { BarChart3, PieChart, LineChart, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/app/page-header";

export const Route = createFileRoute("/reports")({
  head: () => ({
    meta: [
      { title: "Reports — DOST Caraga" },
      { name: "description", content: "Generate procurement reports by status, office, fund source, and period." },
    ],
  }),
  component: Reports,
});

const reports = [
  { title: "PRs by Status", desc: "Distribution of Purchase Requests across all status stages.", icon: PieChart },
  { title: "PRs by Office", desc: "Volume of requests per requesting office.", icon: BarChart3 },
  { title: "PRs by Fund Source", desc: "Allocation across GAA, Trust, and Special funds.", icon: Layers },
  { title: "Monthly Procurement Trend", desc: "Total approved amount per month for the fiscal year.", icon: LineChart },
  { title: "Validation Outcomes", desc: "Pass/fail/warning rates for pre-validation.", icon: PieChart },
  { title: "Approval Cycle Time", desc: "Average days from submission to approval.", icon: BarChart3 },
];

function Reports() {
  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
      <PageHeader eyebrow="Administration" title="Reports" subtitle="Generate procurement reports for monitoring and audit." />
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {reports.map((r) => (
          <Card key={r.title} className="border border-border bg-card p-5">
            <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-secondary text-primary">
              <r.icon className="h-5 w-5" strokeWidth={1.75} />
            </div>
            <h3 className="text-base font-bold text-navy">{r.title}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{r.desc}</p>
            <div className="mt-4 flex h-24 items-center justify-center rounded-lg border border-dashed border-border bg-secondary/30">
              <span className="label-eyebrow">Chart preview</span>
            </div>
            <Button variant="outline" size="sm" className="mt-4 w-full border-border">Generate</Button>
          </Card>
        ))}
      </div>
    </div>
  );
}
