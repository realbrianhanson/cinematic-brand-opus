import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ArrowRight } from "lucide-react";

interface RelatedResourcesProps {
  currentPageId: string;
  nicheId: string;
  nicheName: string;
  contentSchemaId: string;
  contentTypeName: string;
}

const RelatedResources = ({ currentPageId, nicheId, nicheName, contentSchemaId, contentTypeName }: RelatedResourcesProps) => {
  // Siblings: same niche, different content type
  const { data: siblings } = useQuery({
    queryKey: ["related-siblings", nicheId, contentSchemaId],
    queryFn: async () => {
      const { data } = await supabase
        .from("generated_pages")
        .select("id, title, slug, niche_id, content_schema_id, content_schemas(name, slug), niches(slug)")
        .eq("niche_id", nicheId)
        .neq("content_schema_id", contentSchemaId)
        .eq("status", "published")
        .limit(5);
      return data ?? [];
    },
    enabled: !!nicheId && !!contentSchemaId,
    staleTime: 60000,
  });

  // Cousins: same content type, different niche
  const { data: cousins } = useQuery({
    queryKey: ["related-cousins", contentSchemaId, nicheId],
    queryFn: async () => {
      const { data } = await supabase
        .from("generated_pages")
        .select("id, title, slug, niche_id, content_schema_id, niches(name, slug), content_schemas(slug)")
        .eq("content_schema_id", contentSchemaId)
        .neq("niche_id", nicheId)
        .eq("status", "published")
        .order("views", { ascending: false })
        .limit(8);
      return data ?? [];
    },
    enabled: !!contentSchemaId && !!nicheId,
    staleTime: 60000,
  });

  const hasSiblings = siblings && siblings.length > 0;
  const hasCousins = cousins && cousins.length > 0;

  if (!hasSiblings && !hasCousins) return null;

  return (
    <div className="mt-16">
      {/* Siblings */}
      {hasSiblings && (
        <div className="mb-12">
          <h2 className="font-display italic mb-6" style={{ fontSize: 22 }}>
            More {nicheName} Resources
          </h2>
          <div className="grid md:grid-cols-3 gap-4">
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

      {/* Cousins */}
      {hasCousins && (
        <div>
          <h2 className="font-display italic mb-6" style={{ fontSize: 22 }}>
            Explore {contentTypeName} for Other Industries
          </h2>
          <div className="flex flex-wrap gap-2">
            {cousins.map((pg: any) => {
              const ctSlug = pg.content_schemas?.slug || "";
              const nSlug = pg.niches?.slug || "";
              return (
                <Link
                  key={pg.id}
                  to={`/resources/${ctSlug}/${nSlug}`}
                  className="font-body px-4 py-2 transition-all duration-200"
                  style={{
                    fontSize: 12,
                    color: "rgba(255,255,255,0.45)",
                    border: "1px solid rgba(255,255,255,0.08)",
                    textDecoration: "none",
                    borderRadius: 999,
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = "rgba(212,175,85,0.3)"; e.currentTarget.style.color = "#D4AF55"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)"; e.currentTarget.style.color = "rgba(255,255,255,0.45)"; }}
                >
                  {pg.niches?.name || "Other"}
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default RelatedResources;
