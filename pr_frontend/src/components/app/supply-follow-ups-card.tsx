import { Link } from "@tanstack/react-router";
import { differenceInCalendarDays, format, parseISO } from "date-fns";
import { FileSignature, Phone, ScrollText, Truck } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";
import type { DashboardFollowUps } from "@/lib/api";
import { cn } from "@/lib/utils";

/** "Overdue 2 days" / "Due today" / "Due tomorrow" / "Due in 5 days", with how urgent it is. */
function dueText(date: string | null): { text: string; urgent: boolean } {
  if (!date) return { text: "No due date", urgent: false };
  const days = differenceInCalendarDays(parseISO(date), new Date());
  if (days < 0) return { text: `Overdue ${-days} day${days === -1 ? "" : "s"}`, urgent: true };
  if (days === 0) return { text: "Due today", urgent: true };
  if (days === 1) return { text: "Due tomorrow", urgent: true };
  return { text: `Due in ${days} days`, urgent: false };
}

function sinceText(date: string | null): string {
  if (!date) return "";
  const days = differenceInCalendarDays(new Date(), parseISO(date));
  return days <= 0 ? "Released today" : `Released ${days} day${days === 1 ? "" : "s"} ago (${format(parseISO(date), "MMM d")})`;
}

function Contact({ number }: { number: string | null }) {
  if (!number) return <span className="text-muted-foreground/70">No contact no. on file</span>;
  return (
    <a href={`tel:${number.replace(/[^\d+]/g, "")}`} className="inline-flex items-center gap-1 text-primary hover:underline">
      <Phone className="h-3 w-3" /> {number}
    </a>
  );
}

function Group({ icon: Icon, title, hint, total, shown, children }: { icon: LucideIcon; title: string; hint: string; total: number; shown: number; children: ReactNode }) {
  return (
    <section>
      <div className="mb-1.5 flex items-center gap-2">
        <Icon className="h-4 w-4 shrink-0 text-primary" />
        <h3 className="text-sm font-semibold text-navy">{title}</h3>
        <span className={cn("rounded-full px-1.5 text-xs font-semibold tabular-nums", total > 0 ? "bg-primary/10 text-primary" : "bg-secondary text-muted-foreground")}>{total}</span>
      </div>
      {total === 0 ? (
        <p className="pl-6 text-xs text-muted-foreground">{hint}</p>
      ) : (
        <>
          <ul className="divide-y divide-border rounded-lg border border-border">{children}</ul>
          {total > shown && <p className="mt-1 pl-1 text-xs text-muted-foreground">+{total - shown} more</p>}
        </>
      )}
    </section>
  );
}

function Row({ to, title, sub, right, urgent }: { to: ReactNode; title?: string; sub: ReactNode; right: string; urgent?: boolean }) {
  return (
    <li className="flex items-start justify-between gap-3 px-3 py-2 text-xs">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-navy">
          {to}
          {title && <span className="font-normal text-muted-foreground"> · {title}</span>}
        </p>
        <p className="mt-0.5 truncate text-muted-foreground">{sub}</p>
      </div>
      <span className={cn("shrink-0 whitespace-nowrap font-medium", urgent ? "text-destructive" : "text-muted-foreground")}>{right}</span>
    </li>
  );
}

/**
 * The Supply team's to-do list with suppliers, who are contacted by hand: RFQ replies about to
 * lapse, signed POs still with the supplier, and deliveries due per the monitoring sheet.
 */
export function SupplyFollowUpsCard({ followUps }: { followUps: DashboardFollowUps }) {
  const { rfqRepliesDue: replies, posWithSupplier: pos, deliveriesDue: deliveries } = followUps;

  return (
    <Card className="border border-border p-4 shadow-card sm:p-5">
      <h2 className="text-base font-bold text-navy">Supply follow-ups</h2>
      <p className="mb-4 text-xs text-muted-foreground">Suppliers to contact, soonest first.</p>

      <div className="space-y-4">
        <Group icon={ScrollText} title="RFQ replies due" hint="No RFQ reply is due in the next 2 days." total={replies.total} shown={replies.items.length}>
          {replies.items.map((r) => {
            const due = dueText(r.dueAt);
            return (
              <Row
                key={`${r.rfqId}-${r.supplierName}`}
                to={<Link to="/rfq/$rfqId" params={{ rfqId: r.rfqId }} className="hover:underline">{r.supplierName ?? "Supplier"}</Link>}
                title={r.rfqNo ?? undefined}
                sub={<Contact number={r.contactNo} />}
                right={due.text}
                urgent={due.urgent}
              />
            );
          })}
        </Group>

        <Group icon={FileSignature} title="Signed POs with the supplier" hint="No signed PO is waiting on a supplier's answer." total={pos.total} shown={pos.items.length}>
          {pos.items.map((p) => (
            <Row
              key={p.poId}
              to={<Link to="/po/$poId" params={{ poId: p.poId }} className="hover:underline">{p.poNo ?? "PO"}</Link>}
              title={p.supplierName ?? undefined}
              sub={<Contact number={p.contactNo} />}
              right={sinceText(p.forwardedAt)}
            />
          ))}
        </Group>

        <Group icon={Truck} title="Deliveries due" hint="No delivery is due in the next 7 days. Due dates come from the monitoring sheet." total={deliveries.total} shown={deliveries.items.length}>
          {deliveries.items.map((d) => {
            const due = dueText(d.dueDate);
            return (
              <Row
                key={d.prId}
                to={<Link to="/purchase-requests/$prId" params={{ prId: d.prId }} className="hover:underline">{d.prNo ?? "PR"}</Link>}
                title={d.poNo ?? undefined}
                sub={d.supplierName ?? "No supplier on the PO"}
                right={due.text}
                urgent={due.urgent}
              />
            );
          })}
        </Group>
      </div>
    </Card>
  );
}
