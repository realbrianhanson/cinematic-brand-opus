import { configFromMatches } from "@/config/runtime";
import { createFileRoute, notFound } from "@tanstack/react-router";

import ContentTypeList from "@/pages/ContentTypeList";
import NotFound from "@/pages/NotFound";
import {
  resourceSearch,
  resourceArchivePath,
} from "../../supabase/functions/_shared/resourcePagination";
import PublicRouteError from "@/components/PublicRouteError";
import {
  getPublicContentType,
  getPublicSiteSettings,
} from "@/lib/publicData.functions";
import {
  breadcrumbJsonLd,
  buildPageHead,
  compactJsonLd,
  itemListJsonLd,
  websiteJsonLd,
} from "@/lib/seoHead";
import { absoluteUrl, pageTitle } from "@/config/site";

export const Route = createFileRoute("/resources/$contentType/")({
  validateSearch: resourceSearch,
  loaderDeps: ({ search }) => ({ page: search.page, niche: search.niche }),
  loader: async ({ params, deps }) => {
    const [result, settings] = await Promise.all([
      getPublicContentType({
        data: { contentType: params.contentType, ...deps },
      }),
      getPublicSiteSettings(),
    ]);
    if (!result || (deps.page > 1 && !result.pages.length)) throw notFound();
    return { ...result, settings };
  },
  head: ({ loaderData, params, matches }) => {
    const config = configFromMatches(matches);
    if (!loaderData) return {};
    const { schema, pages, settings, page, niche } = loaderData;
    const url = absoluteUrl(
      resourceArchivePath(params.contentType, page, niche),
      config,
    );

    const head = buildPageHead({
      title: pageTitle(
        `${schema.name}${page > 1 ? ` — Page ${page}` : ""}`,
        config,
      ),
      ...(!pages.length ? { robots: "noindex, follow" } : {}),
      description:
        schema.description ||
        `Browse ${schema.name} resources organized by industry.`,
      url,
      type: "website",
      jsonLd: compactJsonLd([
        websiteJsonLd(settings),
        itemListJsonLd(pages.map((p) => p.title).slice(0, 50)),
        breadcrumbJsonLd([
          { name: "Home", url: absoluteUrl("/", config) },
          { name: "Resources", url: absoluteUrl("/resources", config) },
          { name: schema.name, url },
        ]),
      ]),
    });
    if (page > 1)
      head.links.push({
        rel: "prev",
        href: absoluteUrl(
          resourceArchivePath(params.contentType, page - 1, niche),
          config,
        ),
      });
    if (loaderData.nextPage !== null)
      head.links.push({
        rel: "next",
        href: absoluteUrl(
          resourceArchivePath(params.contentType, loaderData.nextPage, niche),
          config,
        ),
      });
    return head;
  },
  component: ContentTypeRoute,
  errorComponent: () => (
    <PublicRouteError message="This resource list could not be loaded" />
  ),
  notFoundComponent: () => <NotFound />,
});

function ContentTypeRoute() {
  const result = Route.useLoaderData();
  return (
    <ContentTypeList
      initialResult={result}
      page={result.page}
      niche={result.niche}
    />
  );
}
