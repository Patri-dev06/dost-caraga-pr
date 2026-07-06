// Builds a clean .xlsx of the DOST Form 4 Project Line-Item Budget matching the
// on-screen preview: centered header, label/value fields, an indented budget
// table with Approved LIB / First Reprogramming columns, totals, and signatories.

import { fmtAmount, libTotals, parseAmount, type LibDoc } from "@/lib/lib-store";

export async function exportLibExcel(doc: LibDoc) {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("LIB", {
    views: [{ showGridLines: false }],
    pageSetup: { fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.5, right: 0.5, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 } },
  });
  ws.columns = [{ width: 46 }, { width: 30 }, { width: 16 }, { width: 18 }];

  const font = (opts: { bold?: boolean; italic?: boolean; size?: number } = {}) => ({
    name: "Times New Roman",
    size: opts.size ?? 10,
    bold: opts.bold,
    italic: opts.italic,
  });

  let r = 1;
  const merge = (range: string) => ws.mergeCells(range);

  const center = (text: string, opts: { bold?: boolean; size?: number } = {}) => {
    merge(`A${r}:D${r}`);
    const c = ws.getCell(`A${r}`);
    c.value = text;
    c.font = font(opts);
    c.alignment = { horizontal: "center" };
    r++;
  };

  center("DEPARTMENT OF SCIENCE AND TECHNOLOGY", { bold: true, size: 11 });
  center("Project Line-Item Budget", { bold: true, size: 11 });
  center(`CY ${doc.fiscalYear}`, { bold: true, size: 11 });
  ws.getCell("D1").value = "DOST Form 4";
  ws.getCell("D1").font = font({ bold: true });
  ws.getCell("D1").alignment = { horizontal: "right" };
  r++;

  const field = (label: string, value: string) => {
    const c = ws.getCell(`A${r}`);
    c.value = { richText: [{ font: font({ bold: true }), text: `${label} :  ` }, { font: font(), text: value.replace(/\n/g, "; ") }] };
    c.alignment = { horizontal: "left", wrapText: true, vertical: "top" };
    merge(`A${r}:D${r}`);
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
  ws.getCell(`C${r}`).value = "Approved LIB";
  ws.getCell(`C${r}`).font = font({ bold: true });
  ws.getCell(`C${r}`).alignment = { horizontal: "right" };
  ws.getCell(`D${r}`).value = "First Reprogramming";
  ws.getCell(`D${r}`).font = font({ bold: true });
  ws.getCell(`D${r}`).alignment = { horizontal: "right" };
  r++;

  for (const row of doc.rows) {
    const label = ws.getCell(`A${r}`);
    label.value = row.label;
    label.font = font({ bold: row.header && row.indent === 0, italic: !row.header && row.indent === 2 });
    label.alignment = { horizontal: "left", indent: row.indent * 2, wrapText: true, vertical: "top" };

    if (row.note) {
      const note = ws.getCell(`B${r}`);
      note.value = row.note;
      note.font = font({ italic: true, size: 9 });
      note.alignment = { horizontal: "left", wrapText: true, vertical: "top" };
    }
    if (!row.header) {
      const a = ws.getCell(`C${r}`);
      a.value = parseAmount(row.approved) || null;
      a.numFmt = "#,##0.00";
      a.font = font();
      a.alignment = { horizontal: "right" };
      const b = ws.getCell(`D${r}`);
      b.value = parseAmount(row.reprogramming) || null;
      b.numFmt = "#,##0.00";
      b.font = font();
      b.alignment = { horizontal: "right" };
    }
    r++;
  }

  const totals = libTotals(doc.rows);
  const totalRow = (label: string, topBorder: boolean) => {
    const l = ws.getCell(`A${r}`);
    l.value = label;
    l.font = font({ bold: true });
    l.alignment = { horizontal: "left", indent: 4 };
    const a = ws.getCell(`C${r}`);
    a.value = `P  ${fmtAmount(totals.approved)}`;
    a.font = font({ bold: true });
    a.alignment = { horizontal: "right" };
    const b = ws.getCell(`D${r}`);
    b.value = fmtAmount(totals.reprogramming);
    b.font = font({ bold: true });
    b.alignment = { horizontal: "right" };
    if (topBorder) {
      const thin = { style: "thin" as const, color: { argb: "FF000000" } };
      a.border = { top: thin };
      b.border = { top: thin };
    }
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
