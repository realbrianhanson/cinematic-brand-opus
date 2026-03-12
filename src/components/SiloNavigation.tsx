import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface SiloNavigationProps {
  nicheId: string;
  pillarTitle: string;
}

const SiloNavigation = ({ nicheId, pillarTitle }: SiloNavigationProps) => {
  const { data: pages } = useQuery({
    queryKey: ["silo-nav-pages", nicheId],
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
    staleTime: 30000,
  });

  const grouped: Record<string, { name: string; pages: any[] }> = {};
  (pages ?? []).forEach((pg: any) => {
    const schemaSlug = pg.content_schemas?.slug ?? "other";
    const schemaName = pg.content_schemas?.name ?? "Other";
    if (!grouped[schemaSlug]) grouped[schemaSlug] = { name: schemaName, pages: [] };
    grouped[schemaSlug].pages.push(pg);
  });

  if (Object.keys(grouped).length === 0) return null;

  return (
    <section style={{ marginTop: 64, paddingTop: 40, borderTop: "1px solid rgba(255,255,255,0.08)" }}>
      <h2 className="font-display italic" style={{ fontSize: 28, marginBottom: 28 }}>
        Everything in This Guide
      </h2>
      {Object.entries(grouped).map(([schemaSlug, group]) => (
        <div key={schemaSlug} style={{ marginBottom: 28 }}>
          <h3
            className="font-body"
            style={{
              fontSize: 14,
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              color: "hsl(var(--accent))",
              marginBottom: 12,
            }}
          >
            {group.name}
          </h3>
          <ul style={{ listStyle: "none", padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
            {group.pages.map((pg: any) => {
              const nSlug = pg.niches?.slug || pg.slug;
              return (
                <li key={pg.id}>
                  <a
                    href={`/resources/${schemaSlug}/${nSlug}`}
                    className="font-body"
                    style={{
                      fontSize: 14,
                      color: "rgba(255,255,255,0.65)",
                      textDecoration: "none",
                      transition: "color 0.2s",
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = "hsl(var(--accent))")}
                    onMouseLeave={(e) => (e.currentTarget.style.color = "rgba(255,255,255,0.65)")}
                  >
                    → {pg.title}
                  </a>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </section>
  );
};

export default SiloNavigation;
