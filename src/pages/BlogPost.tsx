import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, ArrowRight, Clock, Calendar, BookOpen } from "lucide-react";
import StructuredData from "@/components/StructuredData";
import PageHead from "@/components/PageHead";
import WidgetRenderer from "@/components/WidgetRenderer";
import { findRelatedNiches } from "@/lib/crossLinkMatcher";
import Nav from "@/components/Nav";

const BlogPost = () => {
  const { slug } = useParams<{ slug: string }>();

  const { data: post, isLoading } = useQuery({
    queryKey: ["public-post", slug],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("posts")
        .select("*, categories(name, slug)")
        .eq("slug", slug!)
        .eq("status", "published")
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!slug,
  });

  const { data: siteSettings } = useQuery({
    queryKey: ["public-site-settings"],
    queryFn: async () => {
      const { data } = await supabase.from("site_settings").select("*").limit(1).maybeSingle();
      return data;
    },
    staleTime: 60000,
  });

  // Fetch SEO keywords for matching
  const { data: seoMeta } = useQuery({
    queryKey: ["post-seo-meta", post?.id],
    queryFn: async () => {
      const { data } = await supabase.from("seo_metadata").select("keywords").eq("post_id", post!.id).maybeSingle();
      return data;
    },
    enabled: !!post?.id,
    staleTime: 60000,
  });

  // Fetch all niches for matching
  const { data: allNiches } = useQuery({
    queryKey: ["all-niches-for-crosslink"],
    queryFn: async () => {
      const { data } = await supabase.from("niches").select("id, name, slug, context").eq("is_active", true);
      return data ?? [];
    },
    staleTime: 120000,
  });

  // Find matching niches
  const matchedNiches = post && allNiches
    ? findRelatedNiches(
        (seoMeta?.keywords as string[]) || [],
        (post as any).categories?.name || "",
        allNiches,
        1,
        3
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
        .select("id, title, slug, niche_id, content_schema_id, content_schemas(slug), niches(slug)")
        .in("niche_id", matchedNicheIds)
        .eq("status", "published")
        .limit(6);
      return { pillars: pillars ?? [], pages: pages ?? [] };
    },
    enabled: matchedNicheIds.length > 0,
    staleTime: 60000,
  });

  const blogFaqs = post?.faq_items && Array.isArray(post.faq_items) ? (post.faq_items as any[]) : undefined;

  if (isLoading) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ background: "#07070E" }}
      >
        <p className="font-body" style={{ color: "rgba(255,255,255,0.3)" }}>
          Loading...
        </p>
      </div>
    );
  }

  if (!post) {
    return (
      <div
        className="min-h-screen flex flex-col items-center justify-center gap-6"
        style={{ background: "#07070E" }}
      >
        <p className="font-display italic text-2xl" style={{ color: "#fff" }}>
          Post not found
        </p>
        <Link
          to="/blog"
          className="font-body uppercase"
          style={{ fontSize: 12, letterSpacing: "0.15em", color: "#D4AF55" }}
        >
          ← Back to Blog
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: "#07070E", color: "#fff" }}>
      <Nav />
      <PageHead
        title={post.title}
        description={post.excerpt || post.tldr || ""}
        url={`${siteSettings?.site_url || ""}/blog/${slug}`}
        image={post.featured_image || undefined}
        publishedAt={post.created_at}
        updatedAt={post.updated_at}
        authorName={siteSettings?.author_name}
      />
      <article id="main-content" className="mx-auto px-6 lg:px-14 pt-32 pb-24" style={{ maxWidth: 800 }}>
        <StructuredData
          pageType="blog"
          title={post.title}
          description={post.excerpt || post.tldr || ""}
          url={`${siteSettings?.site_url || ""}/blog/${slug}`}
          publishedAt={post.created_at}
          updatedAt={post.updated_at}
          breadcrumbs={[
            { name: "Home", url: siteSettings?.site_url || "/" },
            { name: "Blog", url: `${siteSettings?.site_url || ""}/blog` },
            { name: post.title, url: `${siteSettings?.site_url || ""}/blog/${slug}` },
          ]}
          faqs={blogFaqs}
          siteSettings={siteSettings}
        />
        <Link
          to="/blog"
          className="inline-flex items-center gap-2 font-body uppercase mb-12 transition-colors duration-200"
          style={{
            fontSize: 11,
            letterSpacing: "0.18em",
            color: "rgba(255,255,255,0.4)",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "#D4AF55")}
          onMouseLeave={(e) =>
            (e.currentTarget.style.color = "rgba(255,255,255,0.4)")
          }
        >
          <ArrowLeft size={14} />
          Back to Blog
        </Link>

        {/* Meta */}
        <div className="flex items-center gap-4 mb-6">
          {(post as any).categories?.name && (
            <span
              className="font-body uppercase"
              style={{ fontSize: 10, letterSpacing: "0.15em", color: "#D4AF55" }}
            >
              {(post as any).categories.name}
            </span>
          )}
          <span
            className="font-body flex items-center gap-1"
            style={{ fontSize: 11, color: "rgba(255,255,255,0.25)" }}
          >
            <Calendar size={11} />
            {new Date(post.created_at).toLocaleDateString("en-US", {
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          </span>
          <span
            className="font-body flex items-center gap-1"
            style={{ fontSize: 11, color: "rgba(255,255,255,0.25)" }}
          >
            <Clock size={11} />
            {post.reading_time ?? 1} min read
          </span>
        </div>

        {/* Title */}
        <h1
          className="font-display italic mb-8"
          style={{
            fontSize: "clamp(2rem, 5vw, 3.5rem)",
            lineHeight: 1.15,
          }}
        >
          {post.title}
        </h1>

        {/* TL;DR */}
        {post.tldr && (
          <div
            className="answer-block mb-10 p-6"
            style={{
              borderLeft: "3px solid #D4AF55",
              background: "rgba(212,175,85,0.04)",
            }}
          >
            <span
              className="font-body uppercase block mb-2"
              style={{
                fontSize: 10,
                letterSpacing: "0.15em",
                color: "#D4AF55",
              }}
            >
              TL;DR
            </span>
            <p
              className="font-body"
              style={{ fontSize: 15, color: "rgba(255,255,255,0.6)", lineHeight: 1.7 }}
            >
              {post.tldr}
            </p>
          </div>
        )}

        {/* Featured image */}
        {post.featured_image && (
          <img
            src={post.featured_image}
            alt={post.title}
            className="w-full mb-10"
            style={{ maxHeight: 450, objectFit: "cover" }}
          />
        )}

        {/* Content */}
        <div
          className="blog-content font-body"
          style={{
            fontSize: 16,
            lineHeight: 1.85,
            color: "rgba(255,255,255,0.65)",
          }}
          dangerouslySetInnerHTML={{ __html: post.content ?? "" }}
        />

        {/* Key Takeaways */}
        {post.key_takeaways &&
          Array.isArray(post.key_takeaways) &&
          (post.key_takeaways as string[]).length > 0 && (
            <div
              className="mt-14 p-8"
              style={{
                border: "1px solid rgba(212,175,85,0.15)",
                background: "rgba(212,175,85,0.03)",
              }}
            >
              <h3
                className="font-display italic mb-5"
                style={{ fontSize: 22, color: "#D4AF55" }}
              >
                Key Takeaways
              </h3>
              <ul className="flex flex-col gap-3">
                {(post.key_takeaways as string[]).map((item, i) => (
                  <li
                    key={i}
                    className="font-body flex items-start gap-3"
                    style={{
                      fontSize: 14,
                      color: "rgba(255,255,255,0.55)",
                      lineHeight: 1.6,
                    }}
                  >
                    <span style={{ color: "#D4AF55", marginTop: 2 }}>→</span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          )}

        {/* FAQ */}
        {post.faq_items &&
          Array.isArray(post.faq_items) &&
          (post.faq_items as any[]).length > 0 && (
            <div className="mt-14">
              <h3
                className="font-display italic mb-6"
                style={{ fontSize: 22, color: "#fff" }}
              >
                FAQ
              </h3>
              <div className="flex flex-col gap-6">
                {(post.faq_items as any[]).map((faq, i) => (
                  <div
                    key={i}
                    className="pb-6"
                    style={{
                      borderBottom: "1px solid rgba(255,255,255,0.06)",
                    }}
                  >
                    <h4
                      className="font-body font-semibold mb-2"
                      style={{ fontSize: 15, color: "rgba(255,255,255,0.8)" }}
                    >
                      {faq.question}
                    </h4>
                    <p
                      className="faq-answer font-body"
                      style={{
                        fontSize: 14,
                        color: "rgba(255,255,255,0.45)",
                        lineHeight: 1.7,
                      }}
                    >
                      {faq.answer}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

        <WidgetRenderer zone="page" pageContext={{ postId: post.id, categoryId: (post as any).categories?.id }} />

        {/* Cross-links into silo structure */}
        {crossLinkData && (crossLinkData.pillars.length > 0 || crossLinkData.pages.length > 0) && (
          <div className="mt-16">
            <h2 className="font-display italic mb-6" style={{ fontSize: 22 }}>Related Resources</h2>

            {/* Pillar links — prominent */}
            {crossLinkData.pillars.map((p) => {
              const niche = matchedNiches.find((m) => m.nicheId === p.niche_id);
              return (
                <a
                  key={p.id}
                  href={`/guides/${p.slug}`}
                  className="group flex items-center gap-4 mb-4 p-5"
                  style={{
                    border: "1px solid rgba(212,175,85,0.15)",
                    background: "rgba(212,175,85,0.04)",
                    textDecoration: "none",
                    transition: "border-color 0.3s",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.borderColor = "rgba(212,175,85,0.35)")}
                  onMouseLeave={(e) => (e.currentTarget.style.borderColor = "rgba(212,175,85,0.15)")}
                >
                  <BookOpen size={20} style={{ color: "hsl(var(--accent))", flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    <span className="font-body uppercase block" style={{ fontSize: 9, letterSpacing: "0.12em", color: "rgba(255,255,255,0.35)", marginBottom: 4 }}>
                      📖 Complete Guide{niche ? ` · ${niche.nicheName}` : ""}
                    </span>
                    <span className="font-body font-medium group-hover:text-[#D4AF55] transition-colors" style={{ fontSize: 15, color: "rgba(255,255,255,0.8)" }}>
                      {p.title}
                    </span>
                  </div>
                  <ArrowRight size={16} className="shrink-0 group-hover:text-[#D4AF55] transition-colors" style={{ color: "rgba(255,255,255,0.2)" }} />
                </a>
              );
            })}

            {/* Generated page links */}
            {crossLinkData.pages.length > 0 && (
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3 mt-4">
                {crossLinkData.pages.slice(0, 3).map((pg: any) => (
                  <a
                    key={pg.id}
                    href={`/resources/${pg.content_schemas?.slug}/${pg.niches?.slug}`}
                    className="group block p-4"
                    style={{ border: "1px solid rgba(255,255,255,0.06)", textDecoration: "none", transition: "border-color 0.3s" }}
                    onMouseEnter={(e) => (e.currentTarget.style.borderColor = "rgba(212,175,85,0.2)")}
                    onMouseLeave={(e) => (e.currentTarget.style.borderColor = "rgba(255,255,255,0.06)")}
                  >
                    <h3 className="font-body font-medium mb-1 group-hover:text-[#D4AF55] transition-colors" style={{ fontSize: 13, color: "rgba(255,255,255,0.7)", lineHeight: 1.4 }}>
                      {pg.title}
                    </h3>
                    <span className="font-body uppercase flex items-center gap-1 group-hover:text-[#D4AF55] transition-colors" style={{ fontSize: 10, letterSpacing: "0.1em", color: "rgba(255,255,255,0.25)" }}>
                      View <ArrowRight size={10} />
                    </span>
                  </a>
                ))}
              </div>
            )}
          </div>
        )}
      </article>
    </div>
  );
};

export default BlogPost;
