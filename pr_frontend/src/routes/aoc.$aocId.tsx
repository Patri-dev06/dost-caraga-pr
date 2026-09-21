import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, Loader2, ThumbsDown, ThumbsUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/app/page-header";
import { StatusBadge } from "@/components/app/status-badge";
import { apiGetAoc, apiSubmitAocForBacReview, apiBacReviewAoc, apiTwgRespondAoc, apiCancelAoc, apiGenerateFromRfq, type AbstractOfCanvas } from "@/lib/api";
import { fmtAmount } from "@/lib/lib-store";
import { useCurrentUser } from "@/lib/current-user";
import { toast } from "sonner";

export const Route = createFileRoute("/aoc/$aocId")({
  head: () => ({ meta: [{ title: "Abstract of Canvas — DOST Caraga" }] }),
  component: AocDetailPage,
});

function AocDetailPage() {
  const { aocId } = Route.useParams();
  const navigate = useNavigate();
  const { user } = useCurrentUser();
  // Only the designated BAC Chairman / Vice-Chairman review or cancel an AOC (the server enforces it too).
  const isBacReviewer = Boolean(user?.isBacChair || user?.isBacViceChair || user?.tier === "superadmin");

  const [aoc, setAoc] = useState<AbstractOfCanvas | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [remarks, setRemarks] = useState("");
  const [twgResponse, setTwgResponse] = useState("");

  async function reload() {
    try {
      setAoc(await apiGetAoc(aocId));
    } catch {
      toast.error("Could not load Abstract of Canvas.");
      navigate({ to: "/rfq" });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aocId]);

  async function run(action: () => Promise<unknown>, successMessage: string) {
    setBusy(true);
    try {
      await action();
      toast.success(successMessage);
      await reload();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Action failed.");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <span className="ml-2 text-sm text-muted-foreground">Loading…</span>
      </div>
    );
  }
  if (!aoc) return null;

  return (
    <div className="mx-auto w-full max-w-5xl space-y-5 px-3 py-4 sm:space-y-6 sm:px-6 sm:py-8 lg:px-8">
      <Button variant="ghost" size="sm" asChild className="gap-1.5 text-muted-foreground">
        <Link to="/rfq/$rfqId" params={{ rfqId: aoc.rfqId }}>
          <ArrowLeft className="h-4 w-4" /> Back to RFQ
        </Link>
      </Button>

      <PageHeader
        eyebrow={`RFQ ${aoc.rfqNo} · PR ${aoc.prNo}`}
        title="Abstract of Canvas"
        subtitle={`${aoc.procurementCategory} procurement${aoc.preparedByName ? ` · Prepared by ${aoc.preparedByName}${aoc.preparedByPosition ? `, ${aoc.preparedByPosition}` : ""}` : ""}`}
        actions={<StatusBadge status={aoc.status} />}
      />

      {aoc.twgEvaluationNotes && (
        <Card className="border border-border bg-card p-4">
          <p className="label-eyebrow mb-1">TWG Evaluation Notes</p>
          <p className="text-sm text-foreground">{aoc.twgEvaluationNotes}</p>
        </Card>
      )}

      <Card className="overflow-hidden border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow className="bg-secondary/40 hover:bg-secondary/40">
              <TableHead className="label-eyebrow">Supplier</TableHead>
              <TableHead className="label-eyebrow">Status</TableHead>
              <TableHead className="label-eyebrow text-right">Total Quoted</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {aoc.suppliers.map((s) => (
              <TableRow key={s.id} className={s.isWinner ? "bg-success/5" : undefined}>
                <TableCell className="font-medium text-navy">
                  {s.supplierName}
                  {s.isWinner && <span className="ml-2 rounded-full bg-success/10 px-2 py-0.5 text-[10px] font-semibold uppercase text-success">Lowest / Winner</span>}
                </TableCell>
                <TableCell><StatusBadge status={s.status} /></TableCell>
                <TableCell className="text-right font-medium tabular-nums">₱{fmtAmount(s.totalQuoted)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      {aoc.bacRemarks && (
        <Card className="border border-warning/30 bg-warning/5 p-4">
          <p className="label-eyebrow mb-1">BAC Remarks</p>
          <p className="text-sm text-foreground">{aoc.bacRemarks}</p>
        </Card>
      )}
      {aoc.twgResponse && (
        <Card className="border border-border bg-card p-4">
          <p className="label-eyebrow mb-1">TWG Response</p>
          <p className="text-sm text-foreground">{aoc.twgResponse}</p>
        </Card>
      )}

      {/* Actions per status */}
      {aoc.status === "Draft" && (
        <Button className="gap-1.5" disabled={busy} onClick={() => run(() => apiSubmitAocForBacReview(aoc.id), "Submitted for BAC review.")}>
          Submit for BAC Review
        </Button>
      )}

      {aoc.status === "Pending BAC Review" && !isBacReviewer && (
        <Card className="border border-border bg-card p-4">
          <h2 className="text-sm font-semibold text-navy">Waiting for BAC review</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Only the designated BAC Chairman or Vice-Chairman can approve or return this Abstract of Canvas. They have been notified.
          </p>
        </Card>
      )}

      {aoc.status === "Pending BAC Review" && isBacReviewer && (
        <Card className="space-y-3 border border-border bg-card p-4">
          <h2 className="text-sm font-semibold text-navy">BAC Review</h2>
          <Textarea
            rows={3}
            placeholder="Remarks (required if returning)…"
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
            className="border-border"
          />
          <div className="flex gap-2">
            <Button variant="outline" className="gap-1.5 border-destructive/40 text-destructive hover:bg-destructive/10" disabled={busy}
              onClick={() => {
                if (!remarks.trim()) { toast.error("Remarks are required to return an AOC."); return; }
                run(() => apiBacReviewAoc(aoc.id, false, remarks), "Abstract of Canvas returned to Supply/TWG.");
              }}>
              <ThumbsDown className="h-4 w-4" /> Return with Remarks
            </Button>
            <Button className="gap-1.5" disabled={busy} onClick={() => run(() => apiBacReviewAoc(aoc.id, true), "Abstract of Canvas approved.")}>
              <ThumbsUp className="h-4 w-4" /> Approve
            </Button>
          </div>
        </Card>
      )}

      {aoc.status === "BAC Returned" && (
        <Card className="space-y-3 border border-border bg-card p-4">
          <h2 className="text-sm font-semibold text-navy">TWG Response</h2>
          <Textarea rows={3} placeholder="Address BAC's remarks…" value={twgResponse} onChange={(e) => setTwgResponse(e.target.value)} className="border-border" />
          <div className="flex gap-2">
            {isBacReviewer && (
              <Button variant="outline" className="gap-1.5 border-destructive/40 text-destructive hover:bg-destructive/10" disabled={busy}
                onClick={() => {
                  const reason = window.prompt("Reason for cancelling this AOC and its RFQ:");
                  if (!reason) return;
                  run(() => apiCancelAoc(aoc.id, reason), "Abstract of Canvas and RFQ cancelled.");
                }}>
                Cancel & Notify Requester
              </Button>
            )}
            <Button className="gap-1.5" disabled={busy || !twgResponse.trim()} onClick={() => run(() => apiTwgRespondAoc(aoc.id, twgResponse), "Response sent back to BAC.")}>
              Submit Response to BAC
            </Button>
          </div>
        </Card>
      )}

      {aoc.status === "Approved" && (
        <Button
          className="gap-1.5"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              const po = await apiGenerateFromRfq(aoc.rfqId);
              toast.success("Purchase Order generated.");
              navigate({ to: "/po/$poId", params: { poId: po.id } });
            } catch (error) {
              toast.error(error instanceof Error ? error.message : "Unable to generate Purchase Order.");
            } finally {
              setBusy(false);
            }
          }}
        >
          Generate Purchase Order
        </Button>
      )}
    </div>
  );
}
