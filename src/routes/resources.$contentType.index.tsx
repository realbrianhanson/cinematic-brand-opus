import { createFileRoute, notFound } from "@tanstack/react-router";

import ContentTypeList from "@/pages/ContentTypeList";
import PublicRouteError from "@/components/PublicRouteError";
import { getPublicContentType, getPublicSiteSettings } from "@/lib/publicData.functions";
import {
  breadcrumbJsonLd,
  buildPageHead,
  compactJsonLd,
  itemListJsonLd,
  websiteJsonLd,
} from "@/lib/seoHead";
import { absoluteUrl, pageTitle } from "@/config/site";

export const Route = createFileRoute("/resources/$contentType/")({
  loader: async ({ params }) => {
    const [result, settings] = await Promise.all([
      getPublicContentType({ data: { slug: params.contentType } }),
      getPublicSiteSettings(),
    ]);
    if (!result) throw notFound();
    return { ...result, settings };
  },
  head: ({ loaderData, params }) => {
    if (!loaderData) return {};
    const { schema, pages, settings } = loaderData;
    const url = absoluteUrl(`/resources/${params.contentType}`);

    return buildPageHead({
      title: pageTitle(schema.name),
      description:
        schema.description || `Browse ${schema.name} resources organized by industry.`,
      url,
      type: "website",
      jsonLd: compactJsonLd([
        websiteJsonLd(settings),
        itemListJsonLd(pages.map((p) => p.title).slice(0, 50)),
        breadcrumbJsonLd([
          { name: "Home", url: absoluteUrl("/") },
          { name: "Resources", url: absoluteUrl("/resources") },
          { name: schema.name, url },
        ]),
      ]),
    });
  },
  component: ContentTypeRoute,
  errorComponent: () => <PublicRouteError message="This resource list could not be loaded." />,
  notFoundComponent: () => <ContentTypeList />,
});

function ContentTypeRoute() {
  const { schema, pages } = Route.useLoaderData();
  return <ContentTypeList initialSchema={schema} initialPages={pages} />;
}
