export type PRStatus =
  | "Draft"
  | "Pending Validation"
  | "For Recommendation"
  | "For Approval"
  | "Approved"
  | "Returned"
  | "Rejected";

export type ValidationStatus = "Passed" | "Failed" | "Warning" | "N/A";

export interface PRItem {
  id: string;
  name: string;
  description: string;
  uom: string;
  qty: number;
  unitCost: number;
}

export interface ValidationCheck {
  label: string;
  status: ValidationStatus;
  message: string;
}

export interface PurchaseRequest {
  id: string;
  prNo: string;
  office: string;
  fundSource: string;
  fundType: "GAA" | "Trust" | "Special";
  amount: number;
  status: PRStatus;
  dateSubmitted: string;
  requestedBy: string;
  requestedByPosition?: string; // the requester's position, for the form's Designation line
  modeOfProcurement: string;
  projectTitle: string;
  purpose: string;
  items: PRItem[];
  stage: string;
}

export const purchaseRequests: PurchaseRequest[] = [
  {
    id: "pr-001", prNo: "PR-2026-0142", office: "Regional Office",
    fundSource: "GAA 2026 - MOOE", fundType: "GAA", amount: 184500,
    status: "For Approval", dateSubmitted: "2026-04-28",
    requestedBy: "M. Dela Cruz", modeOfProcurement: "Shopping",
    projectTitle: "Office Productivity Upgrade", stage: "Director Approval",
    purpose: "Replacement of unserviceable office equipment for the Administrative Division.",
    items: [
      { id: "i1", name: "Laptop, Business Class", description: "i7, 16GB RAM, 512GB SSD", uom: "unit", qty: 3, unitCost: 52000 },
      { id: "i2", name: "Wireless Mouse", description: "Ergonomic, optical", uom: "pc", qty: 6, unitCost: 850 },
      { id: "i3", name: "Office Chair", description: "Mid-back, mesh", uom: "unit", qty: 4, unitCost: 5800 },
    ],
  },
  {
    id: "pr-002", prNo: "PR-2026-0141", office: "Planning & Mgmt Division",
    fundSource: "GAA 2026 - CO", fundType: "GAA", amount: 96250,
    status: "For Recommendation", dateSubmitted: "2026-04-27",
    requestedBy: "J. Ramos", modeOfProcurement: "Small Value Procurement",
    projectTitle: "Strategic Planning Workshop", stage: "Division Chief Recommendation",
    purpose: "Materials and supplies for the FY 2027 strategic planning workshop.",
    items: [
      { id: "i1", name: "Bond Paper, A4", description: "70 GSM", uom: "ream", qty: 25, unitCost: 250 },
      { id: "i2", name: "Conference Kit", description: "Notebook, pen, folder", uom: "set", qty: 40, unitCost: 350 },
    ],
  },
  {
    id: "pr-003", prNo: "PR-2026-0140", office: "S&T Services Division",
    fundSource: "Trust Fund - SETUP", fundType: "Trust", amount: 425000,
    status: "Pending Validation", dateSubmitted: "2026-04-26",
    requestedBy: "R. Bautista", modeOfProcurement: "Public Bidding",
    projectTitle: "SETUP Equipment Acquisition", stage: "Pre-Validation",
    purpose: "Acquisition of laboratory equipment for SETUP beneficiary firm.",
    items: [
      { id: "i1", name: "Analytical Balance", description: "0.0001g precision", uom: "unit", qty: 1, unitCost: 285000 },
      { id: "i2", name: "pH Meter, Benchtop", description: "Digital, calibrated", uom: "unit", qty: 2, unitCost: 70000 },
    ],
  },
  {
    id: "pr-004", prNo: "PR-2026-0139", office: "Finance & Admin",
    fundSource: "GAA 2026 - MOOE", fundType: "GAA", amount: 32400,
    status: "Approved", dateSubmitted: "2026-04-25",
    requestedBy: "L. Mercado", modeOfProcurement: "Shopping",
    projectTitle: "Janitorial Supplies Q2", stage: "Approved",
    purpose: "Quarterly replenishment of janitorial and sanitation supplies.",
    items: [
      { id: "i1", name: "Disinfectant, 1L", description: "Multi-surface", uom: "btl", qty: 24, unitCost: 350 },
      { id: "i2", name: "Tissue Paper", description: "2-ply", uom: "roll", qty: 120, unitCost: 200 },
    ],
  },
  {
    id: "pr-005", prNo: "PR-2026-0138", office: "Regional Office",
    fundSource: "GAA 2026 - MOOE", fundType: "GAA", amount: 78000,
    status: "Returned", dateSubmitted: "2026-04-24",
    requestedBy: "A. Villanueva", modeOfProcurement: "Shopping",
    projectTitle: "Network Equipment", stage: "Returned by Validator",
    purpose: "Network switches and cabling for new branch office.",
    items: [
      { id: "i1", name: "Network Switch, 24-port", description: "Managed, Gigabit", uom: "unit", qty: 2, unitCost: 32000 },
      { id: "i2", name: "Cat6 Cable", description: "305m box", uom: "box", qty: 1, unitCost: 14000 },
    ],
  },
  {
    id: "pr-006", prNo: "PR-2026-0137", office: "S&T Services Division",
    fundSource: "Special - Innovation Fund", fundType: "Special", amount: 215000,
    status: "Approved", dateSubmitted: "2026-04-22",
    requestedBy: "C. Santos", modeOfProcurement: "Small Value Procurement",
    projectTitle: "Community Tech Outreach", stage: "Approved",
    purpose: "Materials and equipment for community technology outreach program.",
    items: [
      { id: "i1", name: "Projector, Portable", description: "1080p, 3500 lumens", uom: "unit", qty: 2, unitCost: 45000 },
      { id: "i2", name: "Sound System", description: "Portable PA", uom: "set", qty: 1, unitCost: 125000 },
    ],
  },
  {
    id: "pr-007", prNo: "PR-2026-0136", office: "Planning & Mgmt Division",
    fundSource: "GAA 2026 - MOOE", fundType: "GAA", amount: 12500,
    status: "Draft", dateSubmitted: "2026-04-20",
    requestedBy: "M. Dela Cruz", modeOfProcurement: "Shopping",
    projectTitle: "Office Supplies", stage: "Draft",
    purpose: "Routine office supplies.",
    items: [{ id: "i1", name: "Ballpen", description: "Black, 0.5mm", uom: "pc", qty: 50, unitCost: 25 }],
  },
];

export const dashboardStats = {
  total: 142,
  pendingValidation: 18,
  forRecommendation: 11,
  forApproval: 7,
  approved: 96,
  returned: 10,
};

export const ppmpEntries = [
  { id: "p1", code: "PPMP-2026-001", item: "Laptop, Business Class", category: "ICT Equipment", qty: 12, estCost: 624000, schedule: "Q2 2026" },
  { id: "p2", code: "PPMP-2026-002", item: "Bond Paper, A4", category: "Office Supplies", qty: 500, estCost: 125000, schedule: "Quarterly" },
  { id: "p3", code: "PPMP-2026-003", item: "Office Chair, Mid-back", category: "Furniture", qty: 20, estCost: 116000, schedule: "Q2 2026" },
  { id: "p4", code: "PPMP-2026-004", item: "Analytical Balance", category: "Lab Equipment", qty: 1, estCost: 285000, schedule: "Q2 2026" },
  { id: "p5", code: "PPMP-2026-005", item: "Conference Kit", category: "Office Supplies", qty: 200, estCost: 70000, schedule: "Q2 2026" },
];

export const appCseEntries = [
  { id: "c1", code: "CSE-001", item: "Bond Paper, A4 70GSM", uom: "ream", qty: 500, unitPrice: 250 },
  { id: "c2", code: "CSE-014", item: "Ballpen, Black 0.5mm", uom: "pc", qty: 2000, unitPrice: 25 },
  { id: "c3", code: "CSE-022", item: "Tissue Paper, 2-ply", uom: "roll", qty: 1200, unitPrice: 200 },
  { id: "c4", code: "CSE-031", item: "Disinfectant, 1L", uom: "btl", qty: 240, unitPrice: 350 },
];

export const appNonCseEntries = [
  { id: "n1", code: "NC-007", item: "Laptop, Business Class", category: "ICT", qty: 12, estCost: 624000 },
  { id: "n2", code: "NC-018", item: "Office Chair, Mid-back", category: "Furniture", qty: 20, estCost: 116000 },
  { id: "n3", code: "NC-024", item: "Projector, Portable", category: "ICT", qty: 4, estCost: 180000 },
  { id: "n4", code: "NC-033", item: "Network Switch, 24-port", category: "ICT", qty: 4, estCost: 128000 },
];

export const budgetAllocations = [
  { id: "b1", code: "5020399000", account: "Other Supplies & Materials", allocated: 2400000, obligated: 1180000 },
  { id: "b2", code: "5021003000", account: "Office Equipment", allocated: 3500000, obligated: 1820000 },
  { id: "b3", code: "5029903000", account: "Representation Expenses", allocated: 800000, obligated: 312000 },
  { id: "b4", code: "5021201000", account: "ICT Equipment", allocated: 4200000, obligated: 2540000 },
];

export const users = [
  { id: "u1", name: "Maria Dela Cruz", email: "mdelacruz@dost.gov.ph", office: "Regional Office", roles: ["Requester"], status: "Active", lastLogin: "2026-05-04 08:12" },
  { id: "u2", name: "Juan Ramos", email: "jramos@dost.gov.ph", office: "Planning & Mgmt", roles: ["Requester", "Validator"], status: "Active", lastLogin: "2026-05-04 09:30" },
  { id: "u3", name: "Rita Bautista", email: "rbautista@dost.gov.ph", office: "S&T Services", roles: ["Recommender"], status: "Active", lastLogin: "2026-05-03 16:45" },
  { id: "u4", name: "Lito Mercado", email: "lmercado@dost.gov.ph", office: "Finance & Admin", roles: ["Validator"], status: "Active", lastLogin: "2026-05-04 07:55" },
  { id: "u5", name: "Director A. Reyes", email: "areyes@dost.gov.ph", office: "Office of the Director", roles: ["Approver"], status: "Active", lastLogin: "2026-05-04 10:02" },
  { id: "u6", name: "System Admin", email: "admin@dost.gov.ph", office: "ICTU", roles: ["Admin"], status: "Active", lastLogin: "2026-05-04 11:20" },
  { id: "u7", name: "C. Santos", email: "csantos@dost.gov.ph", office: "S&T Services", roles: ["Requester"], status: "Inactive", lastLogin: "2026-04-12 14:11" },
];

export const roles = [
  { name: "Requester", desc: "Creates and submits Purchase Requests.", perms: ["Create PR", "Submit PR", "View own PRs"] },
  { name: "Validator", desc: "Performs item pre-validation against PPMP/APP/Budget.", perms: ["Validate items", "Return PR", "View PRs"] },
  { name: "Recommender", desc: "Reviews and recommends PRs for approval.", perms: ["Recommend", "Return", "View PRs"] },
  { name: "Approver", desc: "Final approving authority for procurement requests.", perms: ["Approve", "Reject", "Return", "View PRs"] },
  { name: "Admin", desc: "Manages users, roles, and reference data.", perms: ["Manage users", "Manage references", "View audit logs"] },
];

export const auditLogs = [
  { id: "a1", ts: "2026-05-04 10:42:11", actor: "Director A. Reyes", role: "Approver", module: "Purchase Requests", action: "Approved", target: "PR-2026-0139", ip: "10.0.4.12" },
  { id: "a2", ts: "2026-05-04 10:31:55", actor: "L. Mercado", role: "Validator", module: "Validation", action: "Validated Items", target: "PR-2026-0139", ip: "10.0.4.21" },
  { id: "a3", ts: "2026-05-04 09:15:02", actor: "M. Dela Cruz", role: "Requester", module: "Purchase Requests", action: "Submitted PR", target: "PR-2026-0142", ip: "10.0.4.55" },
  { id: "a4", ts: "2026-05-04 08:48:30", actor: "System Admin", role: "Admin", module: "User Management", action: "Updated User", target: "u7 (C. Santos)", ip: "10.0.4.2" },
  { id: "a5", ts: "2026-05-03 17:02:18", actor: "R. Bautista", role: "Recommender", module: "Approval Inbox", action: "Recommended", target: "PR-2026-0141", ip: "10.0.4.18" },
  { id: "a6", ts: "2026-05-03 16:11:09", actor: "J. Ramos", role: "Validator", module: "Validation", action: "Returned PR", target: "PR-2026-0138", ip: "10.0.4.30" },
  { id: "a7", ts: "2026-05-03 14:55:41", actor: "System Admin", role: "Admin", module: "References", action: "Imported PPMP", target: "PPMP FY2026", ip: "10.0.4.2" },
];

export const approvalTrail = [
  { actor: "M. Dela Cruz", role: "Requester", action: "Submitted PR", ts: "2026-04-28 09:15", remarks: "Initial submission." },
  { actor: "L. Mercado", role: "Validator", action: "Validated Items", ts: "2026-04-28 14:02", remarks: "All items passed pre-validation." },
  { actor: "R. Bautista", role: "Recommender", action: "Recommended", ts: "2026-04-29 10:30", remarks: "Endorsed for approval." },
  { actor: "Director A. Reyes", role: "Approver", action: "Pending Approval", ts: "—", remarks: "Awaiting action." },
];

export function fmtPHP(n: number) {
  return new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", maximumFractionDigits: 2 }).format(n);
}

export function prTotal(pr: PurchaseRequest) {
  return pr.items.reduce((s, i) => s + i.qty * i.unitCost, 0);
}

export function mockValidate(item: PRItem): ValidationCheck[] {
  const lower = item.name.toLowerCase();
  const inPPMP = ppmpEntries.some(p => lower.includes(p.item.toLowerCase().split(",")[0].toLowerCase()));
  const inCSE = appCseEntries.some(c => lower.includes(c.item.toLowerCase().split(",")[0].toLowerCase()));
  const inNonCSE = appNonCseEntries.some(n => lower.includes(n.item.toLowerCase().split(",")[0].toLowerCase()));
  const total = item.qty * item.unitCost;
  return [
    { label: "PPMP", status: inPPMP ? "Passed" : "Warning", message: inPPMP ? "Item is included in PPMP." : "Item is not found in the approved PPMP." },
    { label: "Line-Item Budget", status: total < 500000 ? "Passed" : "Warning", message: total < 500000 ? "Item is within approved budget." : "Item exceeds typical line-item budget; verify allocation." },
    { label: "APP-CSE", status: inCSE ? "Passed" : "N/A", message: inCSE ? "Item matches an APP-CSE entry." : "Item is not found in APP-CSE." },
    { label: "APP-Non-CSE", status: inNonCSE ? "Passed" : (inCSE ? "N/A" : "Failed"), message: inNonCSE ? "Item matches an APP-Non-CSE entry." : (inCSE ? "Not applicable; item is CSE." : "Item is not found in APP-Non-CSE.") },
  ];
}
