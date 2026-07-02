import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowLeft, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader } from "@/components/app/page-header";
import { apiCreatePpmpDocumentManaged, apiGetFundSources, apiGetProjects } from "@/lib/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

export const Route = createFileRoute("/ppmp-documents/new")({
  head: () => ({ meta: [{ title: "New PPMP Document — DOST Caraga" }] }),
  component: NewPpmpDocumentPage,
});

function NewPpmpDocumentPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: fundSources = [] } = useQuery({ queryKey: ["fund-sources"], queryFn: apiGetFundSources });
  const { data: projects = [] } = useQuery({ queryKey: ["projects"], queryFn: apiGetProjects });

  const [form, setForm] = useState({
    project_id: 0,
    fund_source_id: undefined as number | undefined,
    ppmp_no: "",
    fiscal_year: new Date().getFullYear(),
    end_user_unit: "",
    document_type: "Final" as "Indicative" | "Final",
  });

  const mutation = useMutation({
    mutationFn: () => apiCreatePpmpDocumentManaged({
      project_id: form.project_id,
      fund_source_id: form.fund_source_id,
      ppmp_no: form.ppmp_no || undefined,
      fiscal_year: form.fiscal_year,
      end_user_unit: form.end_user_unit || undefined,
      document_type: form.document_type,
    }),
    onSuccess: (data) => {
      toast.success("PPMP document created.");
      queryClient.invalidateQueries({ queryKey: ["ppmp-documents"] });
      navigate({ to: "/ppmp-documents/$docId", params: { docId: String(data.id) } });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const canSubmit = form.project_id > 0;

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <PageHeader eyebrow="Budget & Planning" title="New PPMP Document" subtitle="Create a new Project Procurement Management Plan." />

      <Link to="/ppmp-documents">
        <Button variant="ghost" size="sm"><ArrowLeft className="mr-1.5 h-4 w-4" />Back</Button>
      </Link>

      <Card>
        <CardHeader><CardTitle>Document Details</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Project *</Label>
              <Select value={form.project_id ? String(form.project_id) : ""} onValueChange={(v) => setForm({ ...form, project_id: Number(v) })}>
                <SelectTrigger><SelectValue placeholder="Select project" /></SelectTrigger>
                <SelectContent>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={String(p.id)}>{p.title} ({p.code})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Source of Funds</Label>
              <Select value={form.fund_source_id ? String(form.fund_source_id) : "none"} onValueChange={(v) => setForm({ ...form, fund_source_id: v === "none" ? undefined : Number(v) })}>
                <SelectTrigger><SelectValue placeholder="Select fund source" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Not specified</SelectItem>
                  {fundSources.map((fs) => (
                    <SelectItem key={fs.id} value={String(fs.id)}>{fs.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>PPMP No.</Label>
              <Input value={form.ppmp_no} onChange={(e) => setForm({ ...form, ppmp_no: e.target.value })} placeholder="Auto-generated if blank" />
            </div>
            <div className="space-y-2">
              <Label>Fiscal Year *</Label>
              <Input type="number" value={form.fiscal_year} onChange={(e) => setForm({ ...form, fiscal_year: Number(e.target.value) })} />
            </div>
            <div className="space-y-2">
              <Label>Document Type</Label>
              <Select value={form.document_type} onValueChange={(v) => setForm({ ...form, document_type: v as "Indicative" | "Final" })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Indicative">Indicative</SelectItem>
                  <SelectItem value="Final">Final</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>End-User Unit</Label>
            <Input value={form.end_user_unit} onChange={(e) => setForm({ ...form, end_user_unit: e.target.value })} placeholder="e.g. Administrative Division" />
          </div>

          <div className="flex justify-end pt-4">
            <Button onClick={() => mutation.mutate()} disabled={!canSubmit || mutation.isPending}>
              {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create PPMP Document
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
