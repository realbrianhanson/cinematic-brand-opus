import { createFileRoute, stripSearchParams } from "@tanstack/react-router";
import OffersManager from "@/components/admin/OffersManager";
import { adminOfferSearch } from "@/lib/adminOfferViews";

export const Route = createFileRoute("/admin/offers/")({
  validateSearch: adminOfferSearch,
  search: { middlewares: [stripSearchParams({ tab: "offers" })] },
  component: OffersRoute,
});

function OffersRoute() {
  const { tab } = Route.useSearch();
  return <OffersManager tab={tab} />;
}
