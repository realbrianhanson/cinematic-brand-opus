import { useState, useMemo } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, ArrowRight } from "lucide-react";
import Nav from "@/components/Nav";
import PublicCTA from "@/components/PublicCTA";

const ContentTypeList = () => {
  const { contentType } = useParams<{ contentType: string }>();
  const [nicheFilter, setNicheFilter] = useState("");

  const { data: schema } = useQuery({
    queryKey: ["public-schema", contentType],
    queryFn: async () => {
      const { data, error } = await supabase.from("content_schemas").select("*").eq("slug", contentType!).maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!contentType,
  });

  const { data: pages } = useQuery({
    queryKey: ["public-pages-by-type", schema?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("generated_pages")
        .select("*, niches(name, slug)")
        .eq("content_schema_id", schema!.id)
        .eq("status", "published")
        .order("title");
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!schema?.id,
  });

  const niches = useMemo(() => {
    if (!pages) return [];
    const map = new Map<string, string>();
    pages.forEach((p: any) => { if (p.niches?.slug) map.set(p.niches.slug, p.niches.name); });
    return Array.from(map, ([slug, name]) => ({ slug, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [pages]);

  const filtered = useMemo(() => {
    if (!pages) return [];
    if (!nicheFilter) return pages;
    return pages.filter((p: any) => p.niches?.slug === nicheFilter);
  }, [pages, nicheFilter]);

  return (
    <div className="min-h-screen" style={{ background: "#07070E", color: "#fff" }}>
      <Nav />
      <header className="pt-32 pb-8 px-6 lg:px-14 mx-auto" style={{ maxWidth: 1440 }}>
        {/* Breadcrumbs */}
        <div className="flex items-center gap-2 font-body uppercase mb-10" style={{ fontSize: 10, letterSpacing: "0.15em", color: "rgba(255,255,255,0.3)" }}>
          <Link to="/" className="hover:text-[#D4AF55] transition-colors">Home</Link>
          <span>›</span>
          <Link to="/resources" className="hover:text-[#D4AF55] transition-colors">Resources</Link>
          <span>›</span>
          <span style={{ color: "rgba(255,255,255,0.5)" }}>{schema?.name || "..."}</span>
        </div>

        <h1 className="font-display italic" style={{ fontSize: "clamp(2rem, 5vw, 3.5rem)", lineHeight: 1.1 }}>
          {schema?.name || "Loading..."}
        </h1>
        {schema?.description && (
          <p className="font-body mt-4" style={{ fontSize: 16, color: "rgba(255,255,255,0.4)", maxWidth: 560 }}>
            {schema.description}
          </p>
        )}
      </header>

      <main className="px-6 lg:px-14 pb-24 mx-auto" style={{ maxWidth: 1440 }}>
        {/* Filter */}
        {niches.length > 1 && (
          <div className="mb-10 flex flex-wrap gap-2">
            <button
              onClick={() => setNicheFilter("")}
              className="font-body uppercase px-4 py-2 transition-all duration-200"
              style={{
                fontSize: 10,
                letterSpacing: "0.12em",
                border: "1px solid",
                borderColor: !nicheFilter ? "#D4AF55" : "rgba(255,255,255,0.1)",
                color: !nicheFilter ? "#D4AF55" : "rgba(255,255,255,0.4)",
                background: !nicheFilter ? "rgba(212,175,85,0.08)" : "transparent",
                cursor: "pointer",
              }}
            >
              All ({pages?.length || 0})
            </button>
            {niches.map((n) => {
              const count = pages?.filter((p: any) => p.niches?.slug === n.slug).length || 0;
              const active = nicheFilter === n.slug;
              return (
                <button
                  key={n.slug}
                  onClick={() => setNicheFilter(n.slug)}
                  className="font-body uppercase px-4 py-2 transition-all duration-200"
                  style={{
                    fontSize: 10,
                    letterSpacing: "0.12em",
                    border: "1px solid",
                    borderColor: active ? "#D4AF55" : "rgba(255,255,255,0.1)",
                    color: active ? "#D4AF55" : "rgba(255,255,255,0.4)",
                    background: active ? "rgba(212,175,85,0.08)" : "transparent",
                    cursor: "pointer",
                  }}
                >
                  {n.name} ({count})
                </button>
              );
            })}
          </div>
        )}

        {/* Grid */}
        <div className="grid md:grid-cols-2 gap-8">
          {filtered.map((p: any) => (
            <Link
              to={`/resources/${contentType}/${p.niches?.slug || p.slug}`}
              key={p.id}
              className="group block p-7"
              style={{ border: "1px solid rgba(255,255,255,0.06)", transition: "border-color 0.3s, transform 0.3s" }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = "rgba(212,175,85,0.25)"; e.currentTarget.style.transform = "translateY(-3px)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.06)"; e.currentTarget.style.transform = "translateY(0)"; }}
            >
              <div className="flex items-center gap-3 mb-3">
                {p.niches?.name && (
                  <span className="font-body uppercase" style={{ fontSize: 9, letterSpacing: "0.15em", color: "#D4AF55" }}>
                    {p.niches.name}
                  </span>
                )}
              </div>
              <h2 className="font-display italic mb-3 transition-colors group-hover:text-[#D4AF55]" style={{ fontSize: 20, lineHeight: 1.3 }}>
                {p.title}
              </h2>
              <div className="flex items-center gap-1 font-body uppercase transition-colors group-hover:text-[#D4AF55]" style={{ fontSize: 10, letterSpacing: "0.15em", color: "rgba(255,255,255,0.3)" }}>
                View {schema?.name?.toLowerCase() || "resource"} <ArrowRight size={12} />
              </div>
            </Link>
          ))}
        </div>

        {filtered.length === 0 && !pages && (
          <p className="font-body" style={{ color: "rgba(255,255,255,0.3)", fontSize: 14 }}>Loading...</p>
        )}
        {filtered.length === 0 && pages && (
          <p className="font-body" style={{ color: "rgba(255,255,255,0.3)", fontSize: 14 }}>No published resources found.</p>
        )}
      </main>
    </div>
  );
};

export default ContentTypeList;
