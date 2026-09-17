import { createFileRoute, notFound } from "@tanstack/react-router";

import BlogPost from "@/pages/BlogPost";
import PublicRouteError from "@/components/PublicRouteError";
import { getPublicPostBySlug, getPublicSiteSettings } from "@/lib/publicData.functions";
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
    return { post, settings };
  },
  head: ({ loaderData, params }) => {
    if (!loaderData) return {};
    const { post, settings } = loaderData;
    const url = absoluteUrl(`/blog/${params.slug}`);
    const description = post.excerpt || post.tldr || "";
    const faqs = Array.isArray(post.faq_items)
      ? (post.faq_items as Array<{ question?: unknown; answer?: unknown }>)
      : null;

    return buildPageHead({
      title: post.title,
      description,
      url,
      image: post.featured_image,
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
          { name: "Home", url: absoluteUrl("/") },
          { name: "Blog", url: absoluteUrl("/blog") },
          { name: post.title, url },
        ]),
        speakableJsonLd(),
      ]),
    });
  },
  component: BlogPostRoute,
  errorComponent: () => <PublicRouteError message="This article could not be loaded." />,
  // Anonymous visitors get the 404 shell. Signed-in admins fall through to the
  // component's own authenticated read so drafts stay previewable.
  notFoundComponent: () => <BlogPost />,
});

function BlogPostRoute() {
  const { post, settings } = Route.useLoaderData();
  return <BlogPost initialPost={post} initialSettings={settings} />;
}
