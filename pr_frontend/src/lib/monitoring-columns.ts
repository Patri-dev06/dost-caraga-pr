// Shared column list for the Procurement Monitoring Sheet — one definition feeds both the
// on-screen table and its Excel export, so they can never drift apart.
//
// Phase 1 only wires up columns backed by real data (PR through PO approval). Everything past
// that — delivery, inspection & acceptance, issuance, payment — describes workflow stages the
// system doesn't track yet, so those columns are listed (matching the paper logbook exactly) but
// always render blank until that work is built. See the "Procurement Monitoring Sheet" plan for
// the full column-by-column mapping.

import type { MonitoringRow } from "@/lib/api";

function fmtDate(value: string | null): string {
  if (!value) return "";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "2-digit" });
}

function fmtAmount(value: number | null): string {
  if (value == null) return "";
  return value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export type MonitoringColumn = {
  label: string;
  get: (row: MonitoringRow) => string;
  tracked: boolean; // false = not built yet — the sheet still lists the column, always blank
};

const col = (label: string, get: (row: MonitoringRow) => string): MonitoringColumn => ({ label, get, tracked: true });
const pending = (label: string): MonitoringColumn => ({ label, get: () => "", tracked: false });

export const MONITORING_COLUMNS: MonitoringColumn[] = [
  col("DATE", (r) => fmtDate(r.date)),
  col("End User Unit / In-Charge", (r) => r.endUserUnit ?? ""),
  col("Charging", (r) => r.charging ?? ""),
  col("PR No.", (r) => r.prNo ?? ""),
  col("Description / Particulars", (r) => r.description ?? ""),
  col("Purpose", (r) => r.purpose ?? ""),
  col("Amount", (r) => fmtAmount(r.amount)),
  pending("SD Attached"),
  col("PR Signatories", (r) => r.prSignatories ?? ""),
  col("Remarks (if any)", (r) => r.prRemarks ?? ""),
  col("RFQ #", (r) => r.rfqNo ?? ""),
  col("RFQ Out for Signature", (r) => fmtDate(r.rfqOutForSignature)),
  col("RFQ IN with Signature", (r) => fmtDate(r.rfqInWithSignature)),
  col("RFQ Out", (r) => fmtDate(r.rfqOut)),
  col("Quotation Routed by", (r) => r.quotationRoutedBy ?? ""),
  col("IN with Quotation", (r) => fmtDate(r.inWithQuotation)),
  col("Suppliers", (r) => r.suppliers ?? ""),
  col("Remarks (if any)", (r) => r.rfqRemarks ?? ""),
  col("AOC Out", (r) => fmtDate(r.aocOut)),
  col("AOC IN with signature", (r) => fmtDate(r.aocInWithSignature)),
  col("BAC Member who signed", (r) => r.bacMemberWhoSigned ?? ""),
  col("Remarks (if any)", (r) => r.aocRemarks ?? ""),
  col("Supplier", (r) => r.awardedSupplier ?? ""),
  col("PO #", (r) => r.poNo ?? ""),
  col("Amount Awarded", (r) => fmtAmount(r.amountAwarded)),
  col("PO Out to BUDGET (MA'AM MATET- ACCTNG- ORD)", (r) => fmtDate(r.poOutToBudget)),
  col("Date & Time Received- Approved PO", (r) => fmtDate(r.poApprovedAt)),
  pending("Delivery term in calendar days"),
  pending("Remarks (if any)"),
  pending("ORS/BURS NO."),
  pending("Date / Time"),
  pending("By"),
  pending("Date Conformed"),
  pending("Date received by Supply Unit"),
  pending("Date Stamped Received by COA"),
  pending("Due date for Delivery"),
  pending("Remarks (if any)"),
  pending("No. of days before delivery due date"),
  pending("Date Delivered (Partial)"),
  pending("Date Delivered (Full)"),
  pending("Delivered with SOA / CI / DR ?"),
  pending("Actual Date SOA received"),
  pending("Actual No. of days delivered"),
  pending("Liquidated Damages"),
  pending("Remarks (if any)"),
  pending("IAR No."),
  pending("Inspection Report (OUT)"),
  pending("Inspection Report (IN)"),
  pending("Acceptance"),
  pending("Date Stamped Received by COA"),
  pending("Remarks (if any)"),
  pending("Issued to End User"),
  pending("Issuance Document"),
  pending("Accountable Officer"),
  pending("Remarks (if any)"),
  pending("For Payment Process (DV/ORS/BURS/TAX)"),
  pending("Date and Time (Prepared) MM/DD/YY"),
  pending("For Checking Sir Toto"),
  pending("Out for Payment MM/DD/YY"),
  pending("LIQUIDATED DAMAGES/ RETENTION FEE"),
  pending("REMARKS"),
];
