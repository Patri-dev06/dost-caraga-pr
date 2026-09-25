// Where a PR is in the procurement flow — mirrors PurchaseRequest::STAGES on the backend, which
// the dashboard counts and the Monitoring Sheet's `stage` filter both use.
export const PR_STAGE_LABELS: Record<string, string> = {
  draft: "Draft",
  returned: "Returned",
  for_recommendation: "For Recommendation",
  for_approval: "For Approval",
  awaiting_rfq: "Approved, awaiting RFQ",
  rfq: "RFQ / Canvassing",
  aoc: "AOC / BAC Review",
  po: "PO Approval",
  with_supplier: "With Supplier",
  delivered: "Delivery Accepted",
  closed: "Cancelled / Rejected",
};
