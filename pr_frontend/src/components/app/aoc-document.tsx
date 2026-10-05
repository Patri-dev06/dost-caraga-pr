import { Fragment } from "react";
import type { AbstractOfCanvas, AocSignatory } from "@/lib/api";
import { parseIsoDate } from "@/lib/date-format";
import { fmtAmount } from "@/lib/lib-store";
import { splitRfqDescription } from "@/lib/rfq-format";
import { cn } from "@/lib/utils";

const SERIF = '"Cambria", "Times New Roman", Times, serif';
const cell = "border border-black px-1.5 py-0.5 align-top";

/** A quoted price, or "NONE" where the supplier did not offer that line at all. */
const price = (n: number | null | undefined) => (n === null || n === undefined ? "NONE" : fmtAmount(Number(n)));

/**
 * The Abstract of Canvass as the office's own wet-signed form (landscape): every item against each
 * dealer's quotation, the award marked line by line — one canvass can split its items across all
 * three dealers — then the recommendation and the BAC's signature block.
 *
 * Laid out from a signed sample (PR 2026-08-762): a single "UNIT COST (based on PR)" column, one
 * price column per dealer under their name and address, "NONE" where a dealer did not quote, each
 * specification on its own row, and the awarded price in bold.
 */
export function AocDocument({ aoc, className }: { aoc: AbstractOfCanvas; className?: string }) {
  const doc = aoc.document;
  // Only dealers that actually returned a quotation are canvassed (a timed-out or replaced one did not).
  const suppliers = aoc.suppliers.filter((s) => s.quoteItems.length > 0);
  const members = doc?.bacMembers.length ? doc.bacMembers : [null, null, null];
  const awards = doc?.awardSummary.awards ?? [];
  const nonCompliant = doc?.awardSummary.nonCompliant ?? [];
  const columns = 5 + suppliers.length;

  return (
    <div className={cn("aoc-document bg-white text-[10px] leading-snug text-black", className)} style={{ fontFamily: SERIF }}>
      <style>{`@media print { @page { size: A4 landscape; margin: 10mm; } .aoc-document thead { display: table-header-group; } .aoc-document tr { break-inside: avoid; } }`}</style>

      {/* Letterhead, worded as on the office's form. */}
      <div className="text-center text-[11px]">
        <p>Republic of the Philippines</p>
        <p className="font-bold">DEPARTMENT OF SCIENCE AND TECHNOLOGY</p>
        <p className="font-bold">CARAGA ADMINISTRATIVE REGION</p>
      </div>
      <p className="mt-3 text-center text-[12px] font-bold">ABSTRACT OF CANVASS</p>

      <table className="mt-3 w-full border-collapse border border-black">
        {/* Repeated at the top of every printed page, dealer addresses included. */}
        <thead className="text-center font-bold">
          <tr>
            <th rowSpan={2} className={cn(cell, "w-8 align-middle")}>ITEM NO</th>
            <th rowSpan={2} className={cn(cell, "w-10 align-middle")}>QTY</th>
            <th rowSpan={2} className={cn(cell, "w-12 align-middle")}>UNIT</th>
            <th rowSpan={2} className={cn(cell, "align-middle")}>ITEM/DESCRIPTION</th>
            <th rowSpan={2} className={cn(cell, "w-20 align-middle")}>UNIT COST (based on PR)</th>
            <th colSpan={suppliers.length} className={cn(cell, "align-middle")}>DEALERS QUOTATION</th>
          </tr>
          <tr>
            {suppliers.map((s) => (
              <th key={s.id} className={cn(cell, "w-24 align-middle")}>
                <span className="block uppercase">{s.supplierName}</span>
                <span className="block border-t border-black pt-0.5 text-[9px] font-normal">{s.supplierAddress || " "}</span>
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {/* Each dealer's standing note sits above the items, as on the form. The purpose itself is
              printed once, in the block under the table. */}
          {suppliers.some((s) => s.remarks) && (
            <tr>
              <td className={cell} />
              <td className={cell} />
              <td className={cell} />
              <td className={cell} />
              <td className={cell} />
              {suppliers.map((s) => <td key={s.id} className={cn(cell, "text-[9px]")}>{s.remarks}</td>)}
            </tr>
          )}

          {aoc.items.map((item) => {
            const { name, specs } = splitRfqDescription(item.description);
            return (
              <Fragment key={item.id}>
                <tr>
                  <td className={cn(cell, "text-center")}>{item.itemNo}</td>
                  <td className={cn(cell, "text-center")}>{item.qty}</td>
                  <td className={cn(cell, "text-center")}>{item.unit}</td>
                  <td className={cn(cell, "font-bold")}>{name}</td>
                  <td className={cn(cell, "text-right tabular-nums")}>{fmtAmount(Number(item.unitAbc ?? 0))}</td>
                  {suppliers.map((s) => {
                    const q = s.quoteItems.find((qi) => qi.rfqItemId === item.id);
                    const quoted = q && q.unitPrice !== null;
                    return (
                      // The award is per line, so the winning figure is bold in its own column.
                      <td key={s.id} className={cn(cell, "tabular-nums", quoted ? "text-right" : "text-center", q?.isAwarded && "font-bold")}>
                        {price(q?.unitPrice)}
                        {q?.twgRemarks && <span className="block text-left text-[8px] font-normal">*{q.twgRemarks}</span>}
                      </td>
                    );
                  })}
                </tr>
                {/* Each specification keeps its own ruled row, as on the paper form. */}
                {specs.map((spec, i) => (
                  <tr key={`${item.id}-spec-${i}`}>
                    <td className={cell} />
                    <td className={cell} />
                    <td className={cell} />
                    <td className={cn(cell, "pl-4")}>{spec}</td>
                    <td className={cell} />
                    {suppliers.map((s) => <td key={s.id} className={cell} />)}
                  </tr>
                ))}
              </Fragment>
            );
          })}

          {/* The particulars the form carries under the table rather than in a header block. */}
          {doc?.fob && <FullRow columns={columns}>FOB: {doc.fob}</FullRow>}
          {doc?.notes?.split("\n").filter(Boolean).map((line, i) => (
            <FullRow key={`note-${i}`} columns={columns} bold>{line}</FullRow>
          ))}
          {doc?.purpose && <FullRow columns={columns}><strong>Purpose:</strong> {doc.purpose}</FullRow>}
          {doc?.fundSource && <FullRow columns={columns}><strong>Fund Source:</strong> {doc.fundSource}</FullRow>}
          <FullRow columns={columns}>
            PR#: {aoc.prNo}{doc?.prDate ? ` dated ${formatShortDate(doc.prDate)}` : ""}
          </FullRow>

          <FullRow columns={columns}>Based on the above abstract of canvass, it is recommended that the award be made to:</FullRow>
          {awards.length === 0 ? (
            <FullRow columns={columns}>No supplier has been determined yet.</FullRow>
          ) : (
            awards.map((a) => (
              <FullRow key={a.rfqSupplierId} columns={columns}>
                {a.itemNos.length === 1
                  ? `Item No. ${a.itemNos[0]} is awarded to: `
                  : `Items No. ${listItemNos(a.itemNos)} are awarded to: `}
                <strong className="uppercase">{a.supplierName}</strong>
              </FullRow>
            ))
          )}
          {nonCompliant.map((line, i) => <FullRow key={`nc-${i}`} columns={columns}>{line}</FullRow>)}
        </tbody>
      </table>

      {/* The committee signs this by hand once it is printed. */}
      <div className="mt-6 grid grid-cols-5 gap-x-4 gap-y-8">
        <SignatureBlock person={doc?.bacChair ?? null} fallback="Chairman, BAC" />
        <SignatureBlock person={doc?.bacViceChair ?? null} fallback="Vice-Chairman, BAC" />
        {members.map((m, i) => <SignatureBlock key={i} person={m} fallback={`BAC Member ${i + 1}`} />)}
      </div>
    </div>
  );
}

/** A line of narrative spanning the whole table, the way the form runs them under the items. */
function FullRow({ columns, children, bold }: { columns: number; children: React.ReactNode; bold?: boolean }) {
  return (
    <tr>
      <td colSpan={columns} className={cn(cell, bold && "font-bold")}>{children}</td>
    </tr>
  );
}

/** The form dates the PR the short way: "dated 08/12/26". Accepts a full ISO timestamp or yyyy-MM-dd. */
function formatShortDate(value: string): string {
  const d = parseIsoDate(value) ?? new Date(value);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "2-digit" });
}

/** "1, 2, 3 and 22" — the form writes the last separator as a word. */
function listItemNos(nos: number[]): string {
  if (nos.length <= 1) return String(nos[0] ?? "");
  return `${nos.slice(0, -1).join(", ")} and ${nos[nos.length - 1]}`;
}

/** Printed name over the role, with room above for the wet signature and a date to fill in. */
function SignatureBlock({ person, fallback }: { person: AocSignatory | null; fallback: string }) {
  return (
    <div className="pt-8">
      <p className="min-h-[1.2em] font-bold uppercase">{person?.name ?? " "}</p>
      <p className="text-[9px]">{person?.position || fallback}</p>
      <p className="mt-1 text-[9px]">Date:</p>
    </div>
  );
}
