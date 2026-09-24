import { createFileRoute, notFound } from "@tanstack/react-router";
import { configFromMatches } from "@/config/runtime";
import { absoluteUrl } from "@/config/site";
import { getPublishedOffer } from "@/lib/offers.functions";
import { getRelatedShopOffers } from "@/lib/shop.functions";
import { buildPageHead } from "@/lib/seoHead";
import OfferLanding from "@/pages/OfferLanding";
import { readPresentation } from "@/lib/offerBuilder";
import { offerSeoText } from "@/lib/offersSeo";
import OfferShell from "@/components/OfferShell";
import PublicRouteError from "@/components/PublicRouteError";

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
  notFoundComponent: () => (
    <OfferShell>
      <h1 className="font-display text-4xl">This offer is not available</h1>
      <p className="mt-5 text-white/75">
        The link may have changed or the offer may no longer be published.
      </p>
      <a href="/" className="inline-block mt-6 underline">
        Back to home
      </a>
    </OfferShell>
  ),
});

function OfferRoute() {
  const { offer, relatedOffers } = Route.useLoaderData();
  return (
    <OfferLanding key={offer.id} offer={offer} relatedOffers={relatedOffers} />
  );
}
