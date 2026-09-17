import { createFileRoute, useNavigate } from "@tanstack/react-router";

export const Route = createFileRoute("/rfq/$rfqId")({
  head: () => ({
    meta: [{ title: "View RFQ — DOST Caraga" }],
  }),
  component: ViewRfqPage,
});

function ViewRfqPage() {
  const { rfqId } = Route.useParams();
  const navigate = useNavigate();

  navigate({ to: "/rfq/new", search: { rfqId } });
  return null;
}
