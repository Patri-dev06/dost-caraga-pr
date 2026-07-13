// Builds a clean .xlsx of the DOST Form 4 Project Line-Item Budget matching the
// on-screen preview: centered header, label/value fields, an indented budget
// table with Approved LIB / (First…Third) Reprogramming columns, totals, and signatories.

import { fmtAmount, libTotals, maxRounds, parseAmount, reprogLabel, type LibDoc } from "@/lib/lib-store";

export async function exportLibExcel(doc: LibDoc) {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("LIB", {
    views: [{ showGridLines: false }],
    pageSetup: { fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.5, right: 0.5, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 } },
  });

  // Column layout: 1 label, 2 note, 3 approved, then one column per reprogramming
  // round, then (when there is at least one round) a justification column.
  const rounds = maxRounds(doc.rows);
  const approvedCol = 3;
  const roundCols = Array.from({ length: rounds }, (_, i) => approvedCol + 1 + i);
  const justCol = rounds > 0 ? approvedCol + 1 + rounds : 0;
  const lastCol = rounds > 0 ? justCol : approvedCol;

  ws.columns = [
    { width: 40 },
    { width: 22 },
    { width: 15 },
    ...roundCols.map(() => ({ width: 16 })),
    ...(rounds > 0 ? [{ width: 34 }] : []),
  ];

  const font = (opts: { bold?: boolean; italic?: boolean; size?: number } = {}) => ({
    name: "Times New Roman",
    size: opts.size ?? 10,
    bold: opts.bold,
    italic: opts.italic,
  });

  let r = 1;

  const center = (text: string, opts: { bold?: boolean; size?: number } = {}) => {
    ws.mergeCells(r, 1, r, lastCol);
    const c = ws.getCell(r, 1);
    c.value = text;
    c.font = font(opts);
    c.alignment = { horizontal: "center" };
    r++;
  };

  center("DOST Form 4", { bold: true });
  r++;
  center("DEPARTMENT OF SCIENCE AND TECHNOLOGY", { bold: true, size: 11 });
  center("Project Line-Item Budget", { bold: true, size: 11 });
  center(`CY ${doc.fiscalYear}`, { bold: true, size: 11 });
  r++;

  const field = (label: string, value: string) => {
    const c = ws.getCell(r, 1);
    c.value = { richText: [{ font: font({ bold: true }), text: `${label} :  ` }, { font: font(), text: value.replace(/\n/g, "; ") }] };
    c.alignment = { horizontal: "left", wrapText: true, vertical: "top" };
    ws.mergeCells(r, 1, r, lastCol);
    r++;
  };
  field("Program Title", doc.programTitle);
  field("Project Title", doc.projectTitle);
  field("Implementing Agency", doc.implementingAgency);
  field("Total Duration", doc.totalDuration);
  field("Cooperating Agency", doc.cooperatingAgency);
  field("Project Leader", doc.projectLeader);
  field("Monitoring Agency", doc.monitoringAgency);
  r++;

  // Column headers for the amount columns
  const approvedHeader = ws.getCell(r, approvedCol);
  approvedHeader.value = "Approved LIB";
  approvedHeader.font = font({ bold: true });
  approvedHeader.alignment = { horizontal: "right" };
  roundCols.forEach((col, i) => {
    const c = ws.getCell(r, col);
    c.value = reprogLabel(i);
    c.font = font({ bold: true });
    c.alignment = { horizontal: "center", wrapText: true };
  });
  if (rounds > 0) {
    const c = ws.getCell(r, justCol);
    c.value = "Justification";
    c.font = font({ bold: true });
    c.alignment = { horizontal: "left" };
  }
  r++;

  for (const row of doc.rows) {
    const label = ws.getCell(r, 1);
    label.value = row.label;
    label.font = font({ bold: row.header && row.indent === 0, italic: !row.header && row.indent === 2 });
    label.alignment = { horizontal: "left", indent: row.indent * 2, wrapText: true, vertical: "top" };

    if (row.note) {
      const note = ws.getCell(r, 2);
      note.value = row.note;
      note.font = font({ italic: true, size: 9 });
      note.alignment = { horizontal: "left", wrapText: true, vertical: "top" };
    }
    // Any row may carry an amount now (categories/titles included), so export them all.
    const a = ws.getCell(r, approvedCol);
    a.value = parseAmount(row.approved) || null;
    a.numFmt = "#,##0.00";
    a.font = font();
    a.alignment = { horizontal: "right" };
    roundCols.forEach((col, i) => {
      const b = ws.getCell(r, col);
      b.value = parseAmount(row.reprogrammings[i]?.amount ?? "") || null;
      b.numFmt = "#,##0.00";
      b.font = font();
      b.alignment = { horizontal: "right" };
    });
    const justification = row.reprogrammings[rounds - 1]?.justification ?? "";
    if (rounds > 0 && justification) {
      const j = ws.getCell(r, justCol);
      j.value = justification;
      j.font = font({ size: 9 });
      j.alignment = { horizontal: "left", wrapText: true, vertical: "top" };
    }
    r++;
  }

  const totals = libTotals(doc.rows);
  const thin = { style: "thin" as const, color: { argb: "FF000000" } };
  const totalRow = (label: string, topBorder: boolean) => {
    const l = ws.getCell(r, 1);
    l.value = label;
    l.font = font({ bold: true });
    l.alignment = { horizontal: "left", indent: 4 };
    const a = ws.getCell(r, approvedCol);
    a.value = `P  ${fmtAmount(totals.approved)}`;
    a.font = font({ bold: true });
    a.alignment = { horizontal: "right" };
    if (topBorder) a.border = { top: thin };
    roundCols.forEach((col, i) => {
      const b = ws.getCell(r, col);
      b.value = fmtAmount(totals.reprogrammings[i] ?? 0);
      b.font = font({ bold: true });
      b.alignment = { horizontal: "right" };
      if (topBorder) b.border = { top: thin };
    });
    r++;
  };
  totalRow("Sub-Total for MOOE", false);
  totalRow("GRAND TOTAL:", true);
  r++;

  const note = ws.getCell(`A${r}`);
  note.value = "(To be filled-up by DOST)";
  note.font = font({ bold: true, italic: true, size: 9 });
  r++;
  ws.getCell(`A${r}`).value = doc.chargeableNote;
  ws.getCell(`A${r}`).font = font({ size: 9 });
  r += 2;

  // Signatories (2 x 2)
  const sig = (col: "A" | "C", label: string, name: string, position: string, row: number) => {
    ws.getCell(`${col}${row}`).value = label;
    ws.getCell(`${col}${row}`).font = font({ size: 9 });
    ws.getCell(`${col}${row + 2}`).value = name;
    ws.getCell(`${col}${row + 2}`).font = font({ bold: true });
    ws.getCell(`${col}${row + 3}`).value = position;
    ws.getCell(`${col}${row + 3}`).font = font({ size: 9 });
  };
  sig("A", "Prepared by:", doc.preparedByName, doc.preparedByPosition, r);
  sig("C", "Recommending Approval:", doc.recommendingName, doc.recommendingPosition, r);
  r += 5;
  sig("A", "Certified Funds Available:", doc.certifiedName, doc.certifiedPosition, r);
  sig("C", "Approved by:", doc.approvedName, doc.approvedPosition, r);

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `LIB-${doc.fiscalYear}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
