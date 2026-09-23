import { createFileRoute, stripSearchParams } from "@tanstack/react-router";
import { adminHead } from "@/lib/adminHead";
import OffersManager from "@/components/admin/OffersManager";
import { adminOfferSearch } from "@/lib/adminOfferViews";

export const Route = createFileRoute("/admin/offers/")({
  head: adminHead("Offers & shop"),
  validateSearch: adminOfferSearch,
  search: { middlewares: [stripSearchParams({ tab: "offers" })] },
  component: OffersRoute,
});

function OffersRoute() {
  const { tab } = Route.useSearch();
  return <OffersManager tab={tab} />;
}
