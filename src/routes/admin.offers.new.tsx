import { createFileRoute } from "@tanstack/react-router";
import OfferEditor from "@/components/admin/OfferEditor";

export const Route = createFileRoute("/admin/offers/new")({
  component: () => <OfferEditor />,
});
