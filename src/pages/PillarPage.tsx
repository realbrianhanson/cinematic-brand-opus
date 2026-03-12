import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Clock, Calendar } from "lucide-react";
import { useEffect } from "react";
import PublicCTA from "@/components/PublicCTA";
import Breadcrumbs from "@/components/Breadcrumbs";
import StructuredData from "@/components/StructuredData";
import PageHead from "@/components/PageHead";
import SiloNavigation from "@/components/SiloNavigation";

const wordCount = (html: string) => {
  const text = html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  return text ? text.split(" ").length : 0;
};

const PillarPage = () => {
  const { slug } = useParams<{ slug: string }>();

  const { data: pillar, isLoading } = useQuery({
    queryKey: ["public-pillar", slug],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pillar_pages")
        .select("*, niches(id, name)")
        .eq("slug", slug!)
        .eq("status", "published")
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!slug,
    staleTime: 30000,
  });

  const { data: siteSettings } = useQuery({
    queryKey: ["public-site-settings"],
    queryFn: async () => {
      const { data } = await supabase.from("site_settings").select("*").limit(1).maybeSingle();
      return data;
    },
    staleTime: 60000,
  });

  const nicheId = (pillar as any)?.niches?.id ?? pillar?.niche_id;

  const { data: connectedPages } = useQuery({
    queryKey: ["public-pillar-pages", nicheId],
    queryFn: async () => {
      const { data } = await supabase
        .from("generated_pages")
        .select("id, title, slug, status, content_schema_id, content_schemas(name, slug)")
        .eq("niche_id", nicheId!)
        .eq("status", "published")
        .order("title");
      return data ?? [];
    },
    enabled: !!nicheId,
    staleTime: 30000,
  });

  // Related pillar guides
  const { data: relatedPillars } = useQuery({
    queryKey: ["related-pillars", nicheId],
    queryFn: async () => {
      const { data } = await supabase
        .from("pillar_pages")
        .select("id, title, slug, niches(name)")
        .neq("niche_id", nicheId!)
        .eq("status", "published")
        .limit(3);
      return data ?? [];
    },
    enabled: !!nicheId,
    staleTime: 60000,
  });

  useEffect(() => {
    if (!pillar) return;
    // PageHead handles meta tags via react-helmet-async now
  }, [pillar, siteSettings]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#07070E" }}>
        <p className="font-body" style={{ color: "rgba(255,255,255,0.3)" }}>Loading...</p>
      </div>
    );
  }

  if (!pillar) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-6" style={{ background: "#07070E" }}>
        <p className="font-display italic text-2xl" style={{ color: "#fff" }}>Guide not found</p>
        <Link to="/" className="font-body uppercase" style={{ fontSize: 12, letterSpacing: "0.15em", color: "#D4AF55" }}>← Back to Home</Link>
      </div>
    );
  }

  const readingTime = Math.max(1, Math.ceil(wordCount(pillar.content) / 250));
  const authorName = siteSettings?.author_name || "Author";

  const nicheName = (pillar as any)?.niches?.name || "";

  return (
    <div className="min-h-screen" style={{ background: "#07070E", color: "#fff" }}>
      <PageHead
        title={((pillar.seo_meta as any)?.title) || pillar.title}
        description={((pillar.seo_meta as any)?.description) || ""}
        url={`${siteSettings?.site_url || ""}/guides/${slug}`}
        image={(pillar.seo_meta as any)?.og_image}
        publishedAt={pillar.published_at || pillar.created_at || ""}
        updatedAt={pillar.updated_at || ""}
        authorName={siteSettings?.author_name}
      />
      <article className="mx-auto px-6 lg:px-14 pt-32 pb-24" style={{ maxWidth: 800 }}>
        <StructuredData
          pageType="pillar"
          title={pillar.title}
          description={((pillar.seo_meta as any)?.description) || ""}
          url={`${siteSettings?.site_url || ""}/guides/${slug}`}
          publishedAt={pillar.published_at || pillar.created_at || ""}
          updatedAt={pillar.updated_at || ""}
          breadcrumbs={[
            { name: "Home", url: siteSettings?.site_url || "/" },
            { name: "Guides", url: `${siteSettings?.site_url || ""}/resources` },
            { name: pillar.title, url: `${siteSettings?.site_url || ""}/guides/${slug}` },
          ]}
          siteSettings={siteSettings}
        />
        <Breadcrumbs items={[
          { label: "Home", href: "/" },
          { label: "Guides", href: "/resources" },
          { label: pillar.title },
        ]} />

        <h1 className="font-display italic" style={{ fontSize: "clamp(32px, 5vw, 48px)", lineHeight: 1.15, marginBottom: 20 }}>{pillar.title}</h1>

        <div className="flex items-center gap-4 mb-10" style={{ color: "rgba(255,255,255,0.4)" }}>
          <span className="font-body" style={{ fontSize: 12 }}>By {authorName}</span>
          <span style={{ fontSize: 10 }}>•</span>
          <span className="font-body flex items-center gap-1" style={{ fontSize: 12 }}>
            <Calendar size={12} />
            {new Date(pillar.published_at || pillar.created_at!).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
          </span>
          <span style={{ fontSize: 10 }}>•</span>
          <span className="font-body flex items-center gap-1" style={{ fontSize: 12 }}>
            <Clock size={12} />
            {readingTime} min read
          </span>
        </div>

        <div
          className="blog-content font-body"
          style={{ fontSize: 16, lineHeight: 1.8, color: "rgba(255,255,255,0.8)" }}
          dangerouslySetInnerHTML={{ __html: pillar.content }}
        />

        <SiloNavigation nicheId={nicheId!} pillarTitle={pillar.title} />

        {/* Related Pillar Guides */}
        {relatedPillars && relatedPillars.length > 0 && (
          <section style={{ marginTop: 48, paddingTop: 32, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
            <h2 className="font-display italic mb-6" style={{ fontSize: 22 }}>Related Pillar Guides</h2>
            <div className="grid md:grid-cols-3 gap-4">
              {relatedPillars.map((rp: any) => (
                <Link
                  key={rp.id}
                  to={`/guides/${rp.slug}`}
                  className="group block p-5"
                  style={{ border: "1px solid rgba(255,255,255,0.06)", textDecoration: "none", transition: "border-color 0.3s" }}
                  onMouseEnter={(e) => (e.currentTarget.style.borderColor = "rgba(212,175,85,0.2)")}
                  onMouseLeave={(e) => (e.currentTarget.style.borderColor = "rgba(255,255,255,0.06)")}
                >
                  {rp.niches?.name && (
                    <span className="font-body uppercase block mb-2" style={{ fontSize: 9, letterSpacing: "0.12em", color: "#D4AF55" }}>{rp.niches.name}</span>
                  )}
                  <h3 className="font-body font-medium transition-colors group-hover:text-[#D4AF55]" style={{ fontSize: 14, color: "rgba(255,255,255,0.7)", lineHeight: 1.4 }}>{rp.title}</h3>
                </Link>
              ))}
            </div>
          </section>
        )}

        <PublicCTA variant="end" pageId={pillar.id} pageType="pillar" nicheName={(pillar as any).niches?.name} />
      </article>
    </div>
  );
};

export default PillarPage;
