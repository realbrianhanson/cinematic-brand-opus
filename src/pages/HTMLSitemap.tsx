import { useSiteConfig } from "@/config/SiteConfigContext";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@/lib/router-compat";
import { supabase } from "@/integrations/supabase/client";
import Nav from "@/components/Nav";
import Footer from "@/components/Footer";
import { getShopSitemapOffers } from "@/lib/shopSitemap.functions";

const HTMLSitemap = () => {
  const config = useSiteConfig();
  const shop = useQuery({
    queryKey: ["sitemap-shop-offers"],
    queryFn: () => getShopSitemapOffers(),
    staleTime: 60000,
  });

  const { data: generatedPages } = useQuery({
    queryKey: ["sitemap-generated-pages"],
    queryFn: async () => {
      const { data } = await supabase
        .from("generated_pages")
        .select(
          "id, title, slug, content_schema_id, niche_id, content_schemas(name, slug), niches!generated_pages_niche_id_fkey(name, slug)",
        )
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

  // Group generated pages by content type
  const groupedByType: Record<
    string,
    { name: string; slug: string; pages: { title: string; pageSlug: string }[] }
  > = {};
  for (const page of generatedPages || []) {
    const schema = page.content_schemas;
    if (!schema?.slug) continue;
    const key = schema.slug;
    if (!groupedByType[key]) {
      groupedByType[key] = { name: schema.name, slug: schema.slug, pages: [] };
    }
    groupedByType[key].pages.push({ title: page.title, pageSlug: page.slug });
  }

  return (
    <div
      className="min-h-screen"
      style={{ background: "var(--brand-backdrop)", color: "#fff" }}
    >
      <Nav />
      <main
        id="main-content"
        className="mx-auto px-6 lg:px-14 pt-32 pb-24"
        style={{ maxWidth: 900 }}
      >
        <h1
          className="font-display mb-4"
          style={{ fontSize: "clamp(32px, 5vw, 48px)", lineHeight: 1.15 }}
        >
          Sitemap
        </h1>
        <p
          className="font-body mb-12"
          style={{ fontSize: 15, color: "rgba(255,255,255,0.7)" }}
        >
          A complete index of every page on this site.
        </p>

        {/* Main pages */}
        <section className="mb-12">
          <h2
            className="font-display mb-4"
            style={{ fontSize: 22, color: "var(--brand-accent)" }}
          >
            Pages
          </h2>
          <ul className="flex flex-col gap-2">
            {[
              ["/start-here", "Start Here"],
              ["/support", "Help & Support"],
              ["/privacy", "Privacy Notice"],
              ["/terms", "Website Terms"],
            ].map(([path, label]) => (
              <li key={path}>
                <Link
                  to={path}
                  className="font-body text-[15px] text-white/70 transition-colors hover:text-[var(--brand-accent)]"
                >
                  {label}
                </Link>
              </li>
            ))}
            {config.sections.story && (
              <li>
                <Link
                  to="/about"
                  className="font-body text-[15px] text-white/70 transition-colors hover:text-[var(--brand-accent)]"
                >
                  About {config.identity.name}
                </Link>
              </li>
            )}
            {config.sections.speaking && (
              <li>
                <Link
                  to="/speaking"
                  className="font-body text-[15px] text-white/70 transition-colors hover:text-[var(--brand-accent)]"
                >
                  Speaking & Workshops
                </Link>
              </li>
            )}
            <li>
              <Link
                to="/"
                className="font-body hover:text-[var(--brand-accent)] transition-colors"
                style={{ fontSize: 15, color: "rgba(255,255,255,0.7)" }}
              >
                Home
              </Link>
            </li>
            <li>
              <Link
                to="/blog"
                className="font-body hover:text-[var(--brand-accent)] transition-colors"
                style={{ fontSize: 15, color: "rgba(255,255,255,0.7)" }}
              >
                Blog
              </Link>
            </li>
            <li>
              <Link
                to="/resources"
                className="font-body hover:text-[var(--brand-accent)] transition-colors"
                style={{ fontSize: 15, color: "rgba(255,255,255,0.7)" }}
              >
                Resources
              </Link>
            </li>
            <li>
              <Link
                to="/shop"
                className="font-body hover:text-[var(--brand-accent)] transition-colors"
                style={{ fontSize: 15, color: "rgba(255,255,255,0.7)" }}
              >
                Shop
              </Link>
            </li>
          </ul>
        </section>

        {shop.isError && (
          <p role="status" className="font-body mb-8 text-white/70">
            Shop listings could not be loaded.{" "}
            <button className="underline" onClick={() => void shop.refetch()}>
              Try again
            </button>
          </p>
        )}
        {!!shop.data?.length && (
          <section className="mb-12">
            <h2
              className="font-display mb-4"
              style={{ fontSize: 22, color: "var(--brand-accent)" }}
            >
              Shop offers
            </h2>
            <ul className="flex flex-col gap-2">
              {shop.data.map((offer) => (
                <li key={offer.slug}>
                  <Link
                    to={`/offers/${offer.slug}`}
                    className="font-body hover:text-[var(--brand-accent)] transition-colors"
                    style={{ fontSize: 15, color: "rgba(255,255,255,0.7)" }}
                  >
                    {offer.title}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Pillar guides */}
        {pillarPages && pillarPages.length > 0 && (
          <section className="mb-12">
            <h2
              className="font-display mb-4"
              style={{ fontSize: 22, color: "var(--brand-accent)" }}
            >
              Guides
            </h2>
            <ul className="flex flex-col gap-2">
              {pillarPages.map((p) => (
                <li key={p.id}>
                  <Link
                    to={`/guides/${p.slug}`}
                    className="font-body hover:text-[var(--brand-accent)] transition-colors"
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
            <h2
              className="font-display mb-6"
              style={{ fontSize: 22, color: "var(--brand-accent)" }}
            >
              Resources
            </h2>
            {Object.values(groupedByType).map((group) => (
              <div key={group.slug} className="mb-8">
                <h3
                  className="font-body font-semibold uppercase mb-3"
                  style={{
                    fontSize: 12,
                    letterSpacing: "0.12em",
                    color: "rgba(255,255,255,0.7)",
                  }}
                >
                  {group.name}
                </h3>
                <ul
                  className="flex flex-col gap-2 pl-4"
                  style={{
                    borderLeft: "1px solid rgba(var(--brand-accent-rgb),0.15)",
                  }}
                >
                  {group.pages.map((page, i) => (
                    <li key={i}>
                      <Link
                        to={`/resources/${group.slug}/${page.pageSlug}`}
                        className="font-body hover:text-[var(--brand-accent)] transition-colors"
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
            <h2
              className="font-display mb-4"
              style={{ fontSize: 22, color: "var(--brand-accent)" }}
            >
              Blog Articles
            </h2>
            <ul className="flex flex-col gap-2">
              {blogPosts.map((post) => (
                <li key={post.id}>
                  <Link
                    to={`/blog/${post.slug}`}
                    className="font-body hover:text-[var(--brand-accent)] transition-colors"
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
