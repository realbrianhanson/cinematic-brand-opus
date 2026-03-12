import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ArrowRight } from "lucide-react";

const PillarBanner = ({ nicheId }: { nicheId: string }) => {
  const { data: pillar } = useQuery({
    queryKey: ["public-pillar-for-niche", nicheId],
    queryFn: async () => {
      const { data } = await supabase
        .from("pillar_pages")
        .select("title, slug")
        .eq("niche_id", nicheId)
        .eq("status", "published")
        .maybeSingle();
      return data;
    },
    enabled: !!nicheId,
    staleTime: 60000,
  });

  if (!pillar) return null;

  return (
    <a
      href={`/guides/${pillar.slug}`}
      className="group flex items-center justify-between mb-6 p-3 px-4 font-body transition-colors"
      style={{
        borderLeft: "4px solid hsl(var(--accent))",
        background: "rgba(212,175,85,0.05)",
        fontSize: 13,
        color: "rgba(255,255,255,0.5)",
        textDecoration: "none",
      }}
    >
      <span>
        📖 Part of our complete guide:{" "}
        <span className="group-hover:text-accent transition-colors" style={{ color: "hsl(var(--accent))", fontWeight: 500 }}>
          {pillar.title}
        </span>
      </span>
      <ArrowRight size={14} className="shrink-0 ml-3 group-hover:text-accent transition-colors" style={{ color: "rgba(255,255,255,0.25)" }} />
    </a>
  );
};

export default PillarBanner;
