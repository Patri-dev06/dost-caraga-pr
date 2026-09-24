import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, Ban, CheckCircle2, ClipboardCheck, Loader2, Star, ThumbsDown, ThumbsUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/app/page-header";
import { StatusBadge } from "@/components/app/status-badge";
import {
  apiGetAoc,
  apiSubmitAocForBacReview,
  apiBacReviewAoc,
  apiTwgRespondAoc,
  apiBacSatisfactionAoc,
  apiNoteLowestBidder,
  apiRateVenues,
  apiGenerateFromRfq,
  type AbstractOfCanvas,
} from "@/lib/api";
import { fmtAmount } from "@/lib/lib-store";
import { useCanAccess, useCurrentUser } from "@/lib/current-user";
import { toast } from "sonner";

export const Route = createFileRoute("/aoc/$aocId")({
  head: () => ({ meta: [{ title: "Abstract of Canvas — DOST Caraga" }] }),
  component: AocDetailPage,
});

function AocDetailPage() {
  const { aocId } = Route.useParams();
  const navigate = useNavigate();
  const { user } = useCurrentUser();
  const canAccess = useCanAccess();
  const isSuperadmin = user?.tier === "superadmin";
  // Only the designated BAC Chairman / Vice-Chairman review an AOC (the server enforces it too).
  const isBacReviewer = Boolean(user?.isBacChair || user?.isBacViceChair || isSuperadmin);
  const isSupplyOfficer = Boolean(user?.isSupplyOfficer || isSuperadmin);
  const isTwgLead = Boolean(user?.isTwgLead || isSuperadmin);
  const isStaff = canAccess("rfq") || canAccess("approvals");

  const [aoc, setAoc] = useState<AbstractOfCanvas | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [remarks, setRemarks] = useState("");
  const [twgResponse, setTwgResponse] = useState("");
  const [notSatisfiedReason, setNotSatisfiedReason] = useState("");
  const [scores, setScores] = useState<Record<string, Record<string, number>>>({});

  async function reload() {
    try {
      setAoc(await apiGetAoc(aocId));
    } catch {
      toast.error("Could not load Abstract of Canvas.");
      navigate({ to: "/" });
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

  const venue = aoc.venueRating;
  const isEquipment = aoc.procurementCategory === "Equipment";
  const venues = venue ? aoc.suppliers.filter((s) => venue.venueIds.includes(s.id)) : [];

  return (
    <div className="mx-auto w-full max-w-5xl space-y-5 px-3 py-4 sm:space-y-6 sm:px-6 sm:py-8 lg:px-8">
      {isStaff && (
        <Button variant="ghost" size="sm" asChild className="gap-1.5 text-muted-foreground">
          <Link to="/rfq/$rfqId" params={{ rfqId: aoc.rfqId }}>
            <ArrowLeft className="h-4 w-4" /> Back to RFQ
          </Link>
        </Button>
      )}

      <PageHeader
        eyebrow={`RFQ ${aoc.rfqNo} · PR ${aoc.prNo}`}
        title="Abstract of Canvas"
        subtitle={`${aoc.procurementCategory === "Venue" ? "List of Venue" : aoc.procurementCategory} procurement${aoc.preparedByName ? ` · Prepared by ${aoc.preparedByName}${aoc.preparedByPosition ? `, ${aoc.preparedByPosition}` : ""}` : ""}`}
        actions={<StatusBadge status={aoc.status} />}
      />

      {aoc.status === "Cancelled" && (
        <Card className="flex items-start gap-3 border border-destructive/30 bg-destructive/5 p-4 text-sm">
          <Ban className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
          <p className="font-semibold text-destructive">Cancelled — the BAC was not satisfied, so the Purchase Request was cancelled and the end-user asked to Re-PR.</p>
        </Card>
      )}

      {aoc.twgEvaluationNotes && (
        <Card className="border border-border bg-card p-4">
          <p className="label-eyebrow mb-1">TWG Specification Evaluation</p>
          <p className="whitespace-pre-line text-sm text-foreground">{aoc.twgEvaluationNotes}</p>
        </Card>
      )}

      <Card className="overflow-hidden border border-border bg-card">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-secondary/40 hover:bg-secondary/40">
                <TableHead className="label-eyebrow">Supplier</TableHead>
                <TableHead className="label-eyebrow">Status</TableHead>
                {isEquipment && <TableHead className="label-eyebrow">TWG check</TableHead>}
                <TableHead className="label-eyebrow text-right">Total Quoted</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {aoc.suppliers.map((s) => (
                <TableRow key={s.id} className={s.isWinner ? "bg-success/5" : undefined}>
                  <TableCell className="font-medium text-navy">
                    {s.supplierName}
                    {s.isWinner && (
                      <span className="ml-2 rounded-full bg-success/10 px-2 py-0.5 text-[10px] font-semibold uppercase text-success">
                        {aoc.procurementCategory === "Venue" ? "Top-rated / Winner" : "Lowest / Winner"}
                      </span>
                    )}
                  </TableCell>
                  <TableCell><StatusBadge status={s.status} /></TableCell>
                  {isEquipment && (
                    <TableCell>
                      {s.twgResult ? (
                        <span className="text-xs">
                          <StatusBadge status={s.twgResult === "Passed" ? "Passed" : "Failed"} />
                          {s.quoteItems.filter((qi) => qi.twgComplies === false && qi.twgRemarks).map((qi) => (
                            <span key={qi.rfqItemId} className="mt-1 block text-muted-foreground">{qi.twgRemarks}</span>
                          ))}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  )}
                  <TableCell className="text-right font-medium tabular-nums">{s.status === "Replied" ? `₱${fmtAmount(s.totalQuoted)}` : "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>

      {/* Venue: Individual rating of list of venue -> Summary of rating */}
      {venue && (
        <Card className="space-y-4 border border-border bg-card p-4">
          <div>
            <h2 className="text-sm font-semibold text-navy">Venue Rating</h2>
            <p className="text-xs text-muted-foreground">Each rater scores every venue 1 (poor) to 5 (excellent) on each criterion. The highest average wins; the lower quote breaks a tie.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {venue.raters.map((r) => (
              <span key={r.id} className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs ${r.rated ? "border-success/30 bg-success/10 text-success" : "border-border text-muted-foreground"}`}>
                {r.rated && <CheckCircle2 className="h-3 w-3" />} {r.name} · {r.role}
              </span>
            ))}
          </div>

          {venue.myTurn && (
            <div className="space-y-3 rounded-lg border border-primary/30 bg-primary/5 p-3">
              <p className="text-sm font-semibold text-navy">Your rating</p>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-muted-foreground">
                      <th className="py-1 pr-3 font-semibold">Venue</th>
                      {venue.criteria.map((c) => <th key={c} className="px-2 py-1 font-semibold">{c}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {venues.map((v) => (
                      <tr key={v.id} className="border-t border-border">
                        <td className="py-2 pr-3 font-medium text-navy">{v.supplierName}<span className="block text-muted-foreground">₱{fmtAmount(v.totalQuoted)}</span></td>
                        {venue.criteria.map((c) => (
                          <td key={c} className="px-2 py-2">
                            <div className="flex gap-0.5" role="radiogroup" aria-label={`${v.supplierName}: ${c}`}>
                              {[1, 2, 3, 4, 5].map((n) => (
                                <button
                                  key={n}
                                  type="button"
                                  role="radio"
                                  aria-checked={scores[v.id]?.[c] === n}
                                  aria-label={`${n}`}
                                  onClick={() => setScores((cur) => ({ ...cur, [v.id]: { ...(cur[v.id] ?? {}), [c]: n } }))}
                                  className={`flex h-6 w-6 items-center justify-center rounded border text-[11px] font-semibold ${scores[v.id]?.[c] === n ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-foreground hover:bg-secondary"}`}
                                >
                                  {n}
                                </button>
                              ))}
                            </div>
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Button
                size="sm"
                className="gap-1.5"
                disabled={busy}
                onClick={() => {
                  const ratings = venues.flatMap((v) => venue.criteria.map((c) => ({ rfq_supplier_id: v.id, criterion: c, score: scores[v.id]?.[c] ?? 0 })));
                  if (ratings.some((r) => !r.score)) {
                    toast.error("Score every venue on every criterion.");
                    return;
                  }
                  run(() => apiRateVenues(aoc.id, ratings), "Your ratings were recorded.");
                }}
              >
                <Star className="h-4 w-4" /> Submit my rating
              </Button>
            </div>
          )}

          {venue.summary ? (
            <div className="overflow-x-auto">
              <p className="label-eyebrow mb-2">Summary of rating</p>
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-muted-foreground">
                    <th className="py-1 pr-2 font-semibold">Rank</th>
                    <th className="py-1 pr-3 font-semibold">Venue</th>
                    {venue.criteria.map((c) => <th key={c} className="px-2 py-1 text-right font-semibold">{c}</th>)}
                    <th className="px-2 py-1 text-right font-semibold">Average</th>
                    <th className="px-2 py-1 text-right font-semibold">Quote</th>
                  </tr>
                </thead>
                <tbody>
                  {venue.summary.map((v) => (
                    <tr key={v.rfqSupplierId} className={`border-t border-border ${v.rank === 1 ? "bg-success/5" : ""}`}>
                      <td className="py-2 pr-2 font-semibold text-navy">{v.rank}</td>
                      <td className="py-2 pr-3 font-medium text-navy">{v.supplierName}</td>
                      {venue.criteria.map((c) => <td key={c} className="px-2 py-2 text-right tabular-nums">{v.criteria[c]?.toFixed(2)}</td>)}
                      <td className="px-2 py-2 text-right font-semibold tabular-nums text-navy">{v.overall.toFixed(2)}</td>
                      <td className="px-2 py-2 text-right tabular-nums">₱{fmtAmount(v.totalQuoted)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            !venue.myTurn && <p className="text-xs text-muted-foreground">The summary of rating appears once every rater has scored the venues.</p>
          )}
        </Card>
      )}

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
      {aoc.status === "Draft" && isStaff && (
        <Button className="gap-1.5" disabled={busy} onClick={() => run(() => apiSubmitAocForBacReview(aoc.id), "Submitted for BAC review.")}>
          Submit for BAC Review
        </Button>
      )}

      {aoc.status === "Pending BAC Review" && !isBacReviewer && (
        <WaitingCard title="Waiting for BAC review" body="Only the designated BAC Chairman or Vice-Chairman can approve or return this Abstract of Canvas. They have been notified." />
      )}

      {aoc.status === "Pending BAC Review" && isBacReviewer && (
        <Card className="space-y-3 border border-border bg-card p-4">
          <h2 className="text-sm font-semibold text-navy">BAC Review (digital sign)</h2>
          <Textarea rows={3} placeholder="Committee remarks (required if returning)…" value={remarks} onChange={(e) => setRemarks(e.target.value)} className="border-border" />
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              className="gap-1.5 border-destructive/40 text-destructive hover:bg-destructive/10"
              disabled={busy}
              onClick={() => {
                if (!remarks.trim()) {
                  toast.error("Remarks are required to return an AOC.");
                  return;
                }
                run(() => apiBacReviewAoc(aoc.id, false, remarks), "Returned. The TWG, end-user and Supply were notified.");
              }}
            >
              <ThumbsDown className="h-4 w-4" /> Fail — return with remarks
            </Button>
            <Button className="gap-1.5" disabled={busy} onClick={() => run(() => apiBacReviewAoc(aoc.id, true), "Approved and returned to Supply to note the lowest bidder.")}>
              <ThumbsUp className="h-4 w-4" /> Pass
            </Button>
          </div>
        </Card>
      )}

      {aoc.status === "BAC Returned" &&
        (isTwgLead ? (
          <Card className="space-y-3 border border-border bg-card p-4">
            <h2 className="text-sm font-semibold text-navy">TWG: address the BAC remarks</h2>
            <Textarea rows={3} placeholder="How the remarks were addressed…" value={twgResponse} onChange={(e) => setTwgResponse(e.target.value)} className="border-border" />
            <Button className="gap-1.5" disabled={busy || !twgResponse.trim()} onClick={() => run(() => apiTwgRespondAoc(aoc.id, twgResponse), "Response sent. The BAC now decides whether it is satisfied.")}>
              Send response to the BAC
            </Button>
          </Card>
        ) : (
          <WaitingCard title="Waiting for the TWG" body="The BAC returned this Abstract of Canvas with remarks. The designated TWG Lead must address them." />
        ))}

      {aoc.status === "Pending BAC Satisfaction" &&
        (isBacReviewer ? (
          <Card className="space-y-3 border border-border bg-card p-4">
            <h2 className="text-sm font-semibold text-navy">Is the BAC satisfied with the TWG response?</h2>
            <p className="text-xs text-muted-foreground">Satisfied sends it back for a new signed BAC review. Not satisfied cancels the Purchase Request and asks the end-user to Re-PR.</p>
            <Textarea rows={2} placeholder="Reason (required if not satisfied)…" value={notSatisfiedReason} onChange={(e) => setNotSatisfiedReason(e.target.value)} className="border-border" />
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                className="gap-1.5 border-destructive/40 text-destructive hover:bg-destructive/10"
                disabled={busy}
                onClick={() => {
                  if (!notSatisfiedReason.trim()) {
                    toast.error("Give the reason the BAC is not satisfied.");
                    return;
                  }
                  if (!window.confirm("Not satisfied cancels the Purchase Request, its RFQ and this AOC. Continue?")) return;
                  run(() => apiBacSatisfactionAoc(aoc.id, false, notSatisfiedReason.trim()), "Purchase Request cancelled; the end-user was asked to Re-PR.");
                }}
              >
                <Ban className="h-4 w-4" /> Not satisfied — cancel PR
              </Button>
              <Button className="gap-1.5" disabled={busy} onClick={() => run(() => apiBacSatisfactionAoc(aoc.id, true), "Back for BAC review.")}>
                <ThumbsUp className="h-4 w-4" /> Satisfied — review again
              </Button>
            </div>
          </Card>
        ) : (
          <WaitingCard title="Waiting for the BAC" body="The TWG responded. The BAC Chairman or Vice-Chairman decides whether the BAC is satisfied." />
        ))}

      {aoc.status === "For Supply Noting" &&
        (isSupplyOfficer ? (
          <Card className="space-y-3 border border-border bg-card p-4">
            <h2 className="text-sm font-semibold text-navy">Note the lowest bidder</h2>
            <p className="text-sm text-foreground">
              The BAC approved this Abstract of Canvas. Confirm <span className="font-semibold">{aoc.winningSupplierName}</span> as the {aoc.procurementCategory === "Venue" ? "top-rated venue" : "lowest bidder"} to allow the Purchase Order.
            </p>
            <Button className="gap-1.5" disabled={busy} onClick={() => run(() => apiNoteLowestBidder(aoc.id), "Lowest bidder noted. The Purchase Order can now be created.")}>
              <ClipboardCheck className="h-4 w-4" /> Note &amp; sign
            </Button>
          </Card>
        ) : (
          <WaitingCard title="Returned to Supply" body="The BAC approved it. The designated Supply Officer must note the lowest bidder before the Purchase Order is created." />
        ))}

      {aoc.status === "Lowest Bidder Noted" && (
        <Card className="flex flex-wrap items-center justify-between gap-3 border border-success/30 bg-success/5 p-4">
          <p className="text-sm text-foreground">
            <CheckCircle2 className="mr-1 inline h-4 w-4 text-success" />
            {aoc.supplyNotedName} noted <span className="font-semibold">{aoc.winningSupplierName}</span> as the winning bidder.
          </p>
          {!aoc.hasPurchaseOrder && canAccess("po") && (
            <Button
              className="gap-1.5"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  const po = await apiGenerateFromRfq(aoc.rfqId);
                  toast.success("Purchase Order created.");
                  navigate({ to: "/po/$poId", params: { poId: po.id } });
                } catch (error) {
                  toast.error(error instanceof Error ? error.message : "Unable to create the Purchase Order.");
                } finally {
                  setBusy(false);
                }
              }}
            >
              Create Purchase Order
            </Button>
          )}
        </Card>
      )}
    </div>
  );
}

function WaitingCard({ title, body }: { title: string; body: string }) {
  return (
    <Card className="border border-border bg-card p-4">
      <h2 className="text-sm font-semibold text-navy">{title}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{body}</p>
    </Card>
  );
}
