import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, ArrowRight, List, CheckSquare, BookOpen, Wrench, FileText, HelpCircle } from "lucide-react";
import Nav from "@/components/Nav";
import PublicCTA from "@/components/PublicCTA";
import Breadcrumbs from "@/components/Breadcrumbs";

const rendererIcons: Record<string, typeof List> = {
  IdeaListRenderer: List,
  ChecklistRenderer: CheckSquare,
  GuideRenderer: BookOpen,
  ToolRoundupRenderer: Wrench,
  TemplateRenderer: FileText,
  FAQRenderer: HelpCircle,
};

const ResourcesIndex = () => {
  const { data: schemas } = useQuery({
    queryKey: ["public-content-schemas"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("content_schemas")
        .select("*")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: pageCounts } = useQuery({
    queryKey: ["public-page-counts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("generated_pages")
        .select("content_schema_id")
        .eq("status", "published");
      if (error) throw error;
      const counts: Record<string, number> = {};
      data?.forEach((p) => {
        if (p.content_schema_id) counts[p.content_schema_id] = (counts[p.content_schema_id] || 0) + 1;
      });
      return counts;
    },
  });

  const { data: settings } = useQuery({
    queryKey: ["public-site-settings"],
    queryFn: async () => {
      const { data } = await supabase.from("site_settings").select("*").limit(1).maybeSingle();
      return data;
    },
  });

  return (
    <div className="min-h-screen" style={{ background: "#07070E", color: "#fff" }}>
      <Nav />
      <header className="pt-32 pb-16 px-6 lg:px-14 mx-auto" style={{ maxWidth: 1440 }}>
        <Link
          to="/"
          className="inline-flex items-center gap-2 font-body uppercase mb-12 transition-colors duration-200"
          style={{ fontSize: 11, letterSpacing: "0.18em", color: "rgba(255,255,255,0.4)" }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "#D4AF55")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "rgba(255,255,255,0.4)")}
        >
          <ArrowLeft size={14} /> Back to Home
        </Link>
        <h1 className="font-display italic" style={{ fontSize: "clamp(2.5rem, 6vw, 4.5rem)", lineHeight: 1.1 }}>
          Free Resources{settings?.publisher_name ? ` from ${settings.publisher_name}` : ""}
        </h1>
        <p className="font-body mt-4" style={{ fontSize: 16, color: "rgba(255,255,255,0.4)", maxWidth: 560 }}>
          Actionable guides, checklists, templates, and tools organized by industry.
        </p>
      </header>

      <main className="px-6 lg:px-14 pb-24 mx-auto" style={{ maxWidth: 1440 }}>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
          {schemas?.map((s) => {
            const Icon = rendererIcons[s.renderer_component] || List;
            const count = pageCounts?.[s.id] || 0;
            return (
              <Link
                to={`/resources/${s.slug}`}
                key={s.id}
                className="group block p-8"
                style={{ border: "1px solid rgba(255,255,255,0.06)", transition: "border-color 0.3s, transform 0.3s" }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = "rgba(212,175,85,0.25)"; e.currentTarget.style.transform = "translateY(-4px)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.06)"; e.currentTarget.style.transform = "translateY(0)"; }}
              >
                <Icon size={28} style={{ color: "#D4AF55", marginBottom: 16 }} strokeWidth={1.5} />
                <h2 className="font-display italic mb-2 transition-colors group-hover:text-[#D4AF55]" style={{ fontSize: 22, lineHeight: 1.3 }}>
                  {s.name}
                </h2>
                {s.description && (
                  <p className="font-body mb-4" style={{ fontSize: 13, color: "rgba(255,255,255,0.35)", lineHeight: 1.6 }}>
                    {s.description}
                  </p>
                )}
                <div className="flex items-center justify-between">
                  <span className="font-body" style={{ fontSize: 11, color: "rgba(255,255,255,0.25)" }}>
                    {count} resource{count !== 1 ? "s" : ""} available
                  </span>
                  <span className="font-body uppercase flex items-center gap-1 transition-colors group-hover:text-[#D4AF55]" style={{ fontSize: 10, letterSpacing: "0.15em", color: "rgba(255,255,255,0.3)" }}>
                    Browse <ArrowRight size={12} />
                  </span>
                </div>
              </Link>
            );
          })}
        </div>

        <PublicCTA variant="end" pageType="resources-index" />
      </main>
    </div>
  );
};

export default ResourcesIndex;
