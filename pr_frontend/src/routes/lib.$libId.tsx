import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, CheckCircle, XCircle, RotateCcw, Send, Edit3, Ban, Download } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader } from "@/components/app/page-header";
import { fmtPHP } from "@/lib/mock-data";
import { apiGetLibEntry, apiLibAction, apiGetLibBalance, apiExportLibEntry, type LibEntryRecord, type ApprovalStepRecord, type LibLineItemRecord } from "@/lib/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useState } from "react";

export const Route = createFileRoute("/lib/$libId")({
  head: () => ({ meta: [{ title: "LIB Detail — DOST Caraga" }] }),
  component: LibDetailPage,
});

const statusColors: Record<string, string> = {
  Draft: "bg-gray-100 text-gray-700",
  Submitted: "bg-blue-100 text-blue-700",
  Approved: "bg-green-100 text-green-700",
  Returned: "bg-yellow-100 text-yellow-700",
  Cancelled: "bg-red-100 text-red-700",
  Rejected: "bg-red-100 text-red-700",
};

function LibDetailPage() {
  const { libId } = Route.useParams();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["lib-entry", libId],
    queryFn: () => apiGetLibEntry(Number(libId)),
  });

  const { data: balance } = useQuery({
    queryKey: ["lib-balance", libId],
    queryFn: () => apiGetLibBalance(Number(libId)),
    enabled: !!data,
  });

  const actionMutation = useMutation({
    mutationFn: ({ action, payload }: { action: Parameters<typeof apiLibAction>[1]; payload?: { remarks?: string; reason?: string } }) =>
      apiLibAction(Number(libId), action, payload),
    onSuccess: (result) => {
      toast.success(result.message);
      queryClient.invalidateQueries({ queryKey: ["lib-entry", libId] });
      queryClient.invalidateQueries({ queryKey: ["lib-balance", libId] });
      queryClient.invalidateQueries({ queryKey: ["lib-entries"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const handleExport = async () => {
    try {
      const exportData = await apiExportLibEntry(Number(libId));
      await downloadAsExcel(exportData);
      toast.success("Excel file downloaded.");
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  if (isLoading || !data) return <div className="p-6 text-center text-muted-foreground">Loading...</div>;

  const entry = data.entry;
  const lineItems = data.lineItems ?? [];
  const trail = data.approvalTrail;

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <div className="flex items-center justify-between">
        <Link to="/lib"><Button variant="ghost" size="sm"><ArrowLeft className="mr-1.5 h-4 w-4" />Back to LIB</Button></Link>
        <Button variant="outline" size="sm" onClick={handleExport}><Download className="mr-1.5 h-4 w-4" />Export to Excel</Button>
      </div>

      <PageHeader eyebrow="Budget & Planning" title={`LIB: ${entry.accountCode}`} subtitle={entry.objectOfExpenditure} />

      <div className="grid grid-cols-3 gap-4">
        <StatCard label="Allocated" value={fmtPHP(entry.allocatedAmount)} />
        <StatCard label="Committed to PPMP" value={fmtPHP(balance ? balance.committed : entry.allocatedAmount - entry.availableAmount)} />
        <StatCard label="Available" value={fmtPHP(balance?.available ?? entry.availableAmount)} highlight />
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>DOST Form 4 — Project Information</CardTitle>
          <Badge className={statusColors[entry.status] ?? ""}>{entry.status} (v{entry.version})</Badge>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4 text-sm">
          <Detail label="Program Title" value={entry.programTitle} />
          <Detail label="Project" value={entry.projectTitle} />
          <Detail label="Implementing Agency" value={entry.implementingAgency} />
          <Detail label="Total Duration" value={entry.totalDuration} />
          <CooperatingAgencyDetail value={entry.cooperatingAgency} />
          <Detail label="Project Leader" value={entry.projectLeader} />
          <Detail label="Monitoring Agency" value={entry.monitoringAgency} />
          <Detail label="Fund Source" value={entry.fundSourceName} />
          <Detail label="Budget Year" value={String(entry.budgetYear)} />
          <Detail label="PAP Code" value={entry.papCode ?? "N/A"} />
          <Detail label="Account Code" value={entry.accountCode} />
          <Detail label="Object of Expenditure" value={entry.objectOfExpenditure} />
          <Detail label="Created By" value={entry.createdBy} />
          <Detail label="Approved At" value={entry.approvedAt ?? "Not yet"} />
          {entry.cancellationReason && <Detail label="Cancellation Reason" value={entry.cancellationReason} />}
        </CardContent>
      </Card>

      {lineItems.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Line Items &amp; Monthly Cash Program</CardTitle></CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[200px]">Item</TableHead>
                  <TableHead className="text-right">Approved LIB</TableHead>
                  <TableHead className="text-right">Jan</TableHead>
                  <TableHead className="text-right">Feb</TableHead>
                  <TableHead className="text-right">Mar</TableHead>
                  <TableHead className="text-right">Apr</TableHead>
                  <TableHead className="text-right">May</TableHead>
                  <TableHead className="text-right">Jun</TableHead>
                  <TableHead className="text-right">Jul</TableHead>
                  <TableHead className="text-right">Aug</TableHead>
                  <TableHead className="text-right">Sep</TableHead>
                  <TableHead className="text-right">Oct</TableHead>
                  <TableHead className="text-right">Nov</TableHead>
                  <TableHead className="text-right">Dec</TableHead>
                  <TableHead className="text-right font-bold">TOTAL</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lineItems.map((li) => (
                  <TableRow key={li.id}>
                    <TableCell className="text-xs">
                      <span className="font-medium">{li.specificItem || li.customItemName || li.subCategory}</span>
                      <span className="text-muted-foreground ml-1">({li.mainCategory === "Maintenance and Other Operating Expenses" ? "MOOE" : "CO"})</span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-xs">{fmtAmount(li.approvedLibAmount)}</TableCell>
                    <TableCell className="text-right tabular-nums text-xs">{fmtAmount(li.jan)}</TableCell>
                    <TableCell className="text-right tabular-nums text-xs">{fmtAmount(li.feb)}</TableCell>
                    <TableCell className="text-right tabular-nums text-xs">{fmtAmount(li.mar)}</TableCell>
                    <TableCell className="text-right tabular-nums text-xs">{fmtAmount(li.apr)}</TableCell>
                    <TableCell className="text-right tabular-nums text-xs">{fmtAmount(li.may)}</TableCell>
                    <TableCell className="text-right tabular-nums text-xs">{fmtAmount(li.jun)}</TableCell>
                    <TableCell className="text-right tabular-nums text-xs">{fmtAmount(li.jul)}</TableCell>
                    <TableCell className="text-right tabular-nums text-xs">{fmtAmount(li.aug)}</TableCell>
                    <TableCell className="text-right tabular-nums text-xs">{fmtAmount(li.sep)}</TableCell>
                    <TableCell className="text-right tabular-nums text-xs">{fmtAmount(li.oct)}</TableCell>
                    <TableCell className="text-right tabular-nums text-xs">{fmtAmount(li.nov)}</TableCell>
                    <TableCell className="text-right tabular-nums text-xs">{fmtAmount(li.decAmount)}</TableCell>
                    <TableCell className="text-right tabular-nums text-xs font-bold">{fmtAmount(li.total)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle>Actions</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {entry.status === "Draft" && (
            <Button size="sm" onClick={() => actionMutation.mutate({ action: "submit" })} disabled={actionMutation.isPending}>
              <Send className="mr-1.5 h-4 w-4" />Submit for Approval
            </Button>
          )}
          {entry.status === "Submitted" && (
            <>
              <Button size="sm" variant="default" onClick={() => actionMutation.mutate({ action: "approve" })} disabled={actionMutation.isPending}>
                <CheckCircle className="mr-1.5 h-4 w-4" />Approve
              </Button>
              <RemarksAction label="Return" icon={<RotateCcw className="mr-1.5 h-4 w-4" />} onSubmit={(remarks) => actionMutation.mutate({ action: "return", payload: { remarks } })} />
              <RemarksAction label="Reject" icon={<XCircle className="mr-1.5 h-4 w-4" />} variant="destructive" onSubmit={(remarks) => actionMutation.mutate({ action: "reject", payload: { remarks } })} />
            </>
          )}
          {entry.status === "Approved" && (
            <Button size="sm" variant="outline" onClick={() => actionMutation.mutate({ action: "amend" })} disabled={actionMutation.isPending}>
              <Edit3 className="mr-1.5 h-4 w-4" />Create Amendment
            </Button>
          )}
          {!["Cancelled", "Rejected"].includes(entry.status) && (
            <RemarksAction label="Cancel" icon={<Ban className="mr-1.5 h-4 w-4" />} variant="destructive" fieldLabel="Reason" onSubmit={(reason) => actionMutation.mutate({ action: "cancel", payload: { reason } })} />
          )}
        </CardContent>
      </Card>

      {trail.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Approval Trail</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Stage</TableHead>
                  <TableHead>Approver</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Remarks</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {trail.map((step) => (
                  <TableRow key={step.id}>
                    <TableCell>{step.stageName}</TableCell>
                    <TableCell>{step.approverName}</TableCell>
                    <TableCell><Badge variant="outline">{step.action}</Badge></TableCell>
                    <TableCell className="max-w-[200px] truncate">{step.remarks ?? "-"}</TableCell>
                    <TableCell className="text-xs">{step.actedAt ? new Date(step.actedAt).toLocaleString("en-PH") : "-"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function StatCard({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <Card className={highlight ? "border-green-200 bg-green-50" : ""}>
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground uppercase tracking-wide">{label}</p>
        <p className={`text-lg font-bold tabular-nums ${highlight ? "text-green-700" : "text-navy"}`}>{value}</p>
      </CardContent>
    </Card>
  );
}

function Detail({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-medium">{value ?? "N/A"}</p>
    </div>
  );
}

function CooperatingAgencyDetail({ value }: { value: string | null | undefined }) {
  if (!value) return <Detail label="Cooperating Agency" value="N/A" />;
  const agencies = value.split("\n").filter(Boolean);
  return (
    <div>
      <p className="text-xs text-muted-foreground">Cooperating Agency</p>
      {agencies.map((agency, idx) => (
        <p key={idx} className="font-medium">{agency}</p>
      ))}
    </div>
  );
}

function fmtAmount(value: number) {
  if (!value) return "-";
  return new Intl.NumberFormat("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
}

async function downloadAsExcel(exportData: { entry: LibEntryRecord; lineItems: LibLineItemRecord[]; summary: { mooe_subtotal: number; capital_subtotal: number; grand_total: number; approved_lib_total: number } }) {
  const ExcelJS = await import("exceljs");
  const { saveAs } = await import("file-saver");
  const { DOST_LOGO_BASE64 } = await import("@/lib/dost-logo-base64");
  const { entry, lineItems, summary } = exportData;
  const monthKeys = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "decAmount"] as const;

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(`${entry.budgetYear} LIB`);

  const FONT_DEFAULT = { name: "Arial", size: 11 } as const;
  const FONT_BOLD = { name: "Arial", size: 11, bold: true } as const;
  const FONT_UNDERLINE = { name: "Arial", size: 11, underline: true } as const;
  const FONT_ITALIC = { name: "Arial", size: 11, italic: true } as const;
  const FONT_BOLD_ITALIC = { name: "Arial", size: 11, bold: true, italic: true } as const;
  const FONT_MCP = { name: "Arial", size: 10 } as const;
  const FONT_MCP_BOLD = { name: "Arial", size: 10, bold: true } as const;
  const NUM_FMT_CURRENCY = "#,##0.00";
  const ALIGN_TOP = { vertical: "top" as const };
  const ALIGN_CENTER_TOP = { horizontal: "center" as const, vertical: "top" as const };
  const ALIGN_LEFT_TOP = { horizontal: "left" as const, vertical: "top" as const };
  const ALIGN_RIGHT_TOP = { horizontal: "right" as const, vertical: "top" as const };

  // Column widths (matching reference exactly)
  ws.columns = [
    { width: 2.75 },   // A
    { width: 13.0 },   // B
    { width: 15.88 },  // C
    { width: 1.88 },   // D
    { width: 6.75 },   // E
    { width: 51.38 },  // F
    { width: 3.13 },   // G
    { width: 27.75 },  // H
    { width: 3.88 },   // I
    { width: 13.0 },   // J
    { width: 12.0 },   // K
    { width: 13.0 },   // L
    { width: 13.0 },   // M
    { width: 13.0 },   // N
    { width: 13.0 },   // O
    { width: 13.0 },   // P
    { width: 13.0 },   // Q
    { width: 13.0 },   // R
    { width: 13.0 },   // S
    { width: 13.0 },   // T
    { width: 13.0 },   // U
    { width: 13.0 },   // V
    { width: 12.75 },  // W
    { width: 13.0 },   // X
    { width: 13.0 },   // Y
  ];

  // Add logo image
  const logoId = wb.addImage({ base64: DOST_LOGO_BASE64, extension: "png" });
  ws.addImage(logoId, {
    tl: { col: 0.1, row: 0.6 },
    ext: { width: 81, height: 77 },
  });

  // Row 1: DOST Form 4
  ws.getRow(1).height = 16.5;
  ws.mergeCells("A1:H1");
  const cellA1 = ws.getCell("A1");
  cellA1.value = "DOST Form 4";
  cellA1.font = FONT_BOLD;
  cellA1.alignment = ALIGN_CENTER_TOP;

  // Row 2: spacer
  ws.getRow(2).height = 9.75;

  // Row 3: DEPARTMENT OF SCIENCE AND TECHNOLOGY
  ws.getRow(3).height = 16.5;
  ws.mergeCells("A3:H3");
  const cellA3 = ws.getCell("A3");
  cellA3.value = "          DEPARTMENT OF SCIENCE AND TECHNOLOGY";
  cellA3.font = FONT_BOLD;
  cellA3.alignment = ALIGN_CENTER_TOP;

  // Row 4: Project Line-Item Budget
  ws.getRow(4).height = 16.5;
  ws.mergeCells("A4:H4");
  const cellA4 = ws.getCell("A4");
  cellA4.value = "Project Line-Item Budget";
  cellA4.font = FONT_BOLD;
  cellA4.alignment = ALIGN_CENTER_TOP;

  // Row 5: CY year
  ws.getRow(5).height = 16.5;
  ws.mergeCells("A5:H5");
  const cellA5 = ws.getCell("A5");
  cellA5.value = `CY ${entry.budgetYear}`;
  cellA5.font = FONT_BOLD;
  cellA5.alignment = ALIGN_CENTER_TOP;

  // Row 6: spacer
  ws.getRow(6).height = 14.25;

  // Row 7: Program Title
  ws.getRow(7).height = 15.75;
  ws.getCell("A7").value = "Program Title";
  ws.getCell("A7").font = FONT_BOLD;
  ws.getCell("A7").alignment = ALIGN_LEFT_TOP;
  ws.getCell("D7").value = ":";
  ws.getCell("D7").font = FONT_DEFAULT;
  ws.getCell("D7").alignment = ALIGN_CENTER_TOP;
  ws.mergeCells("E7:H7");
  ws.getCell("E7").value = entry.programTitle ?? "";
  ws.getCell("E7").font = FONT_DEFAULT;
  ws.getCell("E7").alignment = ALIGN_LEFT_TOP;

  // Row 8: Project Title
  ws.getRow(8).height = 27.75;
  ws.getCell("A8").value = "Project Title";
  ws.getCell("A8").font = FONT_DEFAULT;
  ws.getCell("A8").alignment = ALIGN_TOP;
  ws.getCell("D8").value = ":";
  ws.getCell("D8").font = FONT_DEFAULT;
  ws.getCell("D8").alignment = ALIGN_CENTER_TOP;
  ws.mergeCells("E8:Y8");
  ws.getCell("E8").value = entry.projectTitle ?? "";
  ws.getCell("E8").font = FONT_DEFAULT;
  ws.getCell("E8").alignment = ALIGN_LEFT_TOP;

  // Row 9: (continuation of project title if needed)
  ws.getRow(9).height = 14.25;
  ws.getCell("D9").value = ":";
  ws.getCell("D9").font = FONT_DEFAULT;
  ws.getCell("D9").alignment = ALIGN_CENTER_TOP;
  ws.mergeCells("E9:H9");

  // Row 10: Implementing Agency
  ws.getRow(10).height = 16.5;
  ws.getCell("A10").value = "Implementing Agency";
  ws.getCell("A10").font = FONT_DEFAULT;
  ws.getCell("A10").alignment = ALIGN_TOP;
  ws.getCell("D10").value = ":";
  ws.getCell("D10").font = FONT_DEFAULT;
  ws.getCell("D10").alignment = ALIGN_CENTER_TOP;
  ws.mergeCells("E10:H10");
  ws.getCell("E10").value = entry.implementingAgency ?? "";
  ws.getCell("E10").font = FONT_DEFAULT;
  ws.getCell("E10").alignment = ALIGN_TOP;

  // Row 11: Total Duration
  ws.getRow(11).height = 16.5;
  ws.getCell("A11").value = "Total Duration";
  ws.getCell("A11").font = FONT_DEFAULT;
  ws.getCell("A11").alignment = ALIGN_TOP;
  ws.getCell("D11").value = ":";
  ws.getCell("D11").font = FONT_DEFAULT;
  ws.getCell("D11").alignment = ALIGN_CENTER_TOP;
  ws.getCell("E11").value = entry.totalDuration ?? "";
  ws.getCell("E11").font = FONT_DEFAULT;
  ws.getCell("E11").alignment = ALIGN_TOP;

  // Row 12-16: Cooperating Agency (multiple agencies on separate rows)
  ws.getRow(12).height = 15.0;
  ws.getCell("A12").value = "Cooperating Agency";
  ws.getCell("A12").font = FONT_DEFAULT;
  ws.getCell("A12").alignment = ALIGN_TOP;
  ws.getCell("D12").value = ":";
  ws.getCell("D12").font = FONT_DEFAULT;
  ws.getCell("D12").alignment = ALIGN_CENTER_TOP;

  const cooperatingAgencies = (entry.cooperatingAgency ?? "").split("\n").filter(Boolean);
  if (cooperatingAgencies.length > 0) {
    ws.getCell("E12").value = cooperatingAgencies[0];
    ws.getCell("E12").font = FONT_DEFAULT;
  }
  for (let r = 13; r <= 16; r++) {
    ws.getRow(r).height = 15.0;
    ws.mergeCells(`E${r}:F${r}`);
    const agencyIdx = r - 12;
    if (agencyIdx < cooperatingAgencies.length) {
      ws.getCell(`E${r}`).value = cooperatingAgencies[agencyIdx];
      ws.getCell(`E${r}`).font = FONT_DEFAULT;
    }
  }

  // Row 17: Project Leader
  ws.getRow(17).height = 16.5;
  ws.getCell("A17").value = "Project Leader";
  ws.getCell("A17").font = FONT_DEFAULT;
  ws.getCell("A17").alignment = ALIGN_TOP;
  ws.getCell("D17").value = ":";
  ws.getCell("D17").font = FONT_DEFAULT;
  ws.getCell("D17").alignment = ALIGN_CENTER_TOP;
  ws.getCell("E17").value = entry.projectLeader ?? "";
  ws.getCell("E17").font = FONT_DEFAULT;
  ws.getCell("E17").alignment = ALIGN_TOP;

  // Row 18: Monitoring Agency
  ws.getRow(18).height = 16.5;
  ws.getCell("A18").value = "Monitoring Agency";
  ws.getCell("A18").font = FONT_DEFAULT;
  ws.getCell("A18").alignment = ALIGN_TOP;
  ws.getCell("D18").value = ":";
  ws.getCell("D18").font = FONT_DEFAULT;
  ws.getCell("D18").alignment = ALIGN_CENTER_TOP;
  ws.getCell("E18").value = entry.monitoringAgency ?? "";
  ws.getCell("E18").font = FONT_DEFAULT;
  ws.getCell("E18").alignment = ALIGN_TOP;

  // Row 19: MCP label
  ws.getCell("K19").value = "MCP";
  ws.getCell("K19").font = FONT_MCP_BOLD;
  ws.getCell("K19").alignment = ALIGN_LEFT_TOP;

  // Row 20: Column headers
  ws.getCell("H20").value = "Approved LIB";
  ws.getCell("H20").font = FONT_BOLD;
  ws.getCell("H20").alignment = ALIGN_RIGHT_TOP;
  const monthLabels = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  for (let i = 0; i < 12; i++) {
    const col = String.fromCharCode(75 + i); // K=75 in ASCII
    const cell = ws.getCell(`${col}20`);
    cell.value = monthLabels[i];
    cell.font = FONT_MCP_BOLD;
    cell.alignment = ALIGN_CENTER_TOP;
  }
  ws.getCell("W20").value = "TOTAL";
  ws.getCell("W20").font = FONT_MCP_BOLD;
  ws.getCell("W20").alignment = ALIGN_CENTER_TOP;

  // Line items start at row 21
  let currentRow = 21;

  const mooeItems = lineItems.filter((li) => li.mainCategory === "Maintenance and Other Operating Expenses");
  const capitalItems = lineItems.filter((li) => li.mainCategory === "Capital Outlay");

  function setMonthValues(row: number, li: LibLineItemRecord) {
    for (let m = 0; m < 12; m++) {
      const val = li[monthKeys[m]];
      if (val) {
        const col = String.fromCharCode(75 + m);
        const cell = ws.getCell(`${col}${row}`);
        cell.value = val;
        cell.font = FONT_MCP;
        cell.alignment = ALIGN_LEFT_TOP;
      }
    }
    const totalCell = ws.getCell(`W${row}`);
    totalCell.value = { formula: `SUM(K${row}:V${row})` };
    totalCell.font = FONT_MCP;
    totalCell.alignment = ALIGN_TOP;
  }

  // I. MOOE Section header
  ws.getRow(currentRow).height = 16.5;
  ws.getCell(`A${currentRow}`).value = "I.";
  ws.getCell(`A${currentRow}`).font = FONT_BOLD;
  ws.getCell(`A${currentRow}`).alignment = ALIGN_TOP;
  ws.getCell(`B${currentRow}`).value = "Maintenance and Other Operating Expenses";
  ws.getCell(`B${currentRow}`).font = FONT_BOLD;
  ws.getCell(`B${currentRow}`).alignment = ALIGN_TOP;
  ws.getCell(`W${currentRow}`).value = { formula: `SUM(K${currentRow}:V${currentRow})` };
  ws.getCell(`W${currentRow}`).font = FONT_MCP;
  currentRow++;

  let lastSubCategory = "";
  for (const li of mooeItems) {
    if (li.subCategory !== lastSubCategory) {
      lastSubCategory = li.subCategory;
      if (li.specificItem || li.customItemName) {
        // Sub-category header without amounts (underlined)
        ws.getRow(currentRow).height = 15.0;
        ws.getCell(`B${currentRow}`).value = li.subCategory;
        ws.getCell(`B${currentRow}`).font = FONT_UNDERLINE;
        ws.getCell(`B${currentRow}`).alignment = ALIGN_TOP;
        ws.getCell(`W${currentRow}`).value = { formula: `SUM(K${currentRow}:V${currentRow})` };
        ws.getCell(`W${currentRow}`).font = FONT_MCP;
        currentRow++;
      } else {
        // Sub-category that IS the item (e.g., Traveling Expenses) — underlined
        ws.getRow(currentRow).height = 15.0;
        ws.getCell(`B${currentRow}`).value = li.subCategory;
        ws.getCell(`B${currentRow}`).font = FONT_UNDERLINE;
        ws.getCell(`B${currentRow}`).alignment = ALIGN_TOP;
        if (li.approvedLibAmount) {
          ws.getCell(`H${currentRow}`).value = li.approvedLibAmount;
          ws.getCell(`H${currentRow}`).font = FONT_DEFAULT;
          ws.getCell(`H${currentRow}`).alignment = ALIGN_RIGHT_TOP;
          ws.getCell(`H${currentRow}`).numFmt = NUM_FMT_CURRENCY;
        }
        setMonthValues(currentRow, li);
        currentRow++;
        continue;
      }
    }

    // Specific/custom item row (indented in column C, italic)
    ws.getRow(currentRow).height = 15.0;
    const itemName = li.specificItem || li.customItemName || li.subCategory;
    if (li.specificItem || li.customItemName) {
      ws.getCell(`C${currentRow}`).value = itemName;
      ws.getCell(`C${currentRow}`).font = FONT_ITALIC;
      ws.getCell(`C${currentRow}`).alignment = ALIGN_LEFT_TOP;
    } else {
      ws.getCell(`B${currentRow}`).value = itemName;
      ws.getCell(`B${currentRow}`).font = FONT_DEFAULT;
      ws.getCell(`B${currentRow}`).alignment = ALIGN_TOP;
    }
    if (li.approvedLibAmount) {
      ws.getCell(`H${currentRow}`).value = li.approvedLibAmount;
      ws.getCell(`H${currentRow}`).font = FONT_DEFAULT;
      ws.getCell(`H${currentRow}`).alignment = ALIGN_RIGHT_TOP;
      ws.getCell(`H${currentRow}`).numFmt = NUM_FMT_CURRENCY;
    }
    setMonthValues(currentRow, li);
    currentRow++;
  }

  // Sub-Total for MOOE
  const mooeSubRow = currentRow;
  ws.getRow(mooeSubRow).height = 15.0;
  ws.mergeCells(`B${mooeSubRow}:E${mooeSubRow}`);
  ws.getCell(`B${mooeSubRow}`).value = "Sub-Total for MOOE";
  ws.getCell(`B${mooeSubRow}`).font = FONT_BOLD;
  ws.getCell(`B${mooeSubRow}`).alignment = ALIGN_RIGHT_TOP;
  ws.getCell(`G${mooeSubRow}`).value = "P";
  ws.getCell(`G${mooeSubRow}`).font = FONT_BOLD;
  ws.getCell(`G${mooeSubRow}`).alignment = ALIGN_RIGHT_TOP;
  ws.getCell(`H${mooeSubRow}`).value = summary.mooe_subtotal || 0;
  ws.getCell(`H${mooeSubRow}`).font = FONT_BOLD;
  ws.getCell(`H${mooeSubRow}`).alignment = ALIGN_RIGHT_TOP;
  ws.getCell(`H${mooeSubRow}`).numFmt = NUM_FMT_CURRENCY;
  ws.getCell(`W${mooeSubRow}`).value = { formula: `SUM(K${mooeSubRow}:V${mooeSubRow})` };
  ws.getCell(`W${mooeSubRow}`).font = FONT_MCP;
  currentRow += 2;

  // III. Capital / Equipment Outlay — only render if there are capital items
  if (capitalItems.length > 0) {
    ws.getRow(currentRow).height = 16.5;
    ws.getCell(`A${currentRow}`).value = "III.";
    ws.getCell(`A${currentRow}`).font = FONT_BOLD;
    ws.getCell(`A${currentRow}`).alignment = ALIGN_TOP;
    ws.getCell(`B${currentRow}`).value = "Capital / Equipment Outlay";
    ws.getCell(`B${currentRow}`).font = FONT_BOLD;
    ws.getCell(`B${currentRow}`).alignment = ALIGN_TOP;
    currentRow++;

    for (const li of capitalItems) {
      ws.getRow(currentRow).height = 16.5;
      const itemName = li.specificItem || li.customItemName || li.subCategory;
      ws.getCell(`B${currentRow}`).value = itemName;
      ws.getCell(`B${currentRow}`).font = FONT_DEFAULT;
      ws.getCell(`B${currentRow}`).alignment = ALIGN_TOP;
      if (li.approvedLibAmount) {
        ws.getCell(`H${currentRow}`).value = li.approvedLibAmount;
        ws.getCell(`H${currentRow}`).font = FONT_DEFAULT;
        ws.getCell(`H${currentRow}`).alignment = ALIGN_RIGHT_TOP;
        ws.getCell(`H${currentRow}`).numFmt = NUM_FMT_CURRENCY;
      }
      setMonthValues(currentRow, li);
      currentRow++;
    }

    // Sub-Total for EO
    const eoSubRow = currentRow;
    ws.getRow(eoSubRow).height = 13.5;
    ws.mergeCells(`B${eoSubRow}:E${eoSubRow}`);
    ws.getCell(`B${eoSubRow}`).value = "Sub-Total for EO";
    ws.getCell(`B${eoSubRow}`).font = FONT_BOLD;
    ws.getCell(`B${eoSubRow}`).alignment = ALIGN_RIGHT_TOP;
    ws.getCell(`F${eoSubRow}`).value = "P";
    ws.getCell(`F${eoSubRow}`).font = FONT_BOLD;
    ws.getCell(`F${eoSubRow}`).alignment = ALIGN_RIGHT_TOP;
    ws.getCell(`H${eoSubRow}`).value = summary.capital_subtotal || 0;
    ws.getCell(`H${eoSubRow}`).font = FONT_BOLD;
    ws.getCell(`H${eoSubRow}`).alignment = ALIGN_RIGHT_TOP;
    ws.getCell(`H${eoSubRow}`).numFmt = NUM_FMT_CURRENCY;
    currentRow++;
  }

  // Spacer row
  ws.getRow(currentRow).height = 3.0;
  currentRow++;

  // GRAND TOTAL
  const grandRow = currentRow;
  ws.getRow(grandRow).height = 18.0;
  ws.mergeCells(`B${grandRow}:E${grandRow}`);
  ws.getCell(`B${grandRow}`).value = "GRAND TOTAL";
  ws.getCell(`B${grandRow}`).font = FONT_BOLD;
  ws.getCell(`B${grandRow}`).alignment = ALIGN_RIGHT_TOP;
  ws.getCell(`G${grandRow}`).value = "P";
  ws.getCell(`G${grandRow}`).font = FONT_BOLD;
  ws.getCell(`G${grandRow}`).alignment = ALIGN_RIGHT_TOP;
  ws.getCell(`H${grandRow}`).value = summary.approved_lib_total || 0;
  ws.getCell(`H${grandRow}`).font = FONT_BOLD;
  ws.getCell(`H${grandRow}`).alignment = ALIGN_RIGHT_TOP;
  ws.getCell(`H${grandRow}`).numFmt = NUM_FMT_CURRENCY;
  ws.getCell(`W${grandRow}`).value = { formula: `SUM(W21:W${grandRow - 1})` };
  ws.getCell(`W${grandRow}`).font = FONT_MCP_BOLD;
  ws.getCell(`W${grandRow}`).alignment = ALIGN_TOP;
  currentRow++;

  // Spacer
  ws.getRow(currentRow).height = 6.75;
  currentRow++;
  ws.getRow(currentRow).height = 5.25;
  currentRow++;

  // "(To be filled-up by DOST)" and chargeable note
  ws.getCell(`A${currentRow}`).value = "(To be filled-up by DOST)";
  ws.getCell(`A${currentRow}`).font = FONT_BOLD_ITALIC;
  ws.getCell(`A${currentRow}`).alignment = ALIGN_TOP;
  ws.getRow(currentRow).height = 16.5;
  currentRow++;

  ws.getCell(`A${currentRow}`).value = "*";
  ws.getCell(`A${currentRow}`).font = FONT_DEFAULT;
  ws.getCell(`A${currentRow}`).alignment = ALIGN_RIGHT_TOP;
  ws.getCell(`B${currentRow}`).value = `Chargeable against the CY ${entry.budgetYear} DOST Caraga Local GIA`;
  ws.getCell(`B${currentRow}`).font = FONT_DEFAULT;
  ws.getCell(`B${currentRow}`).alignment = ALIGN_TOP;
  ws.getRow(currentRow).height = 16.5;
  currentRow++;

  // Spacer rows
  ws.getRow(currentRow).height = 14.25;
  currentRow++;
  ws.getRow(currentRow).height = 12.75;
  currentRow++;

  // Signatories - Row 58 equivalent
  const sigRow1 = currentRow;
  ws.getCell(`A${sigRow1}`).value = "Prepared by:";
  ws.getCell(`A${sigRow1}`).font = FONT_DEFAULT;
  ws.getCell(`A${sigRow1}`).alignment = ALIGN_TOP;
  ws.getCell(`G${sigRow1}`).value = "Recommending Approval:";
  ws.getCell(`G${sigRow1}`).font = FONT_DEFAULT;
  ws.getCell(`G${sigRow1}`).alignment = ALIGN_TOP;
  ws.getRow(sigRow1).height = 16.5;
  currentRow++;

  // Spacer rows for signature space
  ws.getRow(currentRow).height = 12.0;
  currentRow++;
  ws.getRow(currentRow).height = 10.5;
  currentRow++;

  // Name lines
  const nameRow1 = currentRow;
  ws.getCell(`A${nameRow1}`).value = entry.projectLeader?.toUpperCase() ?? "";
  ws.getCell(`A${nameRow1}`).font = FONT_BOLD;
  ws.getCell(`A${nameRow1}`).alignment = ALIGN_TOP;
  ws.getRow(nameRow1).height = 16.5;
  currentRow++;

  // Title/position line
  ws.getRow(currentRow).height = 16.5;
  currentRow++;

  // Spacer
  ws.getRow(currentRow).height = 16.5;
  currentRow++;
  ws.getRow(currentRow).height = 16.5;
  currentRow++;

  // Second row of signatories
  const sigRow2 = currentRow;
  ws.getCell(`A${sigRow2}`).value = "Certified Funds Available:";
  ws.getCell(`A${sigRow2}`).font = FONT_DEFAULT;
  ws.getCell(`A${sigRow2}`).alignment = ALIGN_LEFT_TOP;
  ws.getCell(`G${sigRow2}`).value = "Approved by:";
  ws.getCell(`G${sigRow2}`).font = FONT_DEFAULT;
  ws.getCell(`G${sigRow2}`).alignment = ALIGN_LEFT_TOP;
  ws.getRow(sigRow2).height = 16.5;
  currentRow++;

  // Spacer for signature space
  ws.getRow(currentRow).height = 10.5;
  currentRow++;
  ws.getRow(currentRow).height = 11.25;
  currentRow++;

  // Second name lines (budget officer / regional director)
  ws.getRow(currentRow).height = 16.5;
  currentRow++;
  ws.getRow(currentRow).height = 16.5;

  // Generate and download
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  saveAs(blob, `DOST_Form4_LIB_${entry.accountCode}_${entry.budgetYear}.xlsx`);
}

function RemarksAction({ label, icon, variant = "outline", fieldLabel = "Remarks", onSubmit }: { label: string; icon: React.ReactNode; variant?: "outline" | "destructive"; fieldLabel?: string; onSubmit: (value: string) => void }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant={variant}>{icon}{label}</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>{label}</DialogTitle></DialogHeader>
        <div className="space-y-2">
          <label className="text-sm font-medium">{fieldLabel}</label>
          <Textarea value={value} onChange={(e) => setValue(e.target.value)} placeholder={`Enter ${fieldLabel.toLowerCase()}...`} />
        </div>
        <DialogFooter>
          <Button variant={variant === "destructive" ? "destructive" : "default"} disabled={!value.trim()} onClick={() => { onSubmit(value.trim()); setOpen(false); setValue(""); }}>
            Confirm {label}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
