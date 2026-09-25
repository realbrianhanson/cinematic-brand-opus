import { configFromMatches } from "@/config/runtime";
import { createFileRoute, notFound } from "@tanstack/react-router";
import Blog from "@/pages/Blog";
import PublicRouteError from "@/components/PublicRouteError";
import { getPublicPostsFirstPage } from "@/lib/publicData.functions";
import { buildPageHead } from "@/lib/seoHead";
import { absoluteUrl, pageTitle } from "@/config/site";
import {
  blogSearch,
  blogArchivePath,
} from "../../supabase/functions/_shared/blogPagination";

export const Route = createFileRoute("/blog/")({
  validateSearch: blogSearch,
  loaderDeps: ({ search }) => ({
    category: search.category,
    page: search.page,
  }),
  loader: async ({ deps }) => {
    const result = await getPublicPostsFirstPage({ data: deps });
    if (deps.page > 1 && !result.items.length) throw notFound();
    return result;
  },
  head: ({ matches, loaderData }) => {
    const config = configFromMatches(matches);
    const page = loaderData?.page ?? 1;
    const category = loaderData?.category ?? "";
    const head = buildPageHead({
      title: pageTitle(
        `Articles & Playbooks${category ? ` — ${category}` : ""}${page > 1 ? ` — Page ${page}` : ""}`,
        config,
      ),
      description: config.content.blogDescription,
      url: absoluteUrl(blogArchivePath(page, category), config),
      type: "website",
      ...(!loaderData?.items.length ? { robots: "noindex, follow" } : {}),
    });
    if (page > 1)
      head.links.push({
        rel: "prev",
        href: absoluteUrl(blogArchivePath(page - 1, category), config),
      });
    if (loaderData?.nextPage != null)
      head.links.push({
        rel: "next",
        href: absoluteUrl(blogArchivePath(page + 1, category), config),
      });
    return head;
  },
  component: BlogRoute,
  errorComponent: () => (
    <PublicRouteError message="The article list could not be loaded" />
  ),
});

function BlogRoute() {
  const initialPage = Route.useLoaderData();
  const { category, page } = Route.useSearch();
  return <Blog initialPage={initialPage} category={category} page={page} />;
}
