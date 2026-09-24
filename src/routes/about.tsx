import { createFileRoute, notFound } from "@tanstack/react-router";
import { getSiteBranding } from "@/lib/branding.functions";
import { getPublicSiteSettings } from "@/lib/publicData.functions";
import { aboutPageHead } from "@/lib/aboutPage";
import { buildPageHead } from "@/lib/seoHead";
import AboutPage from "@/pages/AboutPage";
import PublicRouteError from "@/components/PublicRouteError";

export const Route = createFileRoute("/about")({
  loader: async () => {
    const [config, settings] = await Promise.all([
      getSiteBranding(),
      // The bio is optional: the page still renders from the site story.
      getPublicSiteSettings().catch(() => null),
    ]);
    if (!config.sections.story) throw notFound();
    return { config, settings };
  },
  head: ({ loaderData }) =>
    loaderData
      ? aboutPageHead(loaderData.config, loaderData.settings)
      : buildPageHead({
          title: "Page not found",
          description: "This page is unavailable",
          url: "",
          robots: "noindex, nofollow",
        }),
  component: AboutRoute,
  errorComponent: () => (
    <PublicRouteError message="This page could not be loaded" />
  ),
});

function AboutRoute() {
  const { settings } = Route.useLoaderData();
  return <AboutPage settings={settings} />;
}
