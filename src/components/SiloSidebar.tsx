import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { BookOpen, ChevronRight } from "lucide-react";

interface SiloSidebarProps {
  nicheId: string;
  nicheName: string;
  currentPageId: string;
  contentSchemaId: string;
}

const SiloSidebar = ({ nicheId, nicheName, currentPageId, contentSchemaId }: SiloSidebarProps) => {
  // Pillar for this niche
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

  // All published siblings in same niche
  const { data: siloPages } = useQuery({
    queryKey: ["silo-pages", nicheId],
    queryFn: async () => {
      const { data } = await supabase
        .from("generated_pages")
        .select("id, title, slug, content_schema_id, content_schemas(name, slug), niches(slug)")
        .eq("niche_id", nicheId)
        .eq("status", "published")
        .order("title");
      return data ?? [];
    },
    enabled: !!nicheId,
    staleTime: 60000,
  });

  if (!pillar && (!siloPages || siloPages.length <= 1)) return null;

  return (
    <aside
      className="hidden lg:block"
      style={{
        position: "sticky",
        top: 100,
        width: 240,
        flexShrink: 0,
        alignSelf: "flex-start",
      }}
    >
      <div style={{ borderLeft: "2px solid rgba(212,175,85,0.2)", paddingLeft: 16 }}>
        {/* Silo header */}
        <span
          className="font-body uppercase block"
          style={{ fontSize: 9, letterSpacing: "0.15em", color: "rgba(255,255,255,0.3)", marginBottom: 12 }}
        >
          {nicheName} Silo
        </span>

        {/* Pillar link (top of silo) */}
        {pillar && (
          <Link
            to={`/guides/${pillar.slug}`}
            className="group flex items-center gap-2 mb-4 font-body"
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: "#D4AF55",
              textDecoration: "none",
              lineHeight: 1.4,
            }}
          >
            <BookOpen size={13} style={{ flexShrink: 0 }} />
            <span className="group-hover:underline" style={{ textUnderlineOffset: 3 }}>{pillar.title}</span>
          </Link>
        )}

        {/* Sibling pages */}
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {(siloPages ?? []).map((pg: any) => {
            const isActive = pg.id === currentPageId;
            const ctSlug = pg.content_schemas?.slug || "";
            const nSlug = pg.niches?.slug || "";
            return (
              <Link
                key={pg.id}
                to={`/resources/${ctSlug}/${nSlug}`}
                className="font-body flex items-start gap-2 py-1.5"
                style={{
                  fontSize: 11,
                  color: isActive ? "#D4AF55" : "rgba(255,255,255,0.45)",
                  fontWeight: isActive ? 500 : 400,
                  textDecoration: "none",
                  lineHeight: 1.4,
                  transition: "color 0.2s",
                }}
                onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.color = "rgba(255,255,255,0.7)"; }}
                onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.color = "rgba(255,255,255,0.45)"; }}
              >
                <ChevronRight size={10} style={{ marginTop: 2, flexShrink: 0, opacity: isActive ? 1 : 0.4 }} />
                <span>{pg.content_schemas?.name}: {pg.title.length > 50 ? pg.title.slice(0, 50) + "…" : pg.title}</span>
              </Link>
            );
          })}
        </div>
      </div>
    </aside>
  );
};

export default SiloSidebar;
