import { configFromMatches } from "@/config/runtime";
import { createFileRoute, notFound } from "@tanstack/react-router";

import BlogPost from "@/pages/BlogPost";
import NotFound from "@/pages/NotFound";
import { useAuth } from "@/contexts/AuthContext";
import PublicRouteError from "@/components/PublicRouteError";
import {
  getPublicPostBySlug,
  getPublicPostSeo,
  getPublicSiteSettings,
} from "@/lib/publicData.functions";
import {
  articleJsonLd,
  breadcrumbJsonLd,
  buildPageHead,
  compactJsonLd,
  faqJsonLd,
  personJsonLd,
  speakableJsonLd,
  websiteJsonLd,
} from "@/lib/seoHead";
import { absoluteUrl } from "@/config/site";

export const Route = createFileRoute("/blog/$slug")({
  loader: async ({ params }) => {
    const [post, settings] = await Promise.all([
      getPublicPostBySlug({ data: { slug: params.slug } }),
      getPublicSiteSettings(),
    ]);
    // Missing published content is a real 404, never an empty page.
    if (!post) throw notFound();
    const seo = await getPublicPostSeo({ data: { postId: post.id } });
    return { post, settings, seo };
  },
  head: ({ loaderData, params, matches }) => {
    const config = configFromMatches(matches);
    if (!loaderData) return {};
    const { post, settings, seo } = loaderData;
    const url = absoluteUrl(`/blog/${params.slug}`, config);
    const description =
      seo?.meta_description || post.excerpt || post.tldr || "";
    const faqs = Array.isArray(post.faq_items)
      ? (post.faq_items as Array<{ question?: unknown; answer?: unknown }>)
      : null;

    return buildPageHead({
      title: seo?.meta_title || post.title,
      description,
      url,
      image: seo?.og_image || post.featured_image,
      type: "article",
      publishedAt: post.published_at ?? post.created_at,
      updatedAt: post.updated_at,
      authorName: settings?.author_name,
      jsonLd: compactJsonLd([
        websiteJsonLd(settings),
        personJsonLd(settings),
        articleJsonLd({
          headline: post.title,
          description,
          url,
          publishedAt: post.published_at ?? post.created_at,
          updatedAt: post.updated_at,
          settings,
        }),
        faqJsonLd(faqs),
        breadcrumbJsonLd([
          { name: "Home", url: absoluteUrl("/", config) },
          { name: "Blog", url: absoluteUrl("/blog", config) },
          { name: post.title, url },
        ]),
        speakableJsonLd(),
      ]),
    });
  },
  component: BlogPostRoute,
  errorComponent: () => (
    <PublicRouteError message="This article could not be loaded." />
  ),
  // Anonymous visitors get the 404 shell. Signed-in admins fall through to the
  // component's own authenticated read so drafts stay previewable.
  notFoundComponent: MissingPost,
});

function MissingPost() {
  const { isAdmin } = useAuth();
  return isAdmin ? <BlogPost preview /> : <NotFound />;
}

function BlogPostRoute() {
  const { post, settings, seo } = Route.useLoaderData();
  return (
    <BlogPost initialSeo={seo} initialPost={post} initialSettings={settings} />
  );
}
