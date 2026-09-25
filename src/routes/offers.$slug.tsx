import { createFileRoute, notFound } from "@tanstack/react-router";
import { configFromMatches } from "@/config/runtime";
import { absoluteUrl } from "@/config/site";
import { getPublishedOffer } from "@/lib/offers.functions";
import { getRelatedShopOffers } from "@/lib/shop.functions";
import { buildPageHead } from "@/lib/seoHead";
import OfferLanding from "@/pages/OfferLanding";
import { readPresentation } from "@/lib/offerBuilder";
import { offerSeoText } from "@/lib/offersSeo";
import PublicRouteError from "@/components/PublicRouteError";
import NotFoundRedirect from "@/components/NotFoundRedirect";

export const Route = createFileRoute("/offers/$slug")({
  loader: async ({ params }) => {
    const offer = await getPublishedOffer({ data: { slug: params.slug } });
    if (!offer) throw notFound();
    const relatedOffers =
      offer.funnel_only ||
      readPresentation(offer.presentation)?.landing.focusMode
        ? []
        : await getRelatedShopOffers({ data: { excludeId: offer.id } });
    return { offer, relatedOffers };
  },
  head: ({ loaderData, matches }) => {
    if (!loaderData)
      return {
        meta: [
          { title: "Offer not found" },
          { name: "robots", content: "noindex" },
        ],
      };
    const { offer } = loaderData;
    return buildPageHead({
      ...offerSeoText(offer),
      url: absoluteUrl(`/offers/${offer.slug}`, configFromMatches(matches)),
      image: offer.cover_url,
      type: "website",
      robots: offer.funnel_only ? "noindex, nofollow" : null,
    });
  },
  component: OfferRoute,
  errorComponent: () => (
    <PublicRouteError message="This offer could not be loaded." />
  ),
  // Retired or unknown offers follow a saved redirect or keep the 404.
  notFoundComponent: NotFoundRedirect,
});

function OfferRoute() {
  const { offer, relatedOffers } = Route.useLoaderData();
  return (
    <OfferLanding key={offer.id} offer={offer} relatedOffers={relatedOffers} />
  );
}
