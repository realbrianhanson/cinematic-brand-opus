import { createFileRoute } from "@tanstack/react-router";
import { adminHead } from "@/lib/adminHead";
import OfferEditor from "@/components/admin/OfferEditor";
import AdminFunnelBuilder from "@/pages/AdminFunnelBuilder";
import { validateOfferStarterSearch } from "@/lib/offerStarters";

export const Route = createFileRoute("/admin/offers/new")({
  head: adminHead("New offer"),
  validateSearch: validateOfferStarterSearch,
  component: NewOffer,
});

function NewOffer() {
  const { starter } = Route.useSearch();
  return starter ? <OfferEditor starter={starter} /> : <AdminFunnelBuilder />;
}
