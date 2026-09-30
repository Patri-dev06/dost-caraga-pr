// The official DOST Caraga RFQ form (DOST Caraga RFQ FORM OCTOBER 21, 2024): shared wording and
// helpers for the printed page (RfqDocument) and the Excel export, so the two never drift apart.

export const RFQ_FORM_CODE = "DOST Caraga RFQ FORM OCTOBER 21, 2024";

/** What the form asks for when the RFQ does not say otherwise (mirrors Rfq::DEFAULT_REQUIRED_DOCUMENTS). */
export const DEFAULT_RFQ_DOCUMENTS = ["Valid PhilGEPS Registration", "Valid Mayor's / Business Permit", "Tax Clearance Certificate"];

/** One-click choices for the documents the supplier submits with the quotation. */
export const COMMON_RFQ_DOCUMENTS = [
  "Valid PhilGEPS Registration",
  "Valid PhilGEPS Registration; Platinum Membership",
  "Valid Mayor's / Business Permit",
  "Tax Clearance Certificate",
  "Omnibus Sworn Statement (OSS)",
  "Income Tax Return",
  "Terms of Reference (TOR)",
];

export const DEFAULT_RFQ_NOTES = "FOB (for all items): DOST Caraga, CSU Campus, Ampayon, Butuan City\nVAT Inclusive for all items";

/**
 * The sentence after "opened on ___", as the form words it: no documents → just the deadline;
 * one document → named inline (e.g. the TOR); several → "the following documents, viz:" + a list.
 */
export function rfqDocumentsLead(documents: string[]): string {
  if (documents.length === 0) return "May we have your quotation on or before the scheduled opening of bids.";
  if (documents.length === 1) return `May we have your quotation on or before the scheduled opening of bids together with the ${documents[0]}.`;
  return "May we have your quotation on or before the scheduled opening of bids together with the following documents, viz:";
}

/** The numbered list lines: "1. A;", "2. B; and", "3. C" — only when there are two or more. */
export function rfqDocumentLines(documents: string[]): string[] {
  if (documents.length < 2) return [];
  return documents.map((d, i) => `${i + 1}. ${d}${i < documents.length - 2 ? ";" : i === documents.length - 2 ? "; and" : ""}`);
}

/** An item's first description line is its name (bold on the form); the rest are its specifications. */
export function splitRfqDescription(description: string): { name: string; specs: string[] } {
  const lines = description.split("\n").map((l) => l.trim()).filter(Boolean);
  return { name: lines[0] ?? "", specs: lines.slice(1) };
}

/** The form prints fewer items with blank ruled rows below them, like the paper form. */
export const RFQ_MIN_TABLE_ROWS = 10;
