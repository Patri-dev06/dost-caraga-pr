import type { PurchaseOrder } from "@/lib/api";

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

export async function exportPurchaseOrderExcel(data: PurchaseOrder, filename: string) {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Purchase Order", {
    views: [{ showGridLines: false }],
    pageSetup: { fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.5, right: 0.5, top: 0.4, bottom: 0.4, header: 0.3, footer: 0.3 } },
  });

  ws.columns = [
    { width: 8 },   // A: Item No
    { width: 36 },  // B: Description
    { width: 10 },  // C: UOM
    { width: 8 },   // D: Qty
    { width: 13 },  // E: Unit Cost
    { width: 13 },  // F: Total
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
  put(`A${r}:F${r}`, "Republic of the Philippines", { italic: true, size: 10, align: "center" }); r++;
  put(`A${r}:F${r}`, "DEPARTMENT OF SCIENCE AND TECHNOLOGY", { bold: true, size: 11, align: "center" }); r++;
  put(`A${r}:F${r}`, "Caraga Regional Office No. 13", { size: 10, align: "center" }); r++;
  put(`A${r}:F${r}`, "CSU Campus, Ampayon, Butuan City", { size: 10, align: "center" }); r++;
  r++;

  // Title
  put(`A${r}:F${r}`, "PURCHASE ORDER", { bold: true, size: 14, align: "center" });
  ws.getRow(r).height = 22;
  r += 2;

  // Meta fields
  const metaFields: Array<[string, string]> = [
    ["PO No.:", data.poNo],
    ["PR No.:", data.prNo],
    ["RFQ No.:", data.rfqNo],
    ["PO Date:", data.poDate],
    ["Mode of Procurement:", data.modeOfProcurement],
    ["Delivery Date:", data.deliveryDate],
    ["Place of Delivery:", data.placeOfDelivery],
  ];
  for (const [label, value] of metaFields) {
    put(`A${r}:B${r}`, label, { align: "right", size: 10 });
    put(`C${r}:F${r}`, value, { bold: true, size: 10 });
    r++;
  }
  r++;

  // Supplier block
  put(`A${r}:F${r}`, "Supplier", { bold: true, size: 11 }); r++;
  put(`A${r}:B${r}`, "Name:", { align: "right", size: 10 });
  put(`C${r}:F${r}`, data.supplierName, { bold: true, size: 10 });
  r++;
  put(`A${r}:B${r}`, "Address:", { align: "right", size: 10 });
  put(`C${r}:F${r}`, data.supplierAddress, { size: 10 });
  r++;
  put(`A${r}:B${r}`, "Contact No.:", { align: "right", size: 10 });
  put(`C${r}:F${r}`, data.supplierContactNo, { size: 10 });
  r++;
  put(`A${r}:B${r}`, "TIN No.:", { align: "right", size: 10 });
  put(`C${r}:F${r}`, data.supplierTin, { size: 10 });
  r += 2;

  // Table header
  const headers = ["Item No.", "Description", "UOM", "Qty", "Unit Cost", "Total"];
  headers.forEach((h, i) => {
    const col = String.fromCharCode(65 + i);
    put(`${col}${r}`, h, { bold: true, size: 9, align: "center", vAlign: "middle", wrap: true, border: true, fill: "FFF2F2F2" });
  });
  ws.getRow(r).height = 22;
  r++;

  // Item rows
  for (const it of data.items) {
    put(`A${r}`, it.itemNo, { align: "center", vAlign: "top", border: true, bold: true });
    put(`B${r}`, it.description, { align: "left", vAlign: "top", wrap: true, border: true });
    put(`C${r}`, it.uom, { align: "center", vAlign: "top", border: true });
    put(`D${r}`, it.quantity || "", { align: "center", vAlign: "top", border: true });
    put(`E${r}`, it.unitCost || "", { align: "right", vAlign: "top", border: true, numFmt: "#,##0.00" });
    put(`F${r}`, it.totalCost || "", { align: "right", vAlign: "top", border: true, numFmt: "#,##0.00" });
    const lines = it.description.split("\n").reduce((sum, ln) => sum + Math.max(1, Math.ceil(ln.length / 30)), 0);
    ws.getRow(r).height = Math.max(15, lines * 13);
    r++;
  }

  // Grand total
  put(`A${r}:D${r}`, "", {});
  put(`E${r}`, "TOTAL", { bold: true, size: 10, align: "right", border: true });
  put(`F${r}`, data.items.reduce((sum, it) => sum + it.totalCost, 0), { bold: true, size: 10, align: "right", border: true, numFmt: "#,##0.00" });
  r += 2;

  // Terms & Conditions
  if (data.termsAndConditions) {
    put(`A${r}:F${r}`, { richText: [
      { font: { name: "Times New Roman", size: 10, bold: true }, text: "Terms & Conditions: " },
      { font: { name: "Times New Roman", size: 10 }, text: data.termsAndConditions },
    ] }, { wrap: true, border: true });
    ws.getRow(r).height = 30;
  }
  r += 2;

  // Prepared by
  if (data.preparedByName) {
    put(`A${r}:B${r}`, "Prepared by:", { align: "right", size: 10 });
    put(`C${r}:F${r}`, data.preparedByName, { bold: true, size: 10 });
    r++;
    if (data.preparedByPosition) put(`C${r}:F${r}`, data.preparedByPosition, { size: 10 });
  }

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
