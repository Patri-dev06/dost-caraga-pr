import { Link } from "@tanstack/react-router";
import { Eye } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "./status-badge";
import { fmtPHP, PurchaseRequest, prTotal } from "@/lib/mock-data";

export function PRTable({ rows }: { rows: PurchaseRequest[] }) {
  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="divide-y divide-border md:hidden">
        {rows.length === 0 && (
          <div className="p-6 text-center text-sm text-muted-foreground">No purchase requests found.</div>
        )}
        {rows.map((pr) => (
          <Link
            key={pr.id}
            to="/purchase-requests/$prId"
            params={{ prId: pr.id }}
            className="block p-4 transition-colors hover:bg-secondary/40"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-navy">{pr.prNo}</p>
                <p className="mt-1 truncate text-xs text-muted-foreground">{pr.office}</p>
              </div>
              <StatusBadge status={pr.status} />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
              <div>
                <p className="label-eyebrow">Fund</p>
                <p className="mt-1 truncate text-foreground">{pr.fundSource}</p>
              </div>
              <div className="text-right">
                <p className="label-eyebrow">Amount</p>
                <p className="mt-1 font-semibold tabular-nums text-navy">{fmtPHP(prTotal(pr))}</p>
              </div>
              <div className="col-span-2">
                <p className="label-eyebrow">Submitted</p>
                <p className="mt-1 text-muted-foreground">{pr.dateSubmitted}</p>
              </div>
            </div>
          </Link>
        ))}
      </div>
      <div className="hidden overflow-x-auto md:block">
      <Table>
        <TableHeader>
          <TableRow className="bg-secondary/40 hover:bg-secondary/40">
            <TableHead className="label-eyebrow">PR No.</TableHead>
            <TableHead className="label-eyebrow">Requesting Office</TableHead>
            <TableHead className="label-eyebrow">Fund Source</TableHead>
            <TableHead className="label-eyebrow text-right">Amount</TableHead>
            <TableHead className="label-eyebrow">Status</TableHead>
            <TableHead className="label-eyebrow">Date Submitted</TableHead>
            <TableHead className="label-eyebrow"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                No purchase requests found.
              </TableCell>
            </TableRow>
          )}
          {rows.map((pr) => (
            <TableRow key={pr.id} className="cursor-pointer">
              <TableCell className="font-semibold text-navy">
                <Link to="/purchase-requests/$prId" params={{ prId: pr.id }} className="hover:underline">
                  {pr.prNo}
                </Link>
              </TableCell>
              <TableCell>{pr.office}</TableCell>
              <TableCell className="text-muted-foreground">{pr.fundSource}</TableCell>
              <TableCell className="text-right font-medium tabular-nums">{fmtPHP(prTotal(pr))}</TableCell>
              <TableCell><StatusBadge status={pr.status} /></TableCell>
              <TableCell className="text-muted-foreground">{pr.dateSubmitted}</TableCell>
              <TableCell>
                {pr.status === "Approved" && (
                  <Link
                    to="/purchase-requests/new"
                    search={{ view: pr.id }}
                    className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-primary hover:bg-primary/10 transition-colors"
                  >
                    <Eye className="h-3.5 w-3.5" /> Preview
                  </Link>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      </div>
    </div>
  );
}
