export interface RfqExcelItem {
  itemNo: number;
  qty: number;
  unit: string;
  description: string;
  unitAbc: number;
  totalAbc: number;
  unitPrice: string;
  total: string;
}

export interface RfqExcelData {
  quotationNo: string;
  rfqDate: string;
  placeOfDelivery: string;
  estimatedBudget: number;
  prNo: string;
  openingDate: string;
  bacChairman: string;
  bacChairmanTitle: string;
  purpose: string;
  fundSource: string;
  items: RfqExcelItem[];
  canvasser: string;
  bacAction: string;
  /** Documents the supplier submits with the quotation (empty = none asked for). */
  requiredDocuments: string[];
  /** FOB / VAT lines, printed in italics under the items. */
  notes: string;
}

const BLACK = "FF000000";
const thin = { style: "thin" as const, color: { argb: BLACK } };
const box = { top: thin, left: thin, bottom: thin, right: thin };

function colToNum(letters: string): number {
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n;
}

function parseRange(range: string) {
  const [a, b] = range.split(":");
  const m1 = a.match(/([A-Z]+)(\d+)/)!;
  const m2 = (b ?? a).match(/([A-Z]+)(\d+)/)!;
  return { c1: colToNum(m1[1]), r1: Number(m1[2]), c2: colToNum(m2[1]), r2: Number(m2[2]) };
}

const money = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

import { RFQ_FORM_CODE, RFQ_MIN_TABLE_ROWS, rfqDocumentLines, rfqDocumentsLead, splitRfqDescription } from "@/lib/rfq-format";

export async function exportRfqExcel(data: RfqExcelData, filename: string) {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("RFQ", {
    views: [{ showGridLines: false }],
    pageSetup: { paperSize: 9, orientation: "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.5, right: 0.5, top: 0.4, bottom: 0.5, header: 0.3, footer: 0.3 } },
    headerFooter: { oddFooter: "&CPage &P of &N" },
  });

  ws.columns = [
    { width: 8 },   // A: Item No
    { width: 7 },   // B: QTY
    { width: 10 },  // C: UNIT
    { width: 32 },  // D: ITEM DESCRIPTION
    { width: 13 },  // E: UNIT ABC
    { width: 13 },  // F: TOTAL ABC
    { width: 13 },  // G: UNIT PRICE
    { width: 13 },  // H: TOTAL
  ];

  const eachCell = (range: string, fn: (cell: import("exceljs").Cell) => void) => {
    const { c1, r1, c2, r2 } = parseRange(range);
    for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) fn(ws.getCell(r, c));
  };

  const put = (
    range: string,
    value: import("exceljs").CellValue,
    opts: {
      bold?: boolean;
      italic?: boolean;
      size?: number;
      align?: "left" | "center" | "right";
      vAlign?: "top" | "middle" | "bottom";
      wrap?: boolean;
      border?: boolean;
      fill?: string;
      numFmt?: string;
    } = {},
  ) => {
    if (range.includes(":")) ws.mergeCells(range);
    const cell = ws.getCell(range.includes(":") ? range.split(":")[0] : range);
    cell.value = value;
    cell.font = { name: "Times New Roman", size: opts.size ?? 10, bold: opts.bold, italic: opts.italic };
    cell.alignment = {
      horizontal: opts.align ?? "left",
      vertical: opts.vAlign ?? "middle",
      wrapText: opts.wrap ?? false,
    };
    if (opts.numFmt) cell.numFmt = opts.numFmt;
    if (opts.fill) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: opts.fill } };
    if (opts.border) eachCell(range, (c) => (c.border = box));
    return cell;
  };

  let r = 1;

  // Form code (top right), as on the official form
  put(`E${r}:H${r}`, RFQ_FORM_CODE, { size: 6, align: "right" }); r++;

  // Letterhead
  put(`A${r}:H${r}`, "Republic of the Philippines", { size: 10, align: "center" }); r++;
  put(`A${r}:H${r}`, "DEPARTMENT OF SCIENCE AND TECHNOLOGY", { bold: true, size: 11, align: "center" }); r++;
  put(`A${r}:H${r}`, "Caraga Regional Office No. 13", { size: 10, align: "center" }); r++;
  put(`A${r}:H${r}`, "CSU Campus, Ampayon, Butuan City", { size: 10, align: "center" }); r++;
  put(`A${r}:H${r}`, "Telephone No.: (085) 226-3831", { size: 10, align: "center" }); r++;
  put(`A${r}:H${r}`, "Email Address: supply@caraga.dost.gov.ph", { bold: true, size: 10, align: "center" }); r++;
  r++;

  put(`A${r}:H${r}`, "REQUEST FOR QUOTATION", { bold: true, size: 11, align: "center" }); r++;

  // Quotation details (right), each value on an underline
  const underline = (range: string) => eachCell(range, (c) => (c.border = { bottom: thin }));
  const metaFields: [string, string, boolean][] = [
    ["Quotation No.:", data.quotationNo, true],
    ["RFQ Date:", data.rfqDate, false],
    ["Place of Delivery:", data.placeOfDelivery, false],
    ["Estimated Budget:", data.estimatedBudget ? `₱ ${money(data.estimatedBudget)}` : "", false],
    ["Purchase Request No.:", data.prNo, true],
  ];
  for (const [label, value, bold] of metaFields) {
    put(`E${r}:F${r}`, label, { align: "right", size: 10 });
    put(`G${r}:H${r}`, value, { bold, size: 10 });
    underline(`G${r}:H${r}`);
    r++;
  }
  r++;

  // Letter
  put(`A${r}:H${r}`, "Sir/Madam:", { size: 10 }); r++;
  put(`A${r}:H${r}`, `        Please quote us your government price/s for the item/s listed below which will be opened on ${data.openingDate || "_______________________"}`, { size: 10, wrap: true });
  ws.getRow(r).height = 26;
  r++;
  put(`A${r}:H${r}`, `        ${rfqDocumentsLead(data.requiredDocuments)}`, { size: 10, wrap: true });
  ws.getRow(r).height = 26;
  r++;
  for (const line of rfqDocumentLines(data.requiredDocuments)) {
    put(`A${r}:H${r}`, `            ${line}`, { size: 10 }); r++;
  }
  put(`A${r}:H${r}`, "        Thank you.", { size: 10 }); r++;
  r++;

  // BAC Chairman
  put(`E${r}:H${r}`, "Very truly yours,", { size: 10 }); r += 3;
  const chair = put(`E${r}:H${r}`, (data.bacChairman || "").toUpperCase(), { bold: true, size: 10, align: "center" });
  chair.font = { ...chair.font, underline: true };
  r++;
  put(`E${r}:H${r}`, data.bacChairmanTitle, { size: 10, align: "center" }); r++;

  // Items table
  put(`A${r}:H${r}`, "        This office is in the market for the following:", { size: 10 }); r++;
  const headers = ["Item No.", "QTY", "UNIT", "ITEM DESCRIPTION", "UNIT ABC", "TOTAL ABC", "UNIT PRICE", "TOTAL"];
  headers.forEach((h, i) => {
    put(`${String.fromCharCode(65 + i)}${r}`, h, { bold: true, size: 10, align: "center", vAlign: "middle", wrap: true, border: true });
  });
  ws.getRow(r).height = 28;
  r++;

  const blankRow = (height = 15) => {
    for (let c = 0; c < 8; c++) put(`${String.fromCharCode(65 + c)}${r}`, "", { border: true });
    ws.getRow(r).height = height;
  };
  const descRow = (value: import("exceljs").CellValue, opts: { bold?: boolean; italic?: boolean } = {}) => {
    blankRow();
    put(`D${r}`, value, { ...opts, size: 10, wrap: true, vAlign: "top", border: true });
    const text = typeof value === "string" ? value : "";
    ws.getRow(r).height = Math.max(15, Math.ceil(text.length / 42) * 13);
  };

  let used = 0;
  for (const it of data.items) {
    const { name, specs } = splitRfqDescription(it.description);
    blankRow();
    put(`A${r}`, it.itemNo, { align: "center", vAlign: "top", border: true, bold: true, size: 10 });
    put(`B${r}`, it.qty || "", { align: "center", vAlign: "top", border: true, size: 10 });
    put(`C${r}`, it.unit, { align: "center", vAlign: "top", border: true, size: 10 });
    put(`D${r}`, name, { bold: true, vAlign: "top", wrap: true, border: true, size: 10 });
    put(`E${r}`, it.unitAbc || "", { align: "right", vAlign: "top", border: true, numFmt: "#,##0.00", size: 10 });
    put(`F${r}`, it.totalAbc || "", { align: "right", vAlign: "top", border: true, numFmt: "#,##0.00", size: 10 });
    ws.getRow(r).height = Math.max(15, Math.ceil(name.length / 42) * 13);
    r++; used++;
    for (const spec of specs) {
      descRow(spec);
      r++; used++;
    }
  }
  for (let i = used; i < RFQ_MIN_TABLE_ROWS; i++) {
    blankRow();
    r++;
  }

  // FOB / VAT notes, then purpose and fund source — inside the table, as on the form
  const notes = data.notes.split("\n").map((l) => l.trim()).filter(Boolean);
  if (notes.length > 0) {
    descRow(notes.join("\n\n"), { italic: true });
    ws.getRow(r).height = Math.max(26, notes.reduce((h, l) => h + Math.ceil(l.length / 42) * 13, 0) + 13);
    r++;
  }
  blankRow();
  put(`D${r}`, { richText: [
    { font: { name: "Times New Roman", size: 10, bold: true }, text: "Purpose: " },
    { font: { name: "Times New Roman", size: 10 }, text: `${data.purpose}\n` },
    { font: { name: "Times New Roman", size: 10, bold: true }, text: "Fund Source: " },
    { font: { name: "Times New Roman", size: 10 }, text: data.fundSource },
  ] }, { wrap: true, vAlign: "top", border: true });
  ws.getRow(r).height = Math.max(40, Math.ceil((data.purpose.length + data.fundSource.length) / 42) * 13 + 20);
  r += 2;

  // Supplier's block (right) and canvasser / BAC action (left)
  const supplierLines = ["Quotation Submitted by:", "Name of Company/Establishment:", "Address:", "By:"];
  for (const label of supplierLines) {
    put(`E${r}:F${r}`, label, { size: 10 });
    underline(`G${r}:H${r}`);
    r++;
  }
  put(`F${r}:H${r}`, "(Printed Name and Signature)", { size: 10, align: "center" }); r++;
  const canvasserRow = r - 3;
  put(`A${canvasserRow}:C${canvasserRow}`, data.canvasser, { size: 10, align: "center" });
  const label = put(`A${canvasserRow + 1}:C${canvasserRow + 1}`, "Procurement Unit/Canvasser", { size: 10, align: "center" });
  eachCell(`A${canvasserRow + 1}:C${canvasserRow + 1}`, (c) => (c.border = { top: thin }));
  label.alignment = { horizontal: "center" };
  for (const labelText of ["Date:", "Contact No.:", "TIN No.:"]) {
    put(`E${r}:F${r}`, labelText, { size: 10 });
    underline(`G${r}:H${r}`);
    r++;
  }
  put(`A${r - 3}:C${r - 1}`, `BAC Action:${data.bacAction ? `\n${data.bacAction}` : ""}`, { size: 10, vAlign: "top", wrap: true, border: true });

  // Download
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
