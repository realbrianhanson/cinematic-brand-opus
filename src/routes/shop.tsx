import { createFileRoute, stripSearchParams } from "@tanstack/react-router";
import { configFromMatches } from "@/config/runtime";
import { absoluteUrl, pageTitle } from "@/config/site";
import { buildPageHead, breadcrumbJsonLd, compactJsonLd } from "@/lib/seoHead";
import { getShopCatalog } from "@/lib/shop.functions";
import { shopFilters } from "@/lib/shop";
import Shop from "@/pages/Shop";
import PublicRouteError from "@/components/PublicRouteError";

export const Route = createFileRoute("/shop")({
  validateSearch: shopFilters,
  search: {
    middlewares: [
      stripSearchParams({ q: "", category: "all", price: "all", page: 1 }),
    ],
  },
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) => getShopCatalog({ data: { ...deps } }),
  head: ({ loaderData, matches, match }) => {
    const config = configFromMatches(matches);
    const filters = shopFilters({ ...match.search });
    const url = absoluteUrl("/shop", config);
    const description =
      "Explore trainings, courses, tools, and practical resources. Browse free downloads and paid digital offers in one place";
    return buildPageHead({
      title: pageTitle("Shop: Trainings, Tools & Resources", config),
      description,
      url,
      type: "website",
      robots:
        filters.q ||
        filters.category !== "all" ||
        filters.price !== "all" ||
        filters.page > 1
          ? "noindex, follow"
          : null,
      jsonLd: compactJsonLd([
        breadcrumbJsonLd([
          { name: "Home", url: absoluteUrl("/", config) },
          { name: "Shop", url },
        ]),
        {
          "@context": "https://schema.org",
          "@type": "CollectionPage",
          name: `Shop | ${config.identity.name}`,
          description,
          url,
          mainEntity: {
            "@type": "ItemList",
            itemListElement: (loaderData?.items || []).map((offer, index) => ({
              "@type": "ListItem",
              position:
                ((loaderData?.page || 1) - 1) * (loaderData?.pageSize || 24) +
                index +
                1,
              name: offer.title,
              url: absoluteUrl(`/offers/${offer.slug}`, config),
            })),
          },
        },
      ]),
    });
  },
  component: ShopRoute,
  errorComponent: () => (
    <PublicRouteError message="The shop could not be loaded" />
  ),
});
function ShopRoute() {
  const catalog = Route.useLoaderData();
  const filters = Route.useSearch();
  return <Shop catalog={catalog} filters={filters} />;
}
