import { createFileRoute } from "@tanstack/react-router";
import StartHere from "@/pages/StartHere";
import { getShopShowcase, getStartHereOffers } from "@/lib/shop.functions";
import { informationPageHead } from "@/lib/informationPages";

export const Route = createFileRoute("/start-here")({
  loader: async () => {
    const [offers, goalOffers] = await Promise.all([
      getShopShowcase(),
      getStartHereOffers(),
    ]);
    return { offers, goalOffers };
  },
  head: ({ matches }) => informationPageHead("/start-here", matches),
  component: StartHereRoute,
});
function StartHereRoute() {
  return <StartHere {...Route.useLoaderData()} />;
}
