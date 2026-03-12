import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ArrowRight, BookOpen } from "lucide-react";

interface RelatedResourcesProps {
  currentPageId: string;
  nicheId: string;
  nicheName: string;
  contentSchemaId: string;
  contentTypeName: string;
}

const RelatedResources = ({ currentPageId, nicheId, nicheName, contentSchemaId, contentTypeName }: RelatedResourcesProps) => {
  // Siblings: same niche, different content type (silo-aware — NO cross-silo)
  const { data: siblings } = useQuery({
    queryKey: ["silo-siblings", nicheId, contentSchemaId],
    queryFn: async () => {
      const { data } = await supabase
        .from("generated_pages")
        .select("id, title, slug, niche_id, content_schema_id, content_schemas(name, slug), niches(slug)")
        .eq("niche_id", nicheId)
        .neq("content_schema_id", contentSchemaId)
        .eq("status", "published")
        .limit(8);
      return data ?? [];
    },
    enabled: !!nicheId && !!contentSchemaId,
    staleTime: 60000,
  });

  // Pillar page for this niche (link juice flows UP)
  const { data: pillar } = useQuery({
    queryKey: ["silo-pillar", nicheId],
    queryFn: async () => {
      const { data } = await supabase
        .from("pillar_pages")
        .select("id, title, slug")
        .eq("niche_id", nicheId)
        .eq("status", "published")
        .maybeSingle();
      return data;
    },
    enabled: !!nicheId,
    staleTime: 60000,
  });

  const hasSiblings = siblings && siblings.length > 0;
  if (!hasSiblings && !pillar) return null;

  return (
    <div className="mt-16">
      {/* Pillar link — prominent, link juice flows UP */}
      {pillar && (
        <Link
          to={`/guides/${pillar.slug}`}
          className="group flex items-center gap-4 mb-10 p-5"
          style={{
            border: "1px solid rgba(212,175,85,0.15)",
            background: "rgba(212,175,85,0.04)",
            textDecoration: "none",
            transition: "border-color 0.3s, background 0.3s",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = "rgba(212,175,85,0.35)"; e.currentTarget.style.background = "rgba(212,175,85,0.07)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = "rgba(212,175,85,0.15)"; e.currentTarget.style.background = "rgba(212,175,85,0.04)"; }}
        >
          <BookOpen size={20} style={{ color: "#D4AF55", flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <span className="font-body uppercase block" style={{ fontSize: 9, letterSpacing: "0.12em", color: "rgba(255,255,255,0.35)", marginBottom: 4 }}>
              Complete Guide
            </span>
            <span className="font-body font-medium group-hover:text-[#D4AF55] transition-colors" style={{ fontSize: 15, color: "rgba(255,255,255,0.8)" }}>
              {pillar.title}
            </span>
          </div>
          <ArrowRight size={16} className="shrink-0 group-hover:text-[#D4AF55] transition-colors" style={{ color: "rgba(255,255,255,0.2)" }} />
        </Link>
      )}

      {/* Sibling resources — same niche only (silo-contained) */}
      {hasSiblings && (
        <div>
          <h2 className="font-display italic mb-6" style={{ fontSize: 22 }}>
            More {nicheName} Resources
          </h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {siblings.map((pg: any) => {
              const ctSlug = pg.content_schemas?.slug || "";
              const nSlug = pg.niches?.slug || "";
              return (
                <Link
                  key={pg.id}
                  to={`/resources/${ctSlug}/${nSlug}`}
                  className="group block p-5"
                  style={{
                    border: "1px solid rgba(255,255,255,0.06)",
                    transition: "border-color 0.3s, transform 0.3s",
                    textDecoration: "none",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = "rgba(212,175,85,0.2)"; e.currentTarget.style.transform = "translateY(-2px)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.06)"; e.currentTarget.style.transform = "translateY(0)"; }}
                >
                  <span className="font-body uppercase block mb-2" style={{ fontSize: 9, letterSpacing: "0.12em", color: "#D4AF55" }}>
                    {pg.content_schemas?.name || "Resource"}
                  </span>
                  <h3 className="font-body font-medium mb-2 transition-colors group-hover:text-[#D4AF55]" style={{ fontSize: 14, color: "rgba(255,255,255,0.75)", lineHeight: 1.4 }}>
                    {pg.title}
                  </h3>
                  <span className="font-body uppercase flex items-center gap-1 transition-colors group-hover:text-[#D4AF55]" style={{ fontSize: 10, letterSpacing: "0.12em", color: "rgba(255,255,255,0.25)" }}>
                    View <ArrowRight size={10} />
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* NO cross-silo links — link juice stays within the silo */}
    </div>
  );
};

export default RelatedResources;
