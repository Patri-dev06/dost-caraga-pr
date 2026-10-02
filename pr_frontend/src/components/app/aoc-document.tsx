import { Fragment } from "react";
import type { AbstractOfCanvas, AocSignatory } from "@/lib/api";
import { formatLongDate } from "@/lib/date-format";
import { fmtAmount } from "@/lib/lib-store";
import { splitRfqDescription } from "@/lib/rfq-format";
import { cn } from "@/lib/utils";

const SERIF = '"Cambria", "Times New Roman", Times, serif';
const cell = "border border-black px-1.5 py-0.5 align-top";
const money = (n: number | null | undefined) => (n ? fmtAmount(Number(n)) : "");

/**
 * The Abstract of Canvas as a printable, wet-signed form (landscape): the RFQ particulars, every
 * item's ABC against each supplier's quoted unit and total price, the lowest calculated and
 * responsive (or top-rated) quotation, the BAC's recommendation, and signature lines for the BAC
 * Chairman, Vice-Chairman and members, the TWG Lead (equipment), the preparer, the Supply Officer
 * who notes the lowest bidder, and the Regional Director.
 */
export function AocDocument({ aoc, className }: { aoc: AbstractOfCanvas; className?: string }) {
  const doc = aoc.document;
  // Only suppliers that actually quoted are compared (a timed-out or replaced one quoted nothing).
  const suppliers = aoc.suppliers.filter((s) => s.quoteItems.length > 0);
  const winner = suppliers.find((s) => s.isWinner);
  const isVenue = aoc.procurementCategory === "Venue";
  const abcTotal = aoc.items.reduce((sum, it) => sum + Number(it.totalAbc || 0), 0);
  const members = doc?.bacMembers.length ? doc.bacMembers : [null, null, null];

  return (
    <div className={cn("aoc-document bg-white text-[10px] leading-snug text-black", className)} style={{ fontFamily: SERIF }}>
      <style>{`@media print { @page { size: A4 landscape; margin: 10mm; @bottom-center { content: "Page " counter(page) " of " counter(pages); font: 9px ${SERIF}; } } }`}</style>

      {/* Letterhead */}
      <div className="text-center text-[11px]">
        <p>Republic of the Philippines</p>
        <p className="font-bold">DEPARTMENT OF SCIENCE AND TECHNOLOGY</p>
        <p>Caraga Regional Office No. 13</p>
        <p>CSU Campus, Ampayon, Butuan City</p>
      </div>
      <p className="mt-3 text-center text-[12px] font-bold">ABSTRACT OF CANVASS</p>
      {doc?.modeOfProcurement && <p className="text-center italic">{doc.modeOfProcurement}</p>}

      {/* Particulars */}
      <div className="mt-3 grid grid-cols-2 gap-x-8 gap-y-0.5">
        <Particular label="Purchase Request No." value={aoc.prNo} bold />
        <Particular label="Quotation No." value={doc?.quotationNo} bold />
        <Particular label="RFQ No." value={aoc.rfqNo} />
        <Particular label="RFQ Date" value={doc?.rfqDate} />
        <Particular label="Opening of Quotations" value={formatLongDate(doc?.openingDate)} />
        <Particular label="Place of Delivery" value={doc?.placeOfDelivery} />
        <Particular label="Approved Budget for the Contract" value={doc?.estimatedBudget ? `₱ ${fmtAmount(doc.estimatedBudget)}` : ""} />
        <Particular label="Fund Source" value={doc?.fundSource} />
        <div className="col-span-2">
          <Particular label="Purpose" value={doc?.purpose} />
        </div>
      </div>

      {/* Quotations side by side */}
      <table className="mt-3 w-full border-collapse border border-black">
        <thead className="text-center font-bold">
          <tr>
            <th rowSpan={2} className={cn(cell, "w-8 align-middle")}>Item No.</th>
            <th rowSpan={2} className={cn(cell, "w-10 align-middle")}>QTY</th>
            <th rowSpan={2} className={cn(cell, "w-12 align-middle")}>UNIT</th>
            <th rowSpan={2} className={cn(cell, "align-middle")}>ITEM DESCRIPTION</th>
            <th colSpan={2} className={cn(cell, "align-middle")}>APPROVED BUDGET (ABC)</th>
            {suppliers.map((s) => (
              <th key={s.id} colSpan={2} className={cn(cell, "align-middle", s.isWinner && "bg-gray-100")}>
                {s.supplierName}
              </th>
            ))}
          </tr>
          <tr>
            <th className={cell}>Unit</th>
            <th className={cell}>Total</th>
            {suppliers.map((s) => (
              <Fragment key={s.id}>
                <th className={cn(cell, s.isWinner && "bg-gray-100")}>Unit Price</th>
                <th className={cn(cell, s.isWinner && "bg-gray-100")}>Total Price</th>
              </Fragment>
            ))}
          </tr>
        </thead>
        <tbody>
          {aoc.items.map((item) => {
            const { name, specs } = splitRfqDescription(item.description);
            return (
              <tr key={item.id}>
                <td className={cn(cell, "text-center")}>{item.itemNo}</td>
                <td className={cn(cell, "text-center")}>{item.qty}</td>
                <td className={cn(cell, "text-center")}>{item.unit}</td>
                <td className={cell}>
                  <span className="font-bold">{name}</span>
                  {specs.length > 0 && <span className="block text-[9px]">{specs.join("; ")}</span>}
                </td>
                <td className={cn(cell, "text-right tabular-nums")}>{money(item.unitAbc)}</td>
                <td className={cn(cell, "text-right tabular-nums")}>{money(item.totalAbc)}</td>
                {suppliers.map((s) => {
                  const q = s.quoteItems.find((qi) => qi.rfqItemId === item.id);
                  return (
                    <Fragment key={s.id}>
                      <td className={cn(cell, "text-right tabular-nums", s.isWinner && "bg-gray-50")}>{money(q?.unitPrice)}</td>
                      <td className={cn(cell, "text-right tabular-nums", s.isWinner && "bg-gray-50")}>
                        {money(q?.totalPrice)}
                        {q?.twgComplies === false && <span className="block text-[8px] italic">Did not comply (TWG)</span>}
                      </td>
                    </Fragment>
                  );
                })}
              </tr>
            );
          })}
          <tr className="font-bold">
            <td colSpan={4} className={cn(cell, "text-right")}>TOTAL</td>
            <td className={cell} />
            <td className={cn(cell, "text-right tabular-nums")}>{money(abcTotal)}</td>
            {suppliers.map((s) => (
              <Fragment key={s.id}>
                <td className={cn(cell, s.isWinner && "bg-gray-100")} />
                <td className={cn(cell, "text-right tabular-nums", s.isWinner && "bg-gray-100")}>{money(s.totalQuoted)}</td>
              </Fragment>
            ))}
          </tr>
          <tr>
            <td colSpan={6} className={cn(cell, "text-right font-bold")}>REMARKS</td>
            {suppliers.map((s) => (
              <td key={s.id} colSpan={2} className={cn(cell, "text-center italic", s.isWinner && "bg-gray-100 font-bold not-italic")}>
                {s.isWinner
                  ? isVenue ? "Highest-rated venue" : "Lowest Calculated and Responsive Quotation"
                  : s.twgResult === "Failed" ? "Failed the TWG evaluation" : ""}
              </td>
            ))}
          </tr>
        </tbody>
      </table>

      {/* Venue AOCs: the summary of the raters' scores */}
      {isVenue && aoc.venueRating?.summary && (
        <table className="mt-2 border-collapse border border-black">
          <thead className="text-center font-bold">
            <tr>
              <th className={cell}>Summary of Venue Rating (1–5)</th>
              {aoc.venueRating.summary.map((v) => <th key={v.rfqSupplierId} className={cell}>{v.supplierName}</th>)}
            </tr>
          </thead>
          <tbody>
            {aoc.venueRating.criteria.map((c) => (
              <tr key={c}>
                <td className={cell}>{c}</td>
                {aoc.venueRating!.summary!.map((v) => <td key={v.rfqSupplierId} className={cn(cell, "text-center tabular-nums")}>{v.criteria[c]?.toFixed(2) ?? ""}</td>)}
              </tr>
            ))}
            <tr className="font-bold">
              <td className={cell}>Overall average (rank)</td>
              {aoc.venueRating.summary.map((v) => <td key={v.rfqSupplierId} className={cn(cell, "text-center tabular-nums")}>{v.overall.toFixed(2)} ({v.rank})</td>)}
            </tr>
          </tbody>
        </table>
      )}

      {/* Recommendation */}
      <p className="mt-3">
        {winner ? (
          <>
            Based on the above canvass, the Bids and Awards Committee recommends the award to <strong className="uppercase">{winner.supplierName}</strong>
            {isVenue ? ", the highest-rated venue," : ", having submitted the lowest calculated and responsive quotation,"} in the amount of{" "}
            <strong>₱ {fmtAmount(winner.totalQuoted)}</strong>.
          </>
        ) : (
          "No supplier has been determined yet."
        )}
      </p>
      {aoc.bacRemarks && <p className="mt-1"><strong>BAC Remarks:</strong> {aoc.bacRemarks}</p>}

      {/* Signatures (wet) */}
      <p className="mt-4 font-bold">BIDS AND AWARDS COMMITTEE:</p>
      <div className="mt-1 grid grid-cols-5 gap-x-4 gap-y-6">
        <SignatureLine person={doc?.bacChair ?? null} fallback="Chairman" />
        <SignatureLine person={doc?.bacViceChair ?? null} fallback="Vice-Chairman" />
        {members.map((m, i) => <SignatureLine key={i} person={m} fallback="Member" />)}
      </div>
      {doc?.twgLead && (
        <>
          <p className="mt-4 font-bold">TECHNICAL WORKING GROUP:</p>
          <div className="mt-1 grid grid-cols-5 gap-x-4"><SignatureLine person={doc.twgLead} fallback="TWG Lead" /></div>
        </>
      )}
      <div className="mt-5 grid grid-cols-3 gap-x-8">
        <div>
          <p>Prepared by:</p>
          <SignatureLine person={aoc.preparedByName ? { name: aoc.preparedByName, position: aoc.preparedByPosition } : null} fallback="Supply Unit" />
        </div>
        <div>
          <p>Noted by:</p>
          <SignatureLine person={doc?.supplyOfficer ?? null} fallback="Supply Officer" />
        </div>
        <div>
          <p>Approved by:</p>
          <SignatureLine person={doc?.regionalDirector ?? null} fallback="Regional Director" />
        </div>
      </div>
    </div>
  );
}

function Particular({ label, value, bold }: { label: string; value?: string | null; bold?: boolean }) {
  return (
    <div className="flex gap-2">
      <span className="shrink-0">{label}:</span>
      <span className={cn("flex-1 border-b border-black px-1", bold && "font-bold")}>{value || " "}</span>
    </div>
  );
}

/** Room for the wet signature, then the printed name and position (blank line when not assigned). */
function SignatureLine({ person, fallback }: { person: AocSignatory | null; fallback: string }) {
  return (
    <div className="pt-7 text-center">
      <p className="min-h-[1.3em] border-b border-black font-bold uppercase">{person?.name ?? " "}</p>
      <p className="text-[9px]">{person?.position || fallback}</p>
    </div>
  );
}
