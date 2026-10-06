import type { AbstractOfCanvas, AocSignatory } from "@/lib/api";
import { formatLongDate } from "@/lib/date-format";
import { fmtAmount } from "@/lib/lib-store";
import { splitRfqDescription } from "@/lib/rfq-format";
import { cn } from "@/lib/utils";

const SERIF = '"Times New Roman", Times, serif';
const cell = "border border-black px-1 py-0.5 align-top";
const blank = "\u00a0";
const money = (value: number | null | undefined) => value === null || value === undefined ? "" : fmtAmount(Number(value));

/** The official DOST Caraga Abstract of Canvass, matching the supplied Excel/PDF form. */
export function AocDocumentOfficial({ aoc, className }: { aoc: AbstractOfCanvas; className?: string }) {
  const doc = aoc.document;
  const suppliers = aoc.suppliers.filter((supplier) => supplier.quoteItems.length > 0);
  const awardByItem = new Map(aoc.awards.map((award) => [award.rfqItemId, award]));
  const members: Array<AocSignatory | null> = [...(doc?.bacMembers ?? []).slice(0, 3)];
  while (members.length < 3) members.push(null);

  const awardGroups = aoc.awards.reduce<Map<string, { supplier: string; itemNumbers: number[] }>>((groups, award) => {
    if (!award.winningRfqSupplierId) return groups;
    const item = aoc.items.find((candidate) => candidate.id === award.rfqItemId);
    const current = groups.get(award.winningRfqSupplierId) ?? { supplier: award.winningSupplierName, itemNumbers: [] };
    if (item) current.itemNumbers.push(item.itemNo);
    groups.set(award.winningRfqSupplierId, current);
    return groups;
  }, new Map());

  const nonCompliant = suppliers.flatMap((supplier) => supplier.quoteItems
    .filter((quote) => quote.offerStatus === "Quoted" && quote.aocComplies === false)
    .map((quote) => ({ supplier: supplier.supplierName, item: aoc.items.find((candidate) => candidate.id === quote.rfqItemId), remarks: quote.aocRemarks || quote.twgRemarks })));

  return (
    <div className={cn("aoc-document bg-white text-[10px] leading-tight text-black", className)} style={{ fontFamily: SERIF }}>
      <style>{`
        @media print {
          @page { size: A4 landscape; margin: 9mm 8mm 12mm; @bottom-center { content: "Page " counter(page) " of " counter(pages); font: 9px ${SERIF}; } }
          .aoc-document { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
          .aoc-document thead { display: table-header-group; }
          .aoc-document tfoot { display: table-row-group; }
          .aoc-document .aoc-signatures, .aoc-document .aoc-recommendation { break-inside: avoid; }
        }
      `}</style>

      <header className="mb-3 text-center text-[11px] leading-tight">
        <p>Republic of the Philippines</p>
        <p className="font-bold">DEPARTMENT OF SCIENCE AND TECHNOLOGY</p>
        <p className="font-bold">CARAGA ADMINISTRATIVE REGION</p>
        <h1 className="mt-4 text-[13px] font-bold">ABSTRACT OF CANVASS</h1>
      </header>

      <table className="w-full table-fixed border-collapse border border-black">
        <caption className="sr-only">Dealer quotations and item-by-item awards for Purchase Request {aoc.prNo}</caption>
        <colgroup>
          <col className="w-[4.5%]" />
          <col className="w-[4%]" />
          <col className="w-[5.5%]" />
          <col className="w-[36%]" />
          <col className="w-[8%]" />
          {suppliers.map((supplier) => <col key={supplier.id} style={{ width: `${42 / Math.max(suppliers.length, 1)}%` }} />)}
        </colgroup>
        <thead className="text-center font-bold">
          <tr>
            <th rowSpan={3} scope="col" className={cn(cell, "align-middle")}>ITEM<br />NO.</th>
            <th rowSpan={3} scope="col" className={cn(cell, "align-middle")}>QTY</th>
            <th rowSpan={3} scope="col" className={cn(cell, "align-middle")}>UNIT</th>
            <th rowSpan={3} scope="col" className={cn(cell, "align-middle text-[11px]")}>ITEM/DESCRIPTION</th>
            <th rowSpan={3} scope="col" className={cn(cell, "align-middle text-[11px]")}>UNIT COST<br />(based on PR)</th>
            <th colSpan={Math.max(suppliers.length, 1)} scope="colgroup" className={cn(cell, "text-[12px] font-normal")}>DEALERS&apos; QUOTATIONS</th>
          </tr>
          <tr>
            {suppliers.length > 0 ? suppliers.map((supplier) => (
              <th key={supplier.id} scope="col" className={cn(cell, "align-middle font-normal uppercase break-words")}>{supplier.supplierName}</th>
            )) : <th className={cell}>NO SUPPLIERS</th>}
          </tr>
          <tr>
            {suppliers.length > 0 ? suppliers.map((supplier) => (
              <th key={supplier.id} className={cn(cell, "font-normal break-words")}>{supplier.supplierAddress || blank}</th>
            )) : <th className={cell}>{blank}</th>}
          </tr>
        </thead>
        {aoc.items.map((item) => {
          const { name, specs } = splitRfqDescription(item.description);
          const award = awardByItem.get(item.id);
          return (
            <tbody key={item.id} className="aoc-item-group">
              <tr className="aoc-item-main">
                <th scope="row" className={cn(cell, "text-center font-bold")}>{item.itemNo}</th>
                <td className={cn(cell, "text-center")}>{item.qty}</td>
                <td className={cn(cell, "text-center")}>{item.unit}</td>
                <td className={cn(cell, "font-bold")}>{name}</td>
                <td className={cn(cell, "text-right tabular-nums")}>{money(item.unitAbc)}</td>
                {suppliers.map((supplier) => {
                  const quote = supplier.quoteItems.find((candidate) => candidate.rfqItemId === item.id);
                  const awarded = award?.winningRfqSupplierId === supplier.id;
                  return (
                    <td key={supplier.id} className={cn(cell, "text-right tabular-nums", awarded && "font-bold")}>
                      {quote?.offerStatus === "No Bid" || !quote ? "NONE" : money(quote.unitPrice)}
                      {quote?.aocComplies === false && (
                        <span className="mt-0.5 block text-left text-[8px] font-normal italic leading-tight">*{quote.aocRemarks || quote.twgRemarks || "Non-compliant"}</span>
                      )}
                    </td>
                  );
                })}
              </tr>
              {specs.map((specification, index) => (
                <tr key={`${item.id}-spec-${index}`}>
                  <td className={cell}>{blank}</td><td className={cell}>{blank}</td><td className={cell}>{blank}</td>
                  <td className={cn(cell, "pl-3")}>{specification}</td>
                  <td className={cell}>{blank}</td>
                  {suppliers.map((supplier) => <td key={supplier.id} className={cell}>{blank}</td>)}
                </tr>
              ))}
            </tbody>
          );
        })}
        <tfoot>
          {doc?.notes && (
            <tr>
              <td className={cell}>{blank}</td><td className={cell}>{blank}</td><td className={cell}>{blank}</td>
              <td className={cn(cell, "whitespace-pre-line py-2 font-semibold")}>{doc.notes}</td>
              <td className={cell}>{blank}</td>
              {suppliers.map((supplier) => <td key={supplier.id} className={cell}>{blank}</td>)}
            </tr>
          )}
          <tr>
            <td className={cell}>{blank}</td><td className={cell}>{blank}</td><td className={cell}>{blank}</td>
            <td className={cn(cell, "py-2")}>
              <p><strong>Purpose:</strong> {doc?.purpose}</p>
              <p><strong>Fund Source:</strong> {doc?.fundSource}</p>
            </td>
            <td className={cell}>{blank}</td>
            {suppliers.map((supplier) => <td key={supplier.id} className={cell}>{blank}</td>)}
          </tr>
          <tr>
            <td className={cell}>{blank}</td><td className={cell}>{blank}</td><td className={cell}>{blank}</td>
            <td className={cell}>PR#: {aoc.prNo}{doc?.prDate ? ` dated ${formatLongDate(doc.prDate)}` : ""}</td>
            <td className={cell}>{blank}</td>
            {suppliers.map((supplier) => <td key={supplier.id} className={cell}>{blank}</td>)}
          </tr>
          <tr className="aoc-recommendation">
            <td colSpan={5 + Math.max(suppliers.length, 1)} className={cell}>Based on the above abstract of canvass, it is recommended that the award be made to:</td>
          </tr>
          {[...awardGroups.entries()].map(([supplierId, group]) => (
            <tr key={supplierId} className="aoc-recommendation">
              <td colSpan={5 + Math.max(suppliers.length, 1)} className={cell}>
                Items No. {compactItemNumbers(group.itemNumbers)} – {doc?.purpose || "the listed procurement items"} are awarded to: <strong className="uppercase">{group.supplier}</strong>
              </td>
            </tr>
          ))}
          {nonCompliant.map(({ supplier, item, remarks }, index) => (
            <tr key={`${supplier}-${item?.id ?? index}`} className="aoc-recommendation">
              <td colSpan={5 + Math.max(suppliers.length, 1)} className={cell}>
                Item No. {item?.itemNo ?? "—"} offered by <strong className="uppercase">{supplier}</strong> is non-compliant{remarks ? `: ${remarks}` : ""}.
              </td>
            </tr>
          ))}
        </tfoot>
      </table>

      <section className="aoc-signatures mt-6 grid grid-cols-5 gap-x-7">
        <BacSignature person={doc?.bacChair ?? null} fallback="Chairman, BAC" />
        <BacSignature person={doc?.bacViceChair ?? null} fallback="Vice-Chairman, BAC" />
        {members.map((member, index) => <BacSignature key={index} person={member} fallback={`BAC Member ${index + 1}`} />)}
      </section>
    </div>
  );
}

function BacSignature({ person, fallback }: { person: AocSignatory | null; fallback: string }) {
  return (
    <div className="pt-5 text-left leading-tight">
      <p className="min-h-[1.3em] font-bold uppercase">{person?.name || blank}</p>
      <p>{person?.position || fallback}</p>
      <p className="font-bold">Date: <span className="inline-block min-w-16 border-b border-black">{blank}</span></p>
    </div>
  );
}

function compactItemNumbers(values: number[]): string {
  const numbers = [...new Set(values)].sort((a, b) => a - b);
  const ranges: string[] = [];
  let start = numbers[0];
  let previous = numbers[0];
  for (let index = 1; index <= numbers.length; index += 1) {
    const current = numbers[index];
    if (current === previous + 1) {
      previous = current;
      continue;
    }
    if (start !== undefined) ranges.push(start === previous ? String(start) : `${start}–${previous}`);
    start = current;
    previous = current;
  }
  return ranges.join(", ");
}
