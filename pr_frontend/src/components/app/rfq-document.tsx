import { Fragment } from "react";
import { formatLongDate } from "@/lib/date-format";
import { fmtAmount } from "@/lib/lib-store";
import { RFQ_FORM_CODE, rfqDocumentLines, rfqDocumentsLead, splitRfqDescription } from "@/lib/rfq-format";
import { cn } from "@/lib/utils";

export type RfqPrintItem = { itemNo: number; qty: number | string; unit: string; description: string; unitAbc: number; totalAbc: number };

export type RfqPrintData = {
  quotationNo: string;
  rfqDate: string;
  placeOfDelivery: string;
  estimatedBudget: number;
  prNo: string;
  openingDate: string;
  bacChairman: string;
  bacChairmanTitle: string;
  requiredDocuments: string[];
  items: RfqPrintItem[];
  notes: string;
  purpose: string;
  fundSource: string;
  canvasser: string;
  bacAction: string;
};

const SERIF = '"Cambria", "Times New Roman", Times, serif';
/** Printed slightly smaller so the form stays on one sheet even where the browser adds its own header/footer space. */
const PRINT_ZOOM = 0.9;
/** Blank ruled rows under the items on paper (the Excel export keeps the full RFQ_MIN_TABLE_ROWS). */
const PRINT_MIN_TABLE_ROWS = 6;
const cell = "border border-black px-1.5 py-0.5 align-top";
const money = (n: number) => (n ? fmtAmount(n) : "");

/**
 * The Request for Quotation exactly as the official DOST Caraga form lays it out: letterhead, the
 * quotation details, the letter with the documents asked for, the items (name in bold, each
 * specification on its own ruled line, blank UNIT PRICE / TOTAL for the supplier), the FOB/VAT
 * notes and purpose in the table, and the supplier's "Quotation Submitted by" block.
 */
export function RfqDocument({ data, className }: { data: RfqPrintData; className?: string }) {
  const documentLines = rfqDocumentLines(data.requiredDocuments);
  const opening = formatLongDate(data.openingDate);
  const itemRows = data.items.reduce((n, it) => n + 1 + splitRfqDescription(it.description).specs.length, 0);
  const fillerRows = Math.max(0, PRINT_MIN_TABLE_ROWS - itemRows);
  const notes = data.notes.split("\n").map((l) => l.trim()).filter(Boolean);

  return (
    <div className={cn("rfq-document bg-white text-[11px] leading-snug text-black", className)} style={{ fontFamily: SERIF }}>
      {/* No page margin: the form keeps a thin 8mm gap of its own instead, on whatever paper is chosen.
          A browser page margin adds its own space at the top (and room for the browser's
          title/date/URL lines); with none, the form starts near the top of the sheet. Padding repeats
          on every printed page where the browser supports it. */}
      <style>{`@media print { @page { margin: 0; } .rfq-document { zoom: ${PRINT_ZOOM}; padding: 8mm 12mm; box-decoration-break: clone; -webkit-box-decoration-break: clone; } }`}</style>

      <p className="text-right text-[7px] uppercase tracking-wide">{RFQ_FORM_CODE}</p>

      {/* Letterhead */}
      <div className="mt-2 text-center">
        <p>Republic of the Philippines</p>
        <p className="font-bold">DEPARTMENT OF SCIENCE AND TECHNOLOGY</p>
        <p>Caraga Regional Office No. 13</p>
        <p>CSU Campus, Ampayon, Butuan City</p>
        <p>Telephone No.: (085) 226-3831</p>
        <p className="font-bold">Email Address: supply@caraga.dost.gov.ph</p>
      </div>

      <p className="mt-4 text-center font-bold">REQUEST FOR QUOTATION</p>

      {/* Quotation details */}
      <table className="ml-auto mt-1 border-collapse">
        <tbody>
          {[
            ["Quotation No.:", data.quotationNo, true],
            ["RFQ Date:", data.rfqDate, false],
            ["Place of Delivery:", data.placeOfDelivery, false],
            ["Estimated Budget:", data.estimatedBudget ? `₱ ${fmtAmount(data.estimatedBudget)}` : "", false],
            ["Purchase Request No.:", data.prNo, true],
          ].map(([label, value, bold]) => (
            <tr key={String(label)}>
              <td className="pr-3 text-right">{label}</td>
              <td className={cn("w-56 border-b border-black px-1", bold && "font-bold")}>{value || " "}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Letter */}
      <div className="mt-3">
        <p>Sir/Madam:</p>
        <div className="pl-8">
          <p>
            Please quote us your government price/s for the item/s listed below which will be opened on{" "}
            {opening ? <span className="border-b border-black px-1 font-bold">{opening}</span> : <span className="inline-block w-40 border-b border-black">&nbsp;</span>}
          </p>
          <p>{rfqDocumentsLead(data.requiredDocuments)}</p>
          {documentLines.length > 0 && (
            <div className="pl-4">
              {documentLines.map((line) => <p key={line}>{line}</p>)}
            </div>
          )}
          <p>Thank you.</p>
        </div>
      </div>

      {/* Signatory */}
      <div className="mt-2 flex justify-end">
        <div className="w-72 text-center">
          <p className="text-left">Very truly yours,</p>
          <p className="mt-7 font-bold uppercase underline">{data.bacChairman || " "}</p>
          <p>{data.bacChairmanTitle}</p>
        </div>
      </div>

      {/* Items */}
      <p className="mt-2 pl-8">This office is in the market for the following:</p>
      <table className="w-full border-collapse border border-black">
        <colgroup>
          <col className="w-[6%]" /><col className="w-[6%]" /><col className="w-[7%]" /><col className="w-[37%]" />
          <col className="w-[11%]" /><col className="w-[11%]" /><col className="w-[11%]" /><col className="w-[11%]" />
        </colgroup>
        <thead>
          <tr className="font-bold">
            {["Item No.", "QTY", "UNIT", "ITEM DESCRIPTION", "UNIT ABC", "TOTAL ABC", "UNIT PRICE", "TOTAL"].map((h) => (
              <th key={h} className="border border-black px-1 py-1 text-center align-middle">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.items.map((it) => {
            const { name, specs } = splitRfqDescription(it.description);
            return (
              <Fragment key={it.itemNo}>
                <tr>
                  <td className={cn(cell, "text-center font-bold")}>{it.itemNo}</td>
                  <td className={cn(cell, "text-center")}>{it.qty}</td>
                  <td className={cn(cell, "text-center")}>{it.unit}</td>
                  <td className={cn(cell, "font-bold")}>{name}</td>
                  <td className={cn(cell, "text-right tabular-nums")}>{money(it.unitAbc)}</td>
                  <td className={cn(cell, "text-right tabular-nums")}>{money(it.totalAbc)}</td>
                  <td className={cell} />
                  <td className={cell} />
                </tr>
                {specs.map((spec, i) => (
                  <tr key={i}>
                    <td className={cell} /><td className={cell} /><td className={cell} />
                    <td className={cell}>{spec}</td>
                    <td className={cell} /><td className={cell} /><td className={cell} /><td className={cell} />
                  </tr>
                ))}
              </Fragment>
            );
          })}
          {Array.from({ length: fillerRows }, (_, i) => (
            <tr key={`blank-${i}`}>
              {Array.from({ length: 8 }, (__, c) => <td key={c} className={cn(cell, "h-[1.35em]")} />)}
            </tr>
          ))}
          {notes.length > 0 && (
            <tr>
              <td className={cell} /><td className={cell} /><td className={cell} />
              <td className={cn(cell, "italic")}>{notes.map((line, i) => <p key={i} className={i > 0 ? "mt-2" : ""}>{line}</p>)}</td>
              <td className={cell} /><td className={cell} /><td className={cell} /><td className={cell} />
            </tr>
          )}
          <tr>
            <td className={cell} /><td className={cell} /><td className={cell} />
            <td className={cell}>
              <p><strong>Purpose:</strong> {data.purpose}</p>
              <p><strong>Fund Source:</strong> {data.fundSource}</p>
            </td>
            <td className={cell} /><td className={cell} /><td className={cell} /><td className={cell} />
          </tr>
        </tbody>
      </table>

      {/* Canvasser and BAC action (left); the supplier's block (right) */}
      <div className="mt-2 grid grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] gap-6">
        <div className="pt-6">
          <div className="w-44 text-center">
            <p className="min-h-[1.4em]">{data.canvasser}</p>
            <p className="border-t border-black">Procurement Unit/Canvasser</p>
          </div>
          <div className="mt-3 h-14 w-44 border border-black p-1">
            <p>BAC Action:</p>
            {data.bacAction && <p>{data.bacAction}</p>}
          </div>
        </div>
        <table className="border-collapse self-start">
          <tbody>
            {["Quotation Submitted by:", "Name of Company/Establishment:", "Address:", "By:"].map((label) => (
              <tr key={label}>
                <td className="whitespace-nowrap pr-2 pt-2">{label}</td>
                <td className="w-full border-b border-black" />
              </tr>
            ))}
            <tr>
              <td />
              <td className="text-center">(Printed Name and Signature)</td>
            </tr>
            {["Date:", "Contact No.:", "TIN No.:"].map((label) => (
              <tr key={label}>
                <td className="whitespace-nowrap pr-2 pt-1">{label}</td>
                <td className="w-full border-b border-black" />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
