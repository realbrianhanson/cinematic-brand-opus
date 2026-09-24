import { createFileRoute } from "@tanstack/react-router";
import { adminHead } from "@/lib/adminHead";
import OfferEditor from "@/components/admin/OfferEditor";

export const Route = createFileRoute("/admin/offers/new")({
  head: adminHead("New offer"),
  component: () => <OfferEditor />,
});
