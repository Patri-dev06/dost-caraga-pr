// Shared column list for the Procurement Monitoring Sheet — one definition feeds the on-screen
// table, the Supply team's edit dialog and the Excel export, so they can never drift apart.
//
// Columns backed by real data (PR through PO approval, plus the supplier's conforme/waiver as
// recorded by the Supply team) are filled in by the system and read-only. The rest — ORS/BURS,
// delivery, inspection & acceptance, issuance, payment — are kept by hand by the Supply team; each
// has a key the backend validates against (pr_backend/app/Support/MonitoringFields.php).

import type { MonitoringRow } from "@/lib/api";

/** "YYYY-MM-DD" is read as a local calendar date (not UTC midnight), so it never shifts a day. */
function toDate(value: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(value);
}

function fmtDate(value: string | null | undefined): string {
  if (!value) return "";
  const d = toDate(value);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "2-digit" });
}

function fmtDateTime(value: string | null | undefined): string {
  if (!value) return "";
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleString("en-PH", { year: "numeric", month: "short", day: "2-digit", hour: "numeric", minute: "2-digit" });
}

function fmtAmount(value: number | null): string {
  if (value == null) return "";
  return value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export type MonitoringFieldType = "date" | "datetime" | "number" | "text";

export type MonitoringSection = "Purchase Request" | "Purchase Order" | "Delivery" | "Inspection & Acceptance" | "Issuance" | "Payment";

/** A column the Supply team fills in by hand. */
export type MonitoringField = {
  key: string;
  label: string;
  type: MonitoringFieldType;
  section: MonitoringSection;
};

export type MonitoringColumn = {
  label: string;
  get: (row: MonitoringRow) => string;
  field?: MonitoringField; // set = kept by hand (editable); unset = filled in by the system
};

const col = (label: string, get: (row: MonitoringRow) => string): MonitoringColumn => ({ label, get });

function manual(section: MonitoringSection, label: string, key: string, type: MonitoringFieldType = "text"): MonitoringColumn {
  const field: MonitoringField = { key, label, type, section };
  return {
    label,
    field,
    get: (row) => {
      const value = row.manual[key];
      if (value == null || value === "") return "";
      if (type === "date") return fmtDate(String(value));
      if (type === "datetime") return fmtDateTime(String(value));
      return String(value);
    },
  };
}

export const MONITORING_COLUMNS: MonitoringColumn[] = [
  col("DATE", (r) => fmtDate(r.date)),
  col("End User Unit / In-Charge", (r) => r.endUserUnit ?? ""),
  col("Charging", (r) => r.charging ?? ""),
  col("PR No.", (r) => r.prNo ?? ""),
  col("Description / Particulars", (r) => r.description ?? ""),
  col("Purpose", (r) => r.purpose ?? ""),
  col("Amount", (r) => fmtAmount(r.amount)),
  manual("Purchase Request", "SD Attached", "sd_attached"),
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
  manual("Purchase Order", "Delivery term in calendar days", "delivery_term_days", "number"),
  col("Remarks (if any)", (r) => r.poRemarks ?? ""),
  manual("Purchase Order", "ORS/BURS NO.", "ors_burs_no"),
  manual("Purchase Order", "Date / Time", "ors_burs_at", "datetime"),
  manual("Purchase Order", "By", "ors_burs_by"),
  // The supplier's conforme, recorded by the Supply team.
  col("Date Conformed", (r) => fmtDate(r.poConformedAt)),
  manual("Purchase Order", "Date received by Supply Unit", "received_by_supply_at", "date"),
  manual("Purchase Order", "Date Stamped Received by COA", "po_coa_received_at", "date"),
  manual("Purchase Order", "Due date for Delivery", "delivery_due_at", "date"),
  manual("Purchase Order", "Remarks (if any)", "po_receiving_remarks"),
  manual("Delivery", "No. of days before delivery due date", "days_before_due", "number"),
  manual("Delivery", "Date Delivered (Partial)", "delivered_partial_at", "date"),
  manual("Delivery", "Date Delivered (Full)", "delivered_full_at", "date"),
  manual("Delivery", "Delivered with SOA / CI / DR ?", "delivered_with_docs"),
  manual("Delivery", "Actual Date SOA received", "soa_received_at", "date"),
  manual("Delivery", "Actual No. of days delivered", "actual_days_delivered", "number"),
  manual("Delivery", "Liquidated Damages", "liquidated_damages"),
  manual("Delivery", "Remarks (if any)", "delivery_remarks"),
  manual("Inspection & Acceptance", "IAR No.", "iar_no"),
  manual("Inspection & Acceptance", "Inspection Report (OUT)", "inspection_out_at", "date"),
  manual("Inspection & Acceptance", "Inspection Report (IN)", "inspection_in_at", "date"),
  manual("Inspection & Acceptance", "Acceptance", "acceptance"),
  manual("Inspection & Acceptance", "Date Stamped Received by COA", "iar_coa_received_at", "date"),
  manual("Inspection & Acceptance", "Remarks (if any)", "inspection_remarks"),
  manual("Issuance", "Issued to End User", "issued_to_end_user_at", "date"),
  manual("Issuance", "Issuance Document", "issuance_document"),
  manual("Issuance", "Accountable Officer", "accountable_officer"),
  manual("Issuance", "Remarks (if any)", "issuance_remarks"),
  manual("Payment", "For Payment Process (DV/ORS/BURS/TAX)", "payment_process"),
  manual("Payment", "Date and Time (Prepared) MM/DD/YY", "payment_prepared_at", "datetime"),
  manual("Payment", "For Checking Sir Toto", "payment_checking_at", "date"),
  manual("Payment", "Out for Payment MM/DD/YY", "out_for_payment_at", "date"),
  manual("Payment", "LIQUIDATED DAMAGES/ RETENTION FEE", "retention_fee"),
  manual("Payment", "REMARKS", "final_remarks"),
];

/** The hand-kept columns, in sheet order — what the Supply team's edit dialog shows. */
export const MONITORING_FIELDS: MonitoringField[] = MONITORING_COLUMNS.flatMap((c) => (c.field ? [c.field] : []));
