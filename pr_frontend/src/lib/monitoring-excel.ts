import type { MonitoringRow } from "@/lib/api";
import { MONITORING_COLUMNS } from "@/lib/monitoring-columns";

/** Exports the Procurement Monitoring Sheet with every original logbook column, in order — the
 * system-filled ones and the Supply team's hand-kept ones alike, exactly as they render on screen. */
export async function exportMonitoringSheetExcel(rows: MonitoringRow[], filename: string) {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Monitoring Sheet", { views: [{ state: "frozen", ySplit: 1 }] });

  ws.columns = MONITORING_COLUMNS.map((c) => ({ header: c.label, key: c.label, width: 20 }));
  const headerRow = ws.getRow(1);
  headerRow.font = { bold: true };
  headerRow.alignment = { vertical: "middle", wrapText: true };
  headerRow.height = 32;

  for (const row of rows) {
    ws.addRow(MONITORING_COLUMNS.map((c) => c.get(row)));
  }

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
