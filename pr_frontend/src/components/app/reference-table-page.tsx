import { ReactNode } from "react";
import { Filter } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader } from "@/components/app/page-header";

export function ReferenceTablePage({
  eyebrow, title, subtitle, actions, children,
}: {
  eyebrow: string; title: string; subtitle: string; actions?: ReactNode; children: ReactNode;
}) {
  return (
    <div className="mx-auto w-full max-w-7xl space-y-5 px-3 py-4 sm:space-y-6 sm:px-6 sm:py-8 lg:px-8">
      <PageHeader
        eyebrow={eyebrow}
        title={title}
        subtitle={subtitle}
        actions={actions}
      />
      <Card className="flex flex-col gap-3 border border-border bg-card p-3 sm:flex-row sm:items-center sm:p-4">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search by code, item, or category…" className="h-9 min-w-0 border-border bg-background sm:max-w-sm" />
        </div>
        <Select defaultValue="2026">
          <SelectTrigger className="h-9 w-full border-border sm:w-[120px]"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="2026">FY 2026</SelectItem><SelectItem value="2025">FY 2025</SelectItem></SelectContent>
        </Select>
      </Card>
      {children}
    </div>
  );
}
