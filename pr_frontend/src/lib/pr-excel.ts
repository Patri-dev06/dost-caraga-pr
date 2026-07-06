// Builds an .xlsx that mirrors the on-screen Purchase Request form preview:
// borderless title + entity/fund header, a bordered item grid, TOTAL row,
// purpose/charged-to block, and the three-column signatory block.

export interface PurchaseRequestExcelItem {
  stockNo?: string;
  unit: string;
  description: string; // full multi-line cell text (first line = item name)
  qty: number;
  unitCost: number;
}

export interface PurchaseRequestExcelData {
  entityName: string;
  fundCluster: string;
  officeName: string;
  prNo: string;
  date: string;
  rcc: string;
  fundSource: string; // "Charged to"
  purpose: string;
  items: PurchaseRequestExcelItem[];
  requestedByName: string;
  requestedByDesignation: string;
  recommendingName: string;
  recommendingDesignation: string;
  approvedByName: string;
  approvedByDesignation: string;
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

export async function exportPurchaseRequestExcel(data: PurchaseRequestExcelData, filename: string) {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Purchase Request", {
    views: [{ showGridLines: false }],
    pageSetup: { fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 } },
  });

  // Column widths (Excel char units) roughly matching the preview proportions.
  ws.columns = [{ width: 15 }, { width: 10 }, { width: 30 }, { width: 9 }, { width: 22 }, { width: 26 }];

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

  const label = (labelText: string, value: string) => ({
    richText: [
      { font: { name: "Times New Roman", size: 10, bold: true }, text: labelText },
      { font: { name: "Times New Roman", size: 10 }, text: value },
    ],
  });

  let r = 1;

  // Title (borderless)
  put(`A${r}:F${r}`, "PURCHASE REQUEST", { bold: true, size: 12, align: "center" });
  ws.getRow(r).height = 22;
  r++;

  // Entity Name / Fund Cluster (borderless)
  put(`A${r}:D${r}`, label("Entity Name:  ", data.entityName), { align: "left" });
  put(`E${r}:F${r}`, label("Fund Cluster:  ", data.fundCluster), { align: "left" });
  r++;

  // Office/Section | PR No. | Date  (box starts here)
  const officeRow = r;
  put(`A${r}:C${r}`, label("Office/Section :  ", data.officeName), { border: true });
  put(`D${r}:E${r}`, label("PR No.:  ", data.prNo), { border: true });
  put(`F${officeRow}:F${officeRow + 1}`, label("Date:  ", data.date), { border: true, vAlign: "top" });
  r++;
  // blank | Responsibility Center Code | (Date continues)
  put(`A${r}:C${r}`, "", { border: true });
  put(`D${r}:E${r}`, label("Responsibility Center Code :  ", data.rcc), { border: true });
  r++;

  // Item header
  const headers = ["Stock/ Property No.", "Unit", "Item Description", "Quantity", "Unit Cost", "Total Cost"];
  headers.forEach((h, i) => {
    const col = String.fromCharCode(65 + i);
    put(`${col}${r}`, h, { bold: true, align: "center", vAlign: "middle", wrap: true, border: true, fill: "FFF2F2F2" });
  });
  ws.getRow(r).height = 28;
  r++;

  // Item rows
  let grandTotal = 0;
  for (const it of data.items) {
    const total = it.qty * it.unitCost;
    grandTotal += total;
    put(`A${r}`, it.stockNo ?? "", { align: "center", vAlign: "top", border: true });
    put(`B${r}`, it.unit, { align: "center", vAlign: "top", border: true });
    put(`C${r}`, it.description, { align: "left", vAlign: "top", wrap: true, border: true });
    put(`D${r}`, it.qty || "", { align: "center", vAlign: "top", border: true });
    put(`E${r}`, it.unitCost || "", { align: "right", vAlign: "top", border: true, numFmt: "#,##0.00" });
    put(`F${r}`, total || "", { align: "right", vAlign: "top", border: true, numFmt: "#,##0.00" });
    // Estimate row height from wrapped description (~34 chars per line at width 30).
    const lines = it.description.split("\n").reduce((sum, ln) => sum + Math.max(1, Math.ceil(ln.length / 34)), 0);
    ws.getRow(r).height = Math.max(15, lines * 13);
    r++;
  }

  // TOTAL row
  put(`A${r}:D${r}`, "", { border: true });
  put(`E${r}`, "TOTAL", { bold: true, align: "center", border: true });
  put(`F${r}`, grandTotal || "", { bold: true, align: "right", border: true, numFmt: "#,##0.00" });
  r++;

  // Purpose / Charged to (single tall box)
  const purposeStart = r;
  const purposeEnd = r + 3;
  put(`A${purposeStart}:F${purposeEnd}`, {
    richText: [
      { font: { name: "Times New Roman", size: 10, bold: true }, text: "Purpose:  " },
      { font: { name: "Times New Roman", size: 10 }, text: `${data.purpose}\n\n` },
      { font: { name: "Times New Roman", size: 10, bold: true, italic: true }, text: "Charged to:  " },
      { font: { name: "Times New Roman", size: 10, italic: true }, text: data.fundSource },
    ],
  }, { align: "left", vAlign: "top", wrap: true, border: true });
  r = purposeEnd + 1;

  // Signatures — header
  put(`A${r}:B${r}`, "", { border: true });
  put(`C${r}`, "Requested by:", { border: true });
  put(`D${r}:E${r}`, "Recommending Approval:", { border: true });
  put(`F${r}`, "Approved by:", { border: true });
  r++;
  // Signature line (tall)
  put(`A${r}:B${r}`, "Signature :", { border: true, vAlign: "top" });
  put(`C${r}`, "", { border: true });
  put(`D${r}:E${r}`, "", { border: true });
  put(`F${r}`, "", { border: true });
  ws.getRow(r).height = 40;
  r++;
  // Printed Name
  put(`A${r}:B${r}`, "Printed Name :", { border: true, vAlign: "bottom" });
  put(`C${r}`, data.requestedByName, { bold: true, align: "center", vAlign: "bottom", wrap: true, border: true });
  put(`D${r}:E${r}`, data.recommendingName, { bold: true, align: "center", vAlign: "bottom", wrap: true, border: true });
  put(`F${r}`, data.approvedByName, { bold: true, align: "center", vAlign: "bottom", wrap: true, border: true });
  r++;
  // Designation
  put(`A${r}:B${r}`, "Designation :", { border: true, vAlign: "top" });
  put(`C${r}`, data.requestedByDesignation, { align: "center", vAlign: "top", border: true });
  put(`D${r}:E${r}`, data.recommendingDesignation, { align: "center", vAlign: "top", border: true });
  put(`F${r}`, data.approvedByDesignation, { align: "center", vAlign: "top", border: true });

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

// Default signatories / static header fields shared with the form (not persisted on the PR).
export const PR_FORM_DEFAULTS = {
  entityName: "DEPARTMENT OF SCIENCE AND TECHNOLOGY - CARAGA",
  fundCluster: "01",
  rcc: "",
  requestedByName: "JENIFER T. VILLAPLAZA",
  requestedByDesignation: "SRS II",
  recommendingName: "IMELDA S. MEZO",
  recommendingDesignation: "ARD-FAS",
  approvedByName: "ENGR. NOEL M. AJOC",
  approvedByDesignation: "Regional Director",
};
