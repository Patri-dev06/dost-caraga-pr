import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader } from "@/components/app/page-header";
import { ValidationResultPanel } from "@/components/app/validation-result-panel";
import { apiGetPurchaseRequests, apiValidatePurchaseRequest } from "@/lib/api";
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
  const { data: purchaseRequests = [] } = useQuery({
    queryKey: ["purchase-requests"],
    queryFn: apiGetPurchaseRequests,
  });
  const [prId, setPrId] = useState("");
  const selectedId = prId || purchaseRequests[0]?.id || "";
  const pr = purchaseRequests.find((p) => p.id === selectedId);
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
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex-1">
            <p className="label-eyebrow mb-1.5">Select Purchase Request</p>
            <Select value={selectedId} onValueChange={setPrId}>
              <SelectTrigger className="h-10 max-w-md border-border"><SelectValue /></SelectTrigger>
              <SelectContent>
                {purchaseRequests.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.prNo} · {p.office}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button className="gap-2" disabled={!pr || validation.isPending} onClick={() => validation.mutate()}><ShieldCheck className="h-4 w-4" /> Re-run Validation</Button>
        </div>
      </Card>

      {pr ? (
        <ValidationResultPanel items={pr.items} results={validation.data} />
      ) : (
        <Card className="border border-border bg-card p-5 text-sm text-muted-foreground">No purchase requests found.</Card>
      )}
    </div>
  );
}
