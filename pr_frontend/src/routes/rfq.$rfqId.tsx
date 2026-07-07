import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { getRfq } from "@/lib/rfq-store";
import { toast } from "sonner";

export const Route = createFileRoute("/rfq/$rfqId")({
  head: () => ({
    meta: [{ title: "View RFQ — DOST Caraga" }],
  }),
  component: ViewRfqPage,
});

function ViewRfqPage() {
  const { rfqId } = Route.useParams();
  const navigate = useNavigate();

  useEffect(() => {
    const rfq = getRfq(rfqId);
    if (!rfq) {
      toast.error("RFQ not found.");
      navigate({ to: "/rfq" });
    }
  }, [rfqId, navigate]);

  const rfq = getRfq(rfqId);
  if (!rfq) return null;

  navigate({ to: "/rfq/new", search: { pr: rfq.prId } });
  return null;
}
