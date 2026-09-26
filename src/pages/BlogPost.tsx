import { articleReading } from "@/lib/articleReading";
import { ArticleContents, ArticleDetails } from "@/components/ArticleDetails";
import { formatPublicDate } from "@/lib/publicDate";
import { z } from "zod";
import type {
  PublicPost,
  PublicPillar,
  PublicGeneratedPage,
  PublicSiteSettings,
  PublicNewsItem,
} from "@/lib/publicTypes";
import type { Tables, Json } from "@/integrations/supabase/types";
import { useParams, Link } from "@/lib/router-compat";
import { safeHtml } from "@/lib/safeHtml";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  PUBLIC_POST_SELECT,
  PUBLIC_POST_SEO_SELECT,
} from "@/lib/publicColumns";
import { ArrowLeft, ArrowRight, Clock, Calendar, BookOpen } from "lucide-react";
import StructuredData from "@/components/StructuredData";
import PageHead from "@/components/PageHead";
import WidgetRenderer from "@/components/WidgetRenderer";
import { findRelatedNiches } from "@/lib/crossLinkMatcher";
import Nav from "@/components/Nav";
import Footer from "@/components/Footer";
import PublicCTA from "@/components/PublicCTA";
import ArticleLeadCard from "@/components/ArticleLeadCard";
import PageRelatedPosts from "@/components/widgets/PageRelatedPosts";
import { splitArticleHtml } from "@/lib/articleSplit";
import { tagSummitLinksInHtml } from "@/lib/summitLink";
import type { LeadMagnetOffer } from "@/lib/shop.functions";

interface BlogPostProps {
  initialSeo?: {
    meta_title: string | null;
    meta_description: string | null;
    og_image: string | null;
    keywords: string[] | null;
  } | null;
  /** Enabled only inside an authenticated admin preview; RLS still applies. */
  preview?: boolean;
  /** Server-rendered article, so the body is in the initial HTML. */
  initialPost?: PublicPost | null;
  initialSettings?: PublicSiteSettings | null;
  /** The site's free download, offered mid-article and at the end. */
  leadOffer?: LeadMagnetOffer | null;
}

const BlogPost = ({
  initialSeo,
  initialPost,
  initialSettings,
  leadOffer = null,
  preview = false,
}: BlogPostProps = {}) => {
  const { slug } = useParams<{ slug: string }>();

  const { data: post, isLoading } = useQuery({
    queryKey: [preview ? "admin-preview-post" : "public-post", slug],
    queryFn: async () => {
      let query = supabase
        .from("posts")
        .select(PUBLIC_POST_SELECT)
        .eq("slug", slug!);
      if (!preview) query = query.eq("status", "published");
      const { data, error } = await query.maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!slug,
    ...(initialPost
      ? { initialData: initialPost as never, initialDataUpdatedAt: 0 }
      : {}),
  });

  const { data: siteSettings } = useQuery({
    queryKey: ["public-site-settings"],
    queryFn: async () => {
      const { data } = await supabase
        .from("site_settings")
        .select(
          "id, site_name, site_url, author_name, author_title, author_bio, author_credentials, author_social_links, cta_url, cta_headline, cta_subtext, cta_button_text, cta_social_proof, publisher_name, publisher_url, updated_at",
        )
        .limit(1)
        .maybeSingle();
      return data;
    },
    staleTime: 60000,
    ...(initialSettings
      ? { initialData: initialSettings as never, initialDataUpdatedAt: 0 }
      : {}),
  });

  // Fetch SEO keywords for matching
  const { data: seoMeta } = useQuery({
    queryKey: ["post-seo-meta", post?.id],
    ...(initialSeo ? { initialData: initialSeo } : {}),
    queryFn: async () => {
      const { data } = await supabase
        .from("seo_metadata")
        .select(PUBLIC_POST_SEO_SELECT)
        .eq("post_id", post!.id)
        .maybeSingle();
      return data;
    },
    enabled: !!post?.id,
    staleTime: 60000,
  });

  // Fetch active niches for cross-link matching. Only display columns —
  // the full `context` jsonb is admin-only and not exposed publicly.
  const { data: allNiches } = useQuery({
    queryKey: ["all-niches-for-crosslink"],
    queryFn: async () => {
      const { data } = await supabase
        .from("niches")
        .select("id, name, slug")
        .eq("is_active", true);
      return (data ?? []).map((n) => ({ ...n, context: null }));
    },
    staleTime: 120000,
  });

  // Find matching niches
  const matchedNiches =
    post && allNiches
      ? findRelatedNiches(
          (seoMeta?.keywords as string[]) || [],
          post.categories?.name || "",
          allNiches,
          1,
          3,
        )
      : [];

  // Fetch pillar + generated pages for matched niches
  const matchedNicheIds = matchedNiches.map((m) => m.nicheId);
  const { data: crossLinkData } = useQuery({
    queryKey: ["blog-crosslinks", matchedNicheIds],
    queryFn: async () => {
      const { data: pillars } = await supabase
        .from("pillar_pages")
        .select("id, title, slug, niche_id")
        .in("niche_id", matchedNicheIds)
        .eq("status", "published");
      const { data: pages } = await supabase
        .from("generated_pages")
        .select(
          "id, title, slug, niche_id, content_schema_id, content_schemas(slug), niches!generated_pages_niche_id_fkey(slug)",
        )
        .in("niche_id", matchedNicheIds)
        .eq("status", "published")
        .limit(6);
      return { pillars: pillars ?? [], pages: pages ?? [] };
    },
    enabled: matchedNicheIds.length > 0,
    staleTime: 60000,
  });

  const reading = articleReading(post?.content || "", post?.title || "");
  const [bodyStart, bodyRest] = splitArticleHtml(
    tagSummitLinksInHtml(reading.html, "article-mid"),
    0.4,
  );
  const takeaways = z
    .array(z.string())
    .catch([])
    .parse(post?.key_takeaways)
    .filter((item) => item.trim().length > 0);
  const blogFaqs = z
    .array(z.object({ question: z.string(), answer: z.string() }))
    .catch([])
    .parse(post?.faq_items);

  if (isLoading) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ background: "var(--site-surface, var(--brand-backdrop))" }}
      >
        <p className="font-body text-body text-white/70">Loading…</p>
      </div>
    );
  }

  if (!post) {
    return (
      <div
        className="min-h-screen flex flex-col items-center justify-center gap-6"
        style={{ background: "var(--site-surface, var(--brand-backdrop))" }}
      >
        <p className="font-display text-title text-white">Post not found</p>
        <Link
          to="/blog"
          className="font-body text-label uppercase tracking-[0.15em] text-[var(--site-accent-ink,var(--brand-accent))]"
        >
          ← Back to Blog
        </Link>
      </div>
    );
  }

  return (
    <div className="public-site min-h-screen bg-[var(--site-surface,#0b0b10)] text-white">
      <Nav />
      <article
        id="main-content"
        className="mx-auto max-w-[820px] px-6 pt-32 pb-24 lg:px-14"
      >
        <Link
          to="/blog"
          className="mb-12 inline-flex items-center gap-2 font-body text-label uppercase tracking-[0.18em] text-white/70 transition-colors duration-200 hover:text-[var(--site-accent-ink,var(--brand-accent))]"
        >
          <ArrowLeft size={14} aria-hidden="true" />
          Back to Blog
        </Link>

        {/* Meta */}
        <div className="mb-6 flex flex-wrap items-center gap-4">
          {post.categories?.name && (
            <span className="font-body text-label uppercase tracking-[0.15em] text-[var(--site-accent-ink,var(--brand-accent))]">
              {post.categories.name}
            </span>
          )}
          <span className="flex items-center gap-1 font-body text-meta text-white/75">
            <Calendar size={13} aria-hidden="true" />
            {formatPublicDate(post.created_at, {
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          </span>
          <span className="flex items-center gap-1 font-body text-meta text-white/75">
            <Clock size={13} aria-hidden="true" />
            {post.reading_time ?? 1} min read
          </span>
        </div>

        <p className="mb-5 font-body text-meta text-white/75">
          By {siteSettings?.author_name || "the editorial team"}
          {post.updated_at &&
            new Date(post.updated_at).toISOString().slice(0, 10) !==
              new Date(post.published_at || post.created_at)
                .toISOString()
                .slice(0, 10) && (
              <> · Updated {formatPublicDate(post.updated_at)}</>
            )}
        </p>
        {/* Title: upright serif, matching the home page and Shop */}
        <h1 className="mb-8 font-display text-headline">{post.title}</h1>

        <ArticleContents headings={reading.headings} />
        {/* Reading surface wrapper */}
        <div className="border border-white/[0.06] bg-[var(--site-surface,#14141b)] p-[clamp(24px,4vw,40px)]">
          {/* TL;DR */}
          {post.tldr && (
            <div className="answer-block mb-10 border-l-[3px] border-[var(--brand-accent)] bg-[rgba(var(--brand-accent-rgb),0.06)] p-6">
              <span className="mb-2 block font-body text-label uppercase tracking-[0.15em] text-[var(--site-accent-ink,var(--brand-accent))]">
                TL;DR
              </span>
              <p className="font-body text-lead text-white/90">{post.tldr}</p>
            </div>
          )}

          {/* Key Takeaways: up front, so skimmers get the answer first */}
          {takeaways.length > 0 && (
            <section
              aria-labelledby="key-takeaways"
              className="mb-10 border border-[rgba(var(--brand-accent-rgb),0.25)] bg-[rgba(var(--brand-accent-rgb),0.04)] p-6 sm:p-8"
            >
              <h2
                id="key-takeaways"
                className="mb-5 font-display text-title text-[var(--site-accent-ink,var(--brand-accent))]"
              >
                Key Takeaways
              </h2>
              <ul className="flex flex-col gap-3">
                {takeaways.map((item, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-3 font-body text-body text-white/85"
                  >
                    <span
                      aria-hidden="true"
                      className="mt-0.5 text-[var(--site-accent-ink,var(--brand-accent))]"
                    >
                      →
                    </span>
                    {item}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Featured image */}
          {post.featured_image && (
            <img
              src={post.featured_image}
              alt={post.featured_image_alt || post.title}
              loading="lazy"
              className="mb-10 max-h-[450px] w-full object-cover"
            />
          )}

          {/* Content, with the signup card about 40% of the way through */}
          <div
            className="blog-content font-body text-lead text-white/90"
            dangerouslySetInnerHTML={{ __html: bodyStart }}
          />
          {bodyRest && (
            <>
              <ArticleLeadCard offer={leadOffer} placement="article-mid" />
              <div
                className="blog-content font-body text-lead text-white/90"
                dangerouslySetInnerHTML={{ __html: bodyRest }}
              />
            </>
          )}
        </div>

        {/* FAQ */}
        {blogFaqs.length > 0 && (
          <section aria-labelledby="article-faq" className="mt-14">
            <h2
              id="article-faq"
              className="mb-6 font-display text-title text-white"
            >
              FAQ
            </h2>
            <div className="flex flex-col gap-6">
              {blogFaqs.map((faq, i) => (
                <div key={i} className="border-b border-white/[0.08] pb-6">
                  <h3 className="mb-2 font-body text-body font-semibold text-white/90">
                    {faq.question}
                  </h3>
                  <p className="faq-answer font-body text-body text-white/75">
                    {faq.answer}
                  </p>
                </div>
              ))}
            </div>
          </section>
        )}

        <ArticleLeadCard offer={leadOffer} placement="article-end" />

        <ArticleDetails
          settings={siteSettings}
          sources={post.source_citations}
        />

        <PublicCTA
          variant="end"
          pageId={post.id}
          pageType="post"
          summitPlacement="article-end"
        />

        <div className="mt-16">
          <PageRelatedPosts
            config={{ count: 3 }}
            pageContext={{
              postId: post.id,
              categoryId: post.category_id ?? undefined,
            }}
          />
        </div>

        {/* Cross-links into silo structure */}
        {crossLinkData &&
          (crossLinkData.pillars.length > 0 ||
            crossLinkData.pages.length > 0) && (
            <div className="mt-16">
              <h2 className="mb-6 font-display text-title">
                Related Resources
              </h2>

              {/* Pillar links — prominent */}
              {crossLinkData.pillars.map((p) => {
                const niche = matchedNiches.find(
                  (m) => m.nicheId === p.niche_id,
                );
                return (
                  <a
                    key={p.id}
                    href={`/guides/${p.slug}`}
                    className="group mb-4 flex items-center gap-4 border border-[rgba(var(--brand-accent-rgb),0.15)] bg-[rgba(var(--brand-accent-rgb),0.04)] p-5 no-underline transition-colors duration-300 hover:border-[rgba(var(--brand-accent-rgb),0.35)]"
                  >
                    <BookOpen
                      size={20}
                      aria-hidden="true"
                      className="shrink-0 text-[var(--site-accent-ink,var(--brand-accent))]"
                    />
                    <div className="flex-1">
                      <span className="mb-1 block font-body text-label uppercase tracking-[0.12em] text-white/70">
                        Complete Guide{niche ? ` · ${niche.nicheName}` : ""}
                      </span>
                      <span className="font-body text-body font-medium text-white/85 transition-colors group-hover:text-[var(--site-accent-ink,var(--brand-accent))]">
                        {p.title}
                      </span>
                    </div>
                    <ArrowRight
                      size={16}
                      aria-hidden="true"
                      className="shrink-0 text-white/60 transition-colors group-hover:text-[var(--site-accent-ink,var(--brand-accent))]"
                    />
                  </a>
                );
              })}

              {/* Generated page links */}
              {crossLinkData.pages.length > 0 && (
                <div className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                  {crossLinkData.pages.slice(0, 3).map((pg) => (
                    <a
                      key={pg.id}
                      href={`/resources/${pg.content_schemas?.slug}/${pg.slug}`}
                      className="group block border border-white/[0.08] p-4 no-underline transition-colors duration-300 hover:border-[rgba(var(--brand-accent-rgb),0.3)]"
                    >
                      <h3 className="mb-1 font-body text-meta font-medium text-white/85 transition-colors group-hover:text-[var(--site-accent-ink,var(--brand-accent))]">
                        {pg.title}
                      </h3>
                      <span className="flex items-center gap-1 font-body text-label uppercase tracking-[0.1em] text-white/70 transition-colors group-hover:text-[var(--site-accent-ink,var(--brand-accent))]">
                        View <ArrowRight size={12} aria-hidden="true" />
                      </span>
                    </a>
                  ))}
                </div>
              )}
            </div>
          )}

        <div className="mt-16">
          <WidgetRenderer
            zone="page"
            exclude={["page-related-posts"]}
            pageContext={{
              postId: post.id,
              categoryId: post.category_id ?? undefined,
            }}
          />
        </div>
      </article>
      <Footer />
    </div>
  );
};

export default BlogPost;
