import { createFileRoute } from "@tanstack/react-router";
import { ChangeEvent, ReactNode, useMemo, useRef, useState } from "react";
import { FileSpreadsheet, Loader2, Plus, Save, Trash2, Upload } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/app/page-header";
import { fmtPHP } from "@/lib/mock-data";
import {
  apiCreatePpmpDocument,
  apiGetPpmpWorkspace,
  type PpmpDocumentCreatePayload,
  type PpmpDocumentRecord,
  type PpmpImportRow,
  type PpmpRecord,
} from "@/lib/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

export const Route = createFileRoute("/references/ppmp")({
  head: () => ({
    meta: [
      { title: "PPMP - DOST Caraga" },
      { name: "description", content: "Project Procurement Management Plan documents." },
    ],
  }),
  component: PpmpPage,
});

type PpmpDocumentForm = PpmpDocumentCreatePayload["document"];
type EditablePpmpRow = PpmpImportRow & { localId: string };

const projectId = 1;

const defaultDocumentForm: PpmpDocumentForm = {
  ppmp_no: "PPMP-2026-001",
  fiscal_year: 2026,
  end_user_unit: "MIS",
  document_type: "Final",
  source_filename: "",
  prepared_submitted_by_name: "",
  prepared_submitted_by_position: "",
  prepared_submitted_by_date: "",
  budget_officer_name: "",
  budget_officer_position: "",
  budget_certified_date: "",
};

function PpmpPage() {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [documentForm, setDocumentForm] = useState<PpmpDocumentForm>(defaultDocumentForm);
  const [previewRows, setPreviewRows] = useState<EditablePpmpRow[]>([]);
  const { data, isLoading } = useQuery({ queryKey: ["ppmp-workspace", projectId], queryFn: () => apiGetPpmpWorkspace(projectId) });
  const documents = data?.documents ?? [];
  const legacyEntries = (data?.entries ?? []).filter((entry) => !entry.documentId);
  const latestDocument = documents[0];
  const rowsForDisplay = latestDocument?.items ?? legacyEntries;
  const previewTotal = useMemo(() => previewRows.reduce((sum, row) => sum + Number(row.estimated_budget ?? 0), 0), [previewRows]);

  const importMutation = useMutation({
    mutationFn: (payload: PpmpDocumentCreatePayload) => apiCreatePpmpDocument(payload, projectId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["ppmp-workspace", projectId] });
      await queryClient.invalidateQueries({ queryKey: ["ppmp", projectId] });
      toast.success("PPMP document imported.");
      setPreviewRows([]);
      setDocumentForm(defaultDocumentForm);
      if (fileInputRef.current) fileInputRef.current.value = "";
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Unable to import PPMP document."),
  });

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const parsed = await parsePpmpFile(file);
      setDocumentForm(parsed.document);
      setPreviewRows(parsed.rows);
      toast.success(`${parsed.rows.length} PPMP rows ready for review.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to read PPMP file.");
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function saveImportedDocument() {
    const rows = previewRows
      .filter((row) => row.item_name.trim())
      .map(({ localId: _localId, ...row }) => ({
        ...row,
        item_name: row.item_name.trim(),
        estimated_budget: Number(row.estimated_budget ?? 0),
        quantity: Number(row.quantity ?? 1),
      }));

    if (rows.length === 0) {
      toast.error("Add at least one PPMP line item before saving.");
      return;
    }

    importMutation.mutate({
      document: {
        ...documentForm,
        fiscal_year: Number(documentForm.fiscal_year),
        ppmp_no: documentForm.ppmp_no?.trim(),
        end_user_unit: documentForm.end_user_unit?.trim(),
        prepared_submitted_by_name: documentForm.prepared_submitted_by_name?.trim(),
        prepared_submitted_by_position: documentForm.prepared_submitted_by_position?.trim(),
        prepared_submitted_by_date: documentForm.prepared_submitted_by_date || undefined,
        budget_officer_name: documentForm.budget_officer_name?.trim(),
        budget_officer_position: documentForm.budget_officer_position?.trim(),
        budget_certified_date: documentForm.budget_certified_date || undefined,
      },
      rows,
    });
  }

  function updatePreviewRow(index: number, patch: Partial<EditablePpmpRow>) {
    setPreviewRows((rows) => rows.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)));
  }

  function removePreviewRow(index: number) {
    setPreviewRows((rows) => rows.filter((_, rowIndex) => rowIndex !== index));
  }

  function addPreviewRow() {
    setPreviewRows((rows) => [
      ...rows,
      {
        localId: crypto.randomUUID(),
        row_number: rows.length + 1,
        expense_category: rows.at(-1)?.expense_category ?? "Office Supplies",
        general_description: rows.at(-1)?.general_description ?? "",
        project_type: "Goods",
        item_name: "",
        uom: "unit",
        quantity: 1,
        quantity_size: "Quantity: 1 unit",
        recommended_mode: "Small Value Procurement",
        pre_procurement_conference: "No",
        estimated_budget: 0,
      },
    ]);
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-5 px-3 py-4 sm:space-y-6 sm:px-6 sm:py-8 lg:px-8">
      <PageHeader
        eyebrow="References"
        title="PPMP Documents"
        subtitle="Project Procurement Management Plans for office projects."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" className="gap-2 border-border" onClick={downloadPpmpTemplate}>
              <FileSpreadsheet className="h-4 w-4" /> Template
            </Button>
            <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleFileChange} />
            <Button className="gap-2" onClick={() => fileInputRef.current?.click()}>
              <Upload className="h-4 w-4" /> Import
            </Button>
          </div>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label="PPMP Documents" value={documents.length || (legacyEntries.length ? 1 : 0)} />
        <SummaryCard label="Latest Rows" value={latestDocument?.rowCount ?? legacyEntries.length} />
        <SummaryCard label="Latest Budget" value={fmtPHP(latestDocument?.totalEstimatedBudget ?? legacyEntries.reduce((sum, row) => sum + row.estCost, 0))} />
        <SummaryCard label="Document Type" value={latestDocument?.documentType ?? "Legacy Entries"} />
      </div>

      <Card className="border border-border bg-card p-4 shadow-card">
        <div className="grid gap-4">
          <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-end">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="PPMP No.">
                <Input value={documentForm.ppmp_no ?? ""} onChange={(event) => setDocumentForm({ ...documentForm, ppmp_no: event.target.value })} />
              </Field>
              <Field label="Fiscal Year">
                <Input
                  type="number"
                  min="2000"
                  max="2100"
                  value={documentForm.fiscal_year}
                  onChange={(event) => setDocumentForm({ ...documentForm, fiscal_year: Number(event.target.value) })}
                />
              </Field>
              <Field label="End-User Unit">
                <Input value={documentForm.end_user_unit ?? ""} onChange={(event) => setDocumentForm({ ...documentForm, end_user_unit: event.target.value })} />
              </Field>
              <Field label="Type">
                <Select value={documentForm.document_type} onValueChange={(value: "Indicative" | "Final") => setDocumentForm({ ...documentForm, document_type: value })}>
                  <SelectTrigger className="border-border bg-background"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Final">Final</SelectItem>
                    <SelectItem value="Indicative">Indicative</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" className="gap-2 border-border" onClick={addPreviewRow}>
                <Plus className="h-4 w-4" /> Row
              </Button>
              <Button className="gap-2" disabled={previewRows.length === 0 || importMutation.isPending} onClick={saveImportedDocument}>
                {importMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Save PPMP
              </Button>
            </div>
          </div>

          <div className="grid gap-3 border-t border-border pt-4 md:grid-cols-2 xl:grid-cols-3">
            <Field label="Prepared & Submitted by">
              <Input value={documentForm.prepared_submitted_by_name ?? ""} onChange={(event) => setDocumentForm({ ...documentForm, prepared_submitted_by_name: event.target.value })} />
            </Field>
            <Field label="Prepared Designation">
              <Input value={documentForm.prepared_submitted_by_position ?? ""} onChange={(event) => setDocumentForm({ ...documentForm, prepared_submitted_by_position: event.target.value })} />
            </Field>
            <Field label="Prepared Date">
              <Input type="date" value={documentForm.prepared_submitted_by_date ?? ""} onChange={(event) => setDocumentForm({ ...documentForm, prepared_submitted_by_date: event.target.value })} />
            </Field>
            <Field label="Certified Funds Available">
              <Input value={documentForm.budget_officer_name ?? ""} onChange={(event) => setDocumentForm({ ...documentForm, budget_officer_name: event.target.value })} />
            </Field>
            <Field label="Budget Officer Designation">
              <Input value={documentForm.budget_officer_position ?? ""} onChange={(event) => setDocumentForm({ ...documentForm, budget_officer_position: event.target.value })} />
            </Field>
            <Field label="Certified Date">
              <Input type="date" value={documentForm.budget_certified_date ?? ""} onChange={(event) => setDocumentForm({ ...documentForm, budget_certified_date: event.target.value })} />
            </Field>
          </div>
        </div>
        {documentForm.source_filename && <p className="mt-3 text-sm text-muted-foreground">{documentForm.source_filename}</p>}
      </Card>

      {previewRows.length > 0 && (
        <Card className="overflow-hidden border border-border bg-card shadow-card">
          <div className="flex flex-col gap-2 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-semibold text-navy">Import Preview</p>
              <p className="text-sm text-muted-foreground">{previewRows.length} rows, {fmtPHP(previewTotal)} total estimated budget</p>
            </div>
            <Button className="gap-2" disabled={importMutation.isPending} onClick={saveImportedDocument}>
              {importMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save PPMP
            </Button>
          </div>
          <PreviewTable rows={previewRows} onChange={updatePreviewRow} onRemove={removePreviewRow} />
        </Card>
      )}

      <div className="grid gap-5 xl:grid-cols-[380px_minmax(0,1fr)]">
        <DocumentsPanel documents={documents} isLoading={isLoading} />
        <RowsPanel rows={rowsForDisplay} isLoading={isLoading} title={latestDocument ? latestDocument.ppmpNo : "PPMP Entries"} document={latestDocument} />
      </div>
    </div>
  );
}

function PreviewTable({
  rows,
  onChange,
  onRemove,
}: {
  rows: EditablePpmpRow[];
  onChange: (index: number, patch: Partial<EditablePpmpRow>) => void;
  onRemove: (index: number) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <Table className="min-w-[1680px]">
        <TableHeader>
          <TableRow className="bg-secondary/40 hover:bg-secondary/40">
            <TableHead className="w-40 label-eyebrow">Category</TableHead>
            <TableHead className="w-56 label-eyebrow">Objective</TableHead>
            <TableHead className="w-52 label-eyebrow">Item</TableHead>
            <TableHead className="w-32 label-eyebrow">Type</TableHead>
            <TableHead className="w-44 label-eyebrow">Quantity/Size</TableHead>
            <TableHead className="w-24 label-eyebrow text-right">Qty</TableHead>
            <TableHead className="w-44 label-eyebrow">Mode</TableHead>
            <TableHead className="w-24 label-eyebrow">Pre-Proc</TableHead>
            <TableHead className="w-28 label-eyebrow">Start</TableHead>
            <TableHead className="w-28 label-eyebrow">End</TableHead>
            <TableHead className="w-32 label-eyebrow">Delivery</TableHead>
            <TableHead className="w-48 label-eyebrow">Funds</TableHead>
            <TableHead className="w-36 label-eyebrow text-right">Budget</TableHead>
            <TableHead className="w-36 label-eyebrow">Docs</TableHead>
            <TableHead className="w-36 label-eyebrow">Remarks</TableHead>
            <TableHead className="w-14" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, index) => (
            <TableRow key={row.localId}>
              <EditableCell value={row.expense_category} onChange={(value) => onChange(index, { expense_category: value })} />
              <EditableCell value={row.general_description} onChange={(value) => onChange(index, { general_description: value })} />
              <EditableCell value={row.item_name} required onChange={(value) => onChange(index, { item_name: value })} />
              <EditableCell value={row.project_type} onChange={(value) => onChange(index, { project_type: value })} />
              <EditableCell value={row.quantity_size} onChange={(value) => onChange(index, { quantity_size: value })} />
              <TableCell>
                <Input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={row.quantity ?? 1}
                  className="h-8 border-border bg-background text-right tabular-nums"
                  onChange={(event) => onChange(index, { quantity: Number(event.target.value) })}
                />
              </TableCell>
              <EditableCell value={row.recommended_mode} onChange={(value) => onChange(index, { recommended_mode: value })} />
              <EditableCell value={row.pre_procurement_conference} onChange={(value) => onChange(index, { pre_procurement_conference: value })} />
              <EditableCell value={row.procurement_start} onChange={(value) => onChange(index, { procurement_start: value })} />
              <EditableCell value={row.procurement_end} onChange={(value) => onChange(index, { procurement_end: value })} />
              <EditableCell value={row.delivery_period} onChange={(value) => onChange(index, { delivery_period: value })} />
              <EditableCell value={row.source_of_funds} onChange={(value) => onChange(index, { source_of_funds: value })} />
              <TableCell>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={row.estimated_budget ?? 0}
                  className="h-8 border-border bg-background text-right tabular-nums"
                  onChange={(event) => onChange(index, { estimated_budget: Number(event.target.value) })}
                />
              </TableCell>
              <EditableCell value={row.supporting_documents} onChange={(value) => onChange(index, { supporting_documents: value })} />
              <EditableCell value={row.remarks} onChange={(value) => onChange(index, { remarks: value })} />
              <TableCell>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" onClick={() => onRemove(index)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function EditableCell({ value, required, onChange }: { value?: string; required?: boolean; onChange: (value: string) => void }) {
  return (
    <TableCell>
      <Input
        required={required}
        value={value ?? ""}
        className="h-8 border-border bg-background"
        onChange={(event) => onChange(event.target.value)}
      />
    </TableCell>
  );
}

function DocumentsPanel({ documents, isLoading }: { documents: PpmpDocumentRecord[]; isLoading: boolean }) {
  return (
    <Card className="overflow-hidden border border-border bg-card shadow-card">
      <div className="border-b border-border p-4">
        <p className="font-semibold text-navy">PPMP Documents</p>
      </div>
      <Table>
        <TableHeader>
          <TableRow className="bg-secondary/40 hover:bg-secondary/40">
            <TableHead className="label-eyebrow">No.</TableHead>
            <TableHead className="label-eyebrow text-right">Rows</TableHead>
            <TableHead className="label-eyebrow text-right">Budget</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading && <TableRow><TableCell colSpan={3} className="py-8 text-center text-sm text-muted-foreground">Fetching data, kindly wait.</TableCell></TableRow>}
          {!isLoading && documents.length === 0 && <TableRow><TableCell colSpan={3} className="py-8 text-center text-sm text-muted-foreground">No PPMP document imported.</TableCell></TableRow>}
          {documents.map((document) => (
            <TableRow key={document.id}>
              <TableCell>
                <div className="font-semibold text-navy">{document.ppmpNo}</div>
                <div className="text-xs text-muted-foreground">FY {document.fiscalYear} · {document.documentType}</div>
              </TableCell>
              <TableCell className="text-right tabular-nums">{document.rowCount}</TableCell>
              <TableCell className="text-right font-medium tabular-nums">{fmtPHP(document.totalEstimatedBudget)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}

function RowsPanel({ rows, isLoading, title, document }: { rows: PpmpRecord[]; isLoading: boolean; title: string; document?: PpmpDocumentRecord }) {
  return (
    <Card className="overflow-hidden border border-border bg-card shadow-card">
      <div className="border-b border-border p-4">
        <p className="font-semibold text-navy">{title}</p>
      </div>
      <div className="overflow-x-auto">
        <Table className="min-w-[1120px]">
          <TableHeader>
            <TableRow className="bg-secondary/40 hover:bg-secondary/40">
              <TableHead className="label-eyebrow">Category</TableHead>
              <TableHead className="label-eyebrow">Item</TableHead>
              <TableHead className="label-eyebrow">Mode</TableHead>
              <TableHead className="label-eyebrow">Timeline</TableHead>
              <TableHead className="label-eyebrow">Funds</TableHead>
              <TableHead className="label-eyebrow text-right">Qty</TableHead>
              <TableHead className="label-eyebrow text-right">Budget</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && <TableRow><TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">Fetching data, kindly wait.</TableCell></TableRow>}
            {!isLoading && rows.length === 0 && <TableRow><TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">No PPMP rows available.</TableCell></TableRow>}
            {rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell className="text-muted-foreground">{row.category}</TableCell>
                <TableCell>
                  <div className="font-medium text-navy">{row.item}</div>
                  {row.objective && <div className="max-w-md text-xs text-muted-foreground">{row.objective}</div>}
                </TableCell>
                <TableCell>{row.recommendedMode ?? "N/A"}</TableCell>
                <TableCell>{timelineText(row)}</TableCell>
                <TableCell className="max-w-[220px] text-muted-foreground">{row.sourceOfFunds ?? "N/A"}</TableCell>
                <TableCell className="text-right tabular-nums">{row.qty}</TableCell>
                <TableCell className="text-right font-medium tabular-nums">{fmtPHP(row.estCost)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {document && <PpmpSignatureBlock document={document} />}
    </Card>
  );
}

function PpmpSignatureBlock({ document }: { document: PpmpDocumentRecord }) {
  return (
    <div className="grid gap-4 border-t border-border p-4 md:grid-cols-2">
      <SignatureBox
        label="Prepared & Submitted by"
        name={document.preparedSubmittedByName}
        position={document.preparedSubmittedByPosition}
        date={document.preparedSubmittedByDate}
      />
      <SignatureBox
        label="Certified Funds Available"
        name={document.budgetOfficerName}
        position={document.budgetOfficerPosition}
        date={document.budgetCertifiedDate}
      />
    </div>
  );
}

function SignatureBox({ label, name, position, date }: { label: string; name: string; position: string; date: string }) {
  return (
    <div className="min-h-28 border border-border bg-background p-4">
      <p className="label-eyebrow">{label}</p>
      <div className="mt-8 border-b border-foreground/40 pb-1 text-center font-semibold text-navy">
        {name || "Unsigned"}
      </div>
      <div className="mt-1 flex justify-between gap-3 text-xs text-muted-foreground">
        <span>{position || "Designation"}</span>
        <span>{date || "Date"}</span>
      </div>
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: ReactNode }) {
  return (
    <Card className="border border-border bg-card p-4 shadow-card">
      <p className="label-eyebrow">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-navy">{value}</p>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <div className="space-y-1.5"><Label className="label-eyebrow">{label}</Label>{children}</div>;
}

function timelineText(row: PpmpRecord) {
  if (row.procurementStart && row.procurementEnd && row.procurementStart !== row.procurementEnd) {
    return `${row.procurementStart} to ${row.procurementEnd}`;
  }

  return row.procurementStart ?? row.procurementEnd ?? row.deliveryPeriod ?? row.schedule;
}

async function parsePpmpFile(file: File): Promise<{ document: PpmpDocumentForm; rows: EditablePpmpRow[] }> {
  const XLSX = await import("xlsx");
  const data = await file.arrayBuffer();
  const workbook = XLSX.read(data, { type: "array" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) throw new Error("The PPMP workbook has no readable sheets.");

  const table = XLSX.utils.sheet_to_json<Array<string | number | null>>(sheet, { header: 1, raw: false, defval: "" });
  const rows = table.map((row) => row.map(cleanCell));
  const document = parseDocumentMetadata(rows, file.name);
  const bodyStart = findBodyStart(rows);
  const parsedRows = parseImportRows(rows.slice(bodyStart));

  if (parsedRows.length === 0) {
    throw new Error("No PPMP line items were found in the file.");
  }

  return { document, rows: parsedRows };
}

function parseDocumentMetadata(rows: string[][], filename: string): PpmpDocumentForm {
  const metadataRows = rows;
  const text = metadataRows.map((row) => row.join(" ")).join(" ");
  const fiscalYear = findMetadataValue(metadataRows, /fiscal\s*year/i);
  const endUserUnit = findMetadataValue(metadataRows, /end[-\s]*user|implementing\s*unit/i);
  const documentTypeValue = findMetadataValue(metadataRows, /document\s*type/i);
  const preparedName = findMetadataValue(metadataRows, /prepared\s*&?\s*submitted\s*by/i);
  const preparedPosition = findMetadataValue(metadataRows, /prepared\s*(?:designation|position)/i);
  const preparedDate = findMetadataValue(metadataRows, /prepared\s*date/i);
  const budgetOfficerName = findMetadataValue(metadataRows, /certified\s*funds\s*available/i);
  const budgetOfficerPosition = findMetadataValue(metadataRows, /budget\s*officer\s*(?:designation|position)/i);
  const budgetCertifiedDate = findMetadataValue(metadataRows, /certified\s*date/i);
  const ppmpNo = matchText(text, /ppmp[)\s]*(?:no\.?|#)\s*[:#-]?\s*([A-Za-z0-9._-]+)/i);
  const documentType = /\bindicative\b/i.test(documentTypeValue ?? text) && !/\bfinal\b/i.test(documentTypeValue ?? "") ? "Indicative" : "Final";

  return {
    ppmp_no: ppmpNo ? `PPMP-${ppmpNo}`.replace(/^PPMP-PPMP-/i, "PPMP-") : defaultDocumentForm.ppmp_no,
    fiscal_year: fiscalYear ? Number(fiscalYear) : defaultDocumentForm.fiscal_year,
    end_user_unit: endUserUnit?.trim() || defaultDocumentForm.end_user_unit,
    document_type: documentType,
    source_filename: filename,
    prepared_submitted_by_name: preparedName?.trim() || "",
    prepared_submitted_by_position: preparedPosition?.trim() || "",
    prepared_submitted_by_date: toDateInputValue(preparedDate),
    budget_officer_name: budgetOfficerName?.trim() || "",
    budget_officer_position: budgetOfficerPosition?.trim() || "",
    budget_certified_date: toDateInputValue(budgetCertifiedDate),
  };
}

function findBodyStart(rows: string[][]) {
  const headerIndex = rows.findIndex((row) => {
    const text = normalized(row.join(" "));
    const score = ["general description", "type of the project", "quantity", "recommended mode", "source of funds", "estimated budget", "remarks"]
      .filter((term) => text.includes(term)).length;
    return score >= 3 || (text.includes("column 1") && text.includes("column 12"));
  });

  if (headerIndex < 0) return 0;

  const nextRow = normalized(rows[headerIndex + 1]?.join(" ") ?? "");
  return nextRow.includes("column 1") ? headerIndex + 2 : headerIndex + 1;
}

function parseImportRows(rows: string[][]): EditablePpmpRow[] {
  const parsedRows: EditablePpmpRow[] = [];
  let currentCategory = "";
  let currentObjective = "";

  rows.forEach((row, rowIndex) => {
    const columns = Array.from({ length: 12 }, (_, index) => cleanCell(row[index] ?? ""));
    const rowText = columns.join(" ").trim();
    if (!rowText || isHeaderLike(rowText)) return;

    const [objective, projectType, quantitySize, mode, preProc, start, end, delivery, funds, budget, docs, remarks] = columns;
    const budgetValue = parseMoney(budget);
    const itemName = extractItemName(quantitySize);

    if (isCategoryRow(columns, budgetValue, itemName)) {
      currentCategory = objective || currentCategory;
      return;
    }

    if (looksLikeSubtotal(objective)) {
      return;
    }

    if (objective && !looksLikeSubtotal(objective)) {
      currentObjective = objective;
    }

    if (!itemName && !budgetValue) return;

    parsedRows.push({
      localId: crypto.randomUUID(),
      row_number: rowIndex + 1,
      expense_category: currentCategory || "Uncategorized",
      general_description: currentObjective,
      project_type: projectType || "Goods",
      item_name: itemName || currentObjective || "PPMP line item",
      uom: extractUom(quantitySize),
      quantity: extractQuantity(quantitySize),
      quantity_size: quantitySize,
      recommended_mode: mode,
      pre_procurement_conference: preProc,
      procurement_start: start,
      procurement_end: end,
      delivery_period: delivery,
      source_of_funds: funds,
      estimated_budget: budgetValue,
      supporting_documents: docs,
      remarks,
    });
  });

  return parsedRows;
}

async function downloadPpmpTemplate() {
  const XLSX = await import("xlsx");
  const rows = [
    ["PROJECT PROCUREMENT MANAGEMENT PLAN (PPMP) NO. 3", "", "", "", "", "", "", "", "", "", "", ""],
    ["[ ] INDICATIVE", "", "", "[X] FINAL", "", "", "", "", "", "", "", ""],
    ["Fiscal Year:", "2026", "", "End-User / Implementing Unit:", "MIS", "", "PPMP No.:", "PPMP-2026-MIS-003", "", "Document Type:", "Final", ""],
    [],
    ["PROCUREMENT PROJECT DETAILS", "", "", "", "", "PROJECTED TIMELINE (MM/YYYY)", "", "", "FUNDING DETAILS", "", "ATTACHED SUPPORTING DOCUMENTS", "REMARKS"],
    [
      "General Description and Objective of the Project to be Procured",
      "Type of the Project to be Procured",
      "Quantity and Size of the Project to be Procured",
      "Recommended Mode of Procurement",
      "Pre-Procurement Conference, if applicable (Yes/No)",
      "Start of Procurement Activity",
      "End of Procurement Activity",
      "Expected Delivery/Implementation Period",
      "Source of Funds",
      "Estimated Budget / ABC (PHP)",
      "Attached Supporting Documents",
      "Remarks",
    ],
    ["Column 1", "Column 2", "Column 3", "Column 4", "Column 5", "Column 6", "Column 7", "Column 8", "Column 9", "Column 10", "Column 11", "Column 12"],
    ["TRAVELING EXPENSES", "", "", "", "", "", "", "", "", "", "", ""],
    [
      "Provision of round-trip plane tickets for technical experts invited to conduct lectures, hands-on training, and consultation in relation to project activities.",
      "Goods",
      "Round-trip airfare for technical experts, DOST Caraga personnel\nQuantity: 6 pax",
      "Small Value Procurement",
      "No",
      "Aug-26",
      "Aug-26",
      "09/2026",
      "LGIA 2026 Current Appropriation-NOVA Hub",
      90000,
      "",
      "",
    ],
    ["SUBTOTAL TRAVELING EXPENSES", "", "", "", "", "", "", "", "", 90000, "", ""],
    ["SUPPLIES AND MATERIALS EXPENSES", "", "", "", "", "", "", "", "", "", "", ""],
    ["Office Supplies", "", "", "", "", "", "", "", "", "", "", ""],
    [
      "Supply and delivery of office supplies for day-to-day operational use",
      "Goods",
      "Blue Liquid Gel Ink 0.5mm Sign Pen\nQuantity: 20 pieces",
      "Small Value Procurement",
      "No",
      "Jan-26",
      "Jan-26",
      "02/2026",
      "LGIA 2026 Current Appropriation-NOVA Hub",
      500,
      "",
      "",
    ],
    [
      "Supply and delivery of office supplies for day-to-day operational use",
      "Goods",
      "A4-sized Bond Paper\nQuantity: 5 reams",
      "Small Value Procurement",
      "No",
      "Jan-26",
      "Jan-26",
      "02/2026",
      "LGIA 2026 Current Appropriation-NOVA Hub",
      1400,
      "",
      "",
    ],
    [
      "Supply and delivery of air conditioner for daily use of MIS Office",
      "Goods",
      "Split Type Inverter, 220V/1-Phase/60Hz/R32 Refrigerant, 2.5 HP\nQuantity: 1 unit",
      "Small Value Procurement",
      "No",
      "03/2026",
      "03/2026",
      "04/2026",
      "LGIA 2026 Current Appropriation-NOVA Hub",
      49900,
      "",
      "",
    ],
    ["SUBTOTAL OFFICE SUPPLIES", "", "", "", "", "", "", "", "", 51800, "", ""],
    ["ICT Supplies", "", "", "", "", "", "", "", "", "", "", ""],
    [
      "Supply and delivery of ICT supplies for MIS Office connectivity.",
      "Goods",
      "WiFi Router\nQuantity: 2 units",
      "Small Value Procurement",
      "No",
      "Jan-26",
      "Jan-26",
      "02/2026",
      "LGIA 2026 Current Appropriation-NOVA Hub",
      6000,
      "",
      "",
    ],
    ["TOTAL ESTIMATED BUDGET", "", "", "", "", "", "", "", "", 147800, "", ""],
    [],
    ["Prepared & Submitted by:", "Juan Dela Cruz", "", "Prepared Designation:", "Project Staff", "", "Prepared Date:", "2026-05-10", "", "", "", ""],
    ["Certified Funds Available:", "Ana Santos", "", "Budget Officer Designation:", "Budget Officer", "", "Certified Date:", "2026-05-10", "", "", "", ""],
  ];

  const worksheet = XLSX.utils.aoa_to_sheet(rows);
  worksheet["!cols"] = [
    { wch: 42 }, { wch: 18 }, { wch: 44 }, { wch: 26 }, { wch: 18 }, { wch: 16 },
    { wch: 16 }, { wch: 20 }, { wch: 34 }, { wch: 18 }, { wch: 26 }, { wch: 18 },
  ];
  worksheet["!rows"] = [
    { hpt: 24 },
    { hpt: 20 },
    { hpt: 22 },
    { hpt: 8 },
    { hpt: 18 },
    { hpt: 46 },
    { hpt: 18 },
  ];
  worksheet["!merges"] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 11 } },
    { s: { r: 4, c: 0 }, e: { r: 4, c: 4 } },
    { s: { r: 4, c: 5 }, e: { r: 4, c: 7 } },
    { s: { r: 4, c: 8 }, e: { r: 4, c: 9 } },
  ];
  worksheet["!freeze"] = { xSplit: 0, ySplit: 7 };

  const guideRows = [
    ["PPMP Template Guide"],
    [],
    ["Use the PPMP Upload sheet for import. Keep the 12 official columns in the same order."],
    ["Document details", "Fill Fiscal Year, End-User / Implementing Unit, PPMP No., and Document Type in row 3."],
    ["Category rows", "Enter the expense/category name in Column 1 only, then leave Columns 2-12 blank."],
    ["Line item rows", "Each procurement item gets one row under its category."],
    ["Quantity and Size", "Put the item name first, then a second line like Quantity: 20 pieces."],
    ["Budget", "Use numbers only in Column 10. Subtotal and total rows are optional and ignored by import."],
    ["Signatories", "Fill the Prepared & Submitted by and Certified Funds Available lines at the bottom."],
    ["Do not upload", "Scanned images or PDFs. Use .xlsx, .xls, or .csv."],
  ];
  const guide = XLSX.utils.aoa_to_sheet(guideRows);
  guide["!cols"] = [{ wch: 24 }, { wch: 92 }];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "PPMP Upload");
  XLSX.utils.book_append_sheet(workbook, guide, "Input Guide");
  XLSX.writeFile(workbook, "ppmp-upload-template.xlsx");
}

function cleanCell(value: string | number | null | undefined) {
  return String(value ?? "").replace(/\r/g, "\n").replace(/[ \t]+/g, " ").trim();
}

function normalized(value: string) {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function matchText(text: string, pattern: RegExp) {
  return text.match(pattern)?.[1] ?? null;
}

function findMetadataValue(rows: string[][], labelPattern: RegExp) {
  for (const row of rows) {
    for (let index = 0; index < row.length; index++) {
      const cell = row[index] ?? "";
      if (!labelPattern.test(cell)) continue;

      const [, afterDelimiter] = cell.split(/[:#]/, 2);
      const nextValue = row.slice(index + 1).find(Boolean);
      return cleanCell(afterDelimiter || nextValue || "");
    }
  }

  return null;
}

function toDateInputValue(value: string | null) {
  if (!value) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isHeaderLike(text: string) {
  const value = normalized(text);
  return value.includes("procurement project details")
    || value.includes("projected timeline")
    || value.includes("funding details")
    || value.includes("column 1 column 2")
    || value.includes("general description and objective");
}

function isCategoryRow(columns: string[], budget: number, itemName: string) {
  const usefulCells = columns.filter(Boolean).length;
  const firstCell = columns[0] ?? "";

  return Boolean(firstCell)
    && usefulCells <= 2
    && budget === 0
    && !itemName
    && !looksLikeSubtotal(firstCell);
}

function looksLikeSubtotal(value: string) {
  return /^(subtotal|total)\b/i.test(value.trim());
}

function extractItemName(value: string) {
  const cleaned = value
    .replace(/quantity\s*:\s*[^\n]+/gi, "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  return cleaned[0] ?? "";
}

function extractQuantity(value: string) {
  const match = value.match(/quantity\s*:\s*([0-9,]+(?:\.[0-9]+)?)/i);
  if (!match) return 1;
  return Math.max(0.01, Number(match[1].replace(/,/g, "")));
}

function extractUom(value: string) {
  const match = value.match(/quantity\s*:\s*[0-9,]+(?:\.[0-9]+)?\s*([A-Za-z]+)/i);
  return match?.[1] ?? "unit";
}

function parseMoney(value: string) {
  const normalizedValue = value.replace(/[^0-9.-]/g, "");
  if (!normalizedValue) return 0;
  const parsed = Number(normalizedValue);
  return Number.isFinite(parsed) ? parsed : 0;
}
