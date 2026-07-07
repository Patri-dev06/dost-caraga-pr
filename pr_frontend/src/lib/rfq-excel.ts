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

export async function exportRfqExcel(data: RfqExcelData, filename: string) {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("RFQ", {
    views: [{ showGridLines: false }],
    pageSetup: { fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.5, right: 0.5, top: 0.4, bottom: 0.4, header: 0.3, footer: 0.3 } },
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

  // Letterhead
  put(`A${r}:H${r}`, "Republic of the Philippines", { italic: true, size: 10, align: "center" }); r++;
  put(`A${r}:H${r}`, "DEPARTMENT OF SCIENCE AND TECHNOLOGY", { bold: true, size: 11, align: "center" }); r++;
  put(`A${r}:H${r}`, "Caraga Regional Office No. 13", { size: 10, align: "center" }); r++;
  put(`A${r}:H${r}`, "CSU Campus, Ampayon, Butuan City", { size: 10, align: "center" }); r++;
  put(`A${r}:H${r}`, "Telephone No.: (085) 226-3831", { size: 10, align: "center" }); r++;
  put(`A${r}:H${r}`, "Email Address: supply@caraga.dost.gov.ph", { size: 10, align: "center" }); r++;
  r++;

  // Title
  put(`A${r}:H${r}`, "REQUEST FOR QUOTATION", { bold: true, size: 14, align: "center" });
  ws.getRow(r).height = 22;
  r += 2;

  // Meta fields (right-aligned)
  const metaFields = [
    ["Quotation No.:", data.quotationNo],
    ["RFQ Date:", data.rfqDate],
    ["Place of Delivery:", data.placeOfDelivery],
    ["Estimated Budget:", `₱ ${money(data.estimatedBudget)}`],
    ["Purchase Request No.:", data.prNo],
  ];
  for (const [label, value] of metaFields) {
    put(`E${r}:F${r}`, label, { align: "right", size: 10 });
    put(`G${r}:H${r}`, value, { bold: true, size: 10 });
    r++;
  }
  r++;

  // Letter body
  put(`A${r}:H${r}`, "Sir/Madam:", { size: 10 }); r++;
  r++;
  put(`A${r}:H${r}`, `    Please quote us your government price/s for the item/s listed below which will be opened on ${data.openingDate || "_______________"}.`, { size: 10, wrap: true });
  ws.getRow(r).height = 28;
  r++;
  put(`A${r}:H${r}`, "    May we have your quotation on or before the scheduled opening of bids together with the following documents, viz:", { size: 10, wrap: true });
  ws.getRow(r).height = 28;
  r++;
  put(`A${r}:H${r}`, "        1. Valid PhilGeps Registration;", { size: 10 }); r++;
  put(`A${r}:H${r}`, "        2. Valid Mayor's / Business Permit, and", { size: 10 }); r++;
  put(`A${r}:H${r}`, "        3. Tax Clearance Certificate", { size: 10 }); r++;
  put(`A${r}:H${r}`, "    Thank you.", { size: 10 }); r++;
  r++;

  // BAC Chairman signatory
  put(`E${r}:H${r}`, "Very truly yours,", { size: 10, align: "right" }); r++;
  r++;
  put(`E${r}:H${r}`, data.bacChairman, { bold: true, size: 10, align: "right" }); r++;
  put(`E${r}:H${r}`, data.bacChairmanTitle, { italic: true, size: 9, align: "right" }); r++;
  r++;

  // Table intro
  put(`A${r}:H${r}`, "This office is in the market for the following:", { size: 9 }); r++;

  // Table header
  const headers = ["Item\nNo.", "QTY", "UNIT", "ITEM DESCRIPTION", "UNIT ABC", "TOTAL ABC", "UNIT PRICE", "TOTAL"];
  headers.forEach((h, i) => {
    const col = String.fromCharCode(65 + i);
    put(`${col}${r}`, h, { bold: true, size: 9, align: "center", vAlign: "middle", wrap: true, border: true, fill: "FFF2F2F2" });
  });
  ws.getRow(r).height = 28;
  r++;

  // Item rows
  for (const it of data.items) {
    put(`A${r}`, it.itemNo, { align: "center", vAlign: "top", border: true, bold: true });
    put(`B${r}`, it.qty || "", { align: "center", vAlign: "top", border: true });
    put(`C${r}`, it.unit, { align: "center", vAlign: "top", border: true });
    put(`D${r}`, it.description, { align: "left", vAlign: "top", wrap: true, border: true });
    put(`E${r}`, it.unitAbc || "", { align: "right", vAlign: "top", border: true, numFmt: "#,##0.00" });
    put(`F${r}`, it.totalAbc || "", { align: "right", vAlign: "top", border: true, numFmt: "#,##0.00" });
    put(`G${r}`, "", { border: true });
    put(`H${r}`, "", { border: true });
    const lines = it.description.split("\n").reduce((sum, ln) => sum + Math.max(1, Math.ceil(ln.length / 30)), 0);
    ws.getRow(r).height = Math.max(15, lines * 13);
    r++;
  }

  // Empty rows
  for (let i = 0; i < Math.max(0, 3 - data.items.length); i++) {
    for (let c = 0; c < 8; c++) {
      put(`${String.fromCharCode(65 + c)}${r}`, "", { border: true });
    }
    ws.getRow(r).height = 20;
    r++;
  }

  r++;

  // Notes
  put(`A${r}:H${r}`, "-FOB DOST- Caraga CSU Campus, Ampayon", { size: 9 }); r++;
  put(`A${r}:H${r}`, "-VAT Inclusive", { size: 9 }); r++;
  r++;

  // Purpose & Fund Source
  put(`A${r}:H${r}`, { richText: [
    { font: { name: "Times New Roman", size: 10, bold: true }, text: "Purpose: " },
    { font: { name: "Times New Roman", size: 10 }, text: data.purpose },
  ] }, { wrap: true, border: true });
  ws.getRow(r).height = 30;
  r++;
  put(`A${r}:H${r}`, { richText: [
    { font: { name: "Times New Roman", size: 10, bold: true }, text: "Fund Source: " },
    { font: { name: "Times New Roman", size: 10 }, text: data.fundSource },
  ] }, { border: true });
  r += 2;

  // Bottom section
  put(`A${r}:D${r}`, "Procurement Unit/Canvasser", { bold: true, size: 10 });
  put(`E${r}:H${r}`, "Quotation Submitted by:", { bold: true, size: 10, align: "right" }); r++;
  put(`A${r}:D${r}`, data.canvasser, { size: 10 });
  r++;
  put(`A${r}:D${r}`, "BAC Action:", { bold: true, size: 10 });
  r++;
  put(`A${r}:D${r}`, data.bacAction, { size: 10 });

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
