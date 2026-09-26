import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader } from "@/components/app/page-header";
import { ValidationResultPanel } from "@/components/app/validation-result-panel";
import { apiGetPurchaseRequest, apiGetPurchaseRequestMonitoringPage, apiValidatePurchaseRequest } from "@/lib/api";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

export const Route = createFileRoute("/validation")({
  head: () => ({
    meta: [
      { title: "Item Pre-Validation — DOST Caraga" },
      { name: "description", content: "Run pre-validation of items against PPMP, Budget, APP-CSE, and APP-Non-CSE." },
    ],
  }),
  component: ValidationPage,
});

function ValidationPage() {
  // Search the PRs on the server (any of them, not just the newest page), then load the one picked.
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const { data: matches, isLoading: searching } = useQuery({
    queryKey: ["validation-pr-search", search],
    queryFn: () => apiGetPurchaseRequestMonitoringPage(1, 30, { search: search || undefined }),
    placeholderData: (previous) => previous,
  });
  const options = matches?.items ?? [];

  const [prId, setPrId] = useState("");
  const selectedId = prId || options[0]?.prId || "";
  const { data: pr } = useQuery({
    queryKey: ["purchase-request", selectedId],
    queryFn: () => apiGetPurchaseRequest(selectedId),
    enabled: selectedId !== "",
  });

  const validation = useMutation({
    mutationFn: () => apiValidatePurchaseRequest(selectedId),
    onSuccess: () => toast.success("Validation completed against system references."),
    onError: (error) => toast.error(error instanceof Error ? error.message : "Validation failed."),
  });

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
      <PageHeader
        eyebrow="Validation"
        title="Item Pre-Validation"
        subtitle="Validate Purchase Request items against PPMP, Line-Item Budget, APP-CSE, and APP-Non-CSE."
      />

      <Card className="border border-border bg-card p-5">
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
          <div>
            <p className="label-eyebrow mb-1.5">Search</p>
            <Input value={searchInput} onChange={(e) => setSearchInput(e.target.value)} placeholder="PR No. or purpose…" className="h-10 border-border" />
          </div>
          <div>
            <p className="label-eyebrow mb-1.5">Purchase Request{matches ? ` (${matches.total.toLocaleString()} found)` : ""}</p>
            <Select value={selectedId} onValueChange={(v) => { setPrId(v); validation.reset(); }}>
              <SelectTrigger className="h-10 border-border"><SelectValue placeholder={searching ? "Searching…" : "No matches"} /></SelectTrigger>
              <SelectContent>
                {options.map((p) => (
                  <SelectItem key={p.prId} value={p.prId}>{p.prNo} · {p.prStatus}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button className="gap-2" disabled={!pr || validation.isPending} onClick={() => validation.mutate()}><ShieldCheck className="h-4 w-4" /> Re-run Validation</Button>
        </div>
      </Card>

      {pr ? (
        // A fresh re-run, else the checks saved with the PR (switching PRs clears the re-run).
        <ValidationResultPanel items={pr.items} results={validation.data ?? pr.savedValidation} />
      ) : (
        <Card className="border border-border bg-card p-5 text-sm text-muted-foreground">{searching ? "Searching…" : "No purchase requests found."}</Card>
      )}
    </div>
  );
}
