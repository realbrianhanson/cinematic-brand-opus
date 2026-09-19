import { createFileRoute } from "@tanstack/react-router";
import StartHere from "@/pages/StartHere";
import { getShopShowcase } from "@/lib/shop.functions";
import { informationPageHead } from "@/lib/informationPages";

export const Route = createFileRoute("/start-here")({
  loader: async () => ({ offers: await getShopShowcase() }),
  head: ({ matches }) => informationPageHead("/start-here", matches),
  component: StartHereRoute,
});
function StartHereRoute() {
  return <StartHere offers={Route.useLoaderData().offers} />;
}
