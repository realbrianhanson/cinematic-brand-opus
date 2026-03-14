import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import PageHead from "@/components/PageHead";
import Nav from "@/components/Nav";
import Footer from "@/components/Footer";

const HTMLSitemap = () => {
  const { data: siteSettings } = useQuery({
    queryKey: ["public-site-settings"],
    queryFn: async () => {
      const { data } = await supabase.from("site_settings").select("site_name, site_url").limit(1).maybeSingle();
      return data;
    },
    staleTime: 60000,
  });

  const { data: generatedPages } = useQuery({
    queryKey: ["sitemap-generated-pages"],
    queryFn: async () => {
      const { data } = await supabase
        .from("generated_pages")
        .select("id, title, slug, content_schema_id, niche_id, content_schemas(name, slug), niches(name, slug)")
        .eq("status", "published")
        .order("title");
      return data ?? [];
    },
    staleTime: 60000,
  });

  const { data: pillarPages } = useQuery({
    queryKey: ["sitemap-pillar-pages"],
    queryFn: async () => {
      const { data } = await supabase
        .from("pillar_pages")
        .select("id, title, slug")
        .eq("status", "published")
        .order("title");
      return data ?? [];
    },
    staleTime: 60000,
  });

  const { data: blogPosts } = useQuery({
    queryKey: ["sitemap-blog-posts"],
    queryFn: async () => {
      const { data } = await supabase
        .from("posts")
        .select("id, title, slug")
        .eq("status", "published")
        .order("created_at", { ascending: false });
      return data ?? [];
    },
    staleTime: 60000,
  });

  const siteName = siteSettings?.site_name || "Site";
  const siteUrl = siteSettings?.site_url || "";

  // Group generated pages by content type
  const groupedByType: Record<string, { name: string; slug: string; pages: { title: string; nicheSlug: string }[] }> = {};
  for (const page of generatedPages || []) {
    const schema = page.content_schemas as any;
    const niche = page.niches as any;
    if (!schema?.slug || !niche?.slug) continue;
    const key = schema.slug;
    if (!groupedByType[key]) {
      groupedByType[key] = { name: schema.name, slug: schema.slug, pages: [] };
    }
    groupedByType[key].pages.push({ title: page.title, nicheSlug: niche.slug });
  }

  return (
    <div className="min-h-screen" style={{ background: "#07070E", color: "#fff" }}>
      <Nav />
      <PageHead
        title={`Sitemap | ${siteName}`}
        description={`Complete sitemap of all published content on ${siteName}. Browse guides, resources, and blog articles.`}
        url={`${siteUrl}/sitemap`}
      />
      <main id="main-content" className="mx-auto px-6 lg:px-14 pt-32 pb-24" style={{ maxWidth: 900 }}>
        <h1 className="font-display italic mb-4" style={{ fontSize: "clamp(32px, 5vw, 48px)", lineHeight: 1.15 }}>
          Sitemap
        </h1>
        <p className="font-body mb-12" style={{ fontSize: 15, color: "rgba(255,255,255,0.4)" }}>
          A complete index of every page on this site.
        </p>

        {/* Main pages */}
        <section className="mb-12">
          <h2 className="font-display italic mb-4" style={{ fontSize: 22, color: "#D4AF55" }}>Pages</h2>
          <ul className="flex flex-col gap-2">
            <li><Link to="/" className="font-body hover:text-[#D4AF55] transition-colors" style={{ fontSize: 15, color: "rgba(255,255,255,0.7)" }}>Home</Link></li>
            <li><Link to="/blog" className="font-body hover:text-[#D4AF55] transition-colors" style={{ fontSize: 15, color: "rgba(255,255,255,0.7)" }}>Blog</Link></li>
            <li><Link to="/resources" className="font-body hover:text-[#D4AF55] transition-colors" style={{ fontSize: 15, color: "rgba(255,255,255,0.7)" }}>Resources</Link></li>
          </ul>
        </section>

        {/* Pillar guides */}
        {pillarPages && pillarPages.length > 0 && (
          <section className="mb-12">
            <h2 className="font-display italic mb-4" style={{ fontSize: 22, color: "#D4AF55" }}>Guides</h2>
            <ul className="flex flex-col gap-2">
              {pillarPages.map((p) => (
                <li key={p.id}>
                  <Link
                    to={`/guides/${p.slug}`}
                    className="font-body hover:text-[#D4AF55] transition-colors"
                    style={{ fontSize: 15, color: "rgba(255,255,255,0.7)" }}
                  >
                    {p.title}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Generated pages by content type */}
        {Object.keys(groupedByType).length > 0 && (
          <section className="mb-12">
            <h2 className="font-display italic mb-6" style={{ fontSize: 22, color: "#D4AF55" }}>Resources</h2>
            {Object.values(groupedByType).map((group) => (
              <div key={group.slug} className="mb-8">
                <h3 className="font-body font-semibold uppercase mb-3" style={{ fontSize: 12, letterSpacing: "0.12em", color: "rgba(255,255,255,0.5)" }}>
                  {group.name}
                </h3>
                <ul className="flex flex-col gap-2 pl-4" style={{ borderLeft: "1px solid rgba(212,175,85,0.15)" }}>
                  {group.pages.map((page, i) => (
                    <li key={i}>
                      <Link
                        to={`/resources/${group.slug}/${page.nicheSlug}`}
                        className="font-body hover:text-[#D4AF55] transition-colors"
                        style={{ fontSize: 14, color: "rgba(255,255,255,0.6)" }}
                      >
                        {page.title}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </section>
        )}

        {/* Blog posts */}
        {blogPosts && blogPosts.length > 0 && (
          <section className="mb-12">
            <h2 className="font-display italic mb-4" style={{ fontSize: 22, color: "#D4AF55" }}>Blog Articles</h2>
            <ul className="flex flex-col gap-2">
              {blogPosts.map((post) => (
                <li key={post.id}>
                  <Link
                    to={`/blog/${post.slug}`}
                    className="font-body hover:text-[#D4AF55] transition-colors"
                    style={{ fontSize: 15, color: "rgba(255,255,255,0.7)" }}
                  >
                    {post.title}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
      <Footer />
    </div>
  );
};

export default HTMLSitemap;
