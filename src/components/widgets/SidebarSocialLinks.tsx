import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Linkedin, Twitter, Facebook, Youtube, Instagram, Globe } from "lucide-react";

const ICON_MAP: Record<string, any> = {
  linkedin: Linkedin, twitter: Twitter, facebook: Facebook, youtube: Youtube, instagram: Instagram,
};

const SidebarSocialLinks = ({ config }: { config: any }) => {
  const { data: settings } = useQuery({
    queryKey: ["widget-site-settings"],
    queryFn: async () => {
      const { data } = await supabase.from("site_settings").select("author_social_links").limit(1).maybeSingle();
      return data;
    },
    staleTime: 60000,
  });

  const links = (settings?.author_social_links || {}) as Record<string, string>;
  const entries = Object.entries(links).filter(([_, url]) => url);

  if (!entries.length) return null;

  return (
    <div style={{ padding: 24, border: "1px solid rgba(255,255,255,0.06)" }}>
      <h3 className="font-body uppercase mb-4" style={{ fontSize: 10, letterSpacing: "0.15em", color: "hsl(var(--accent))", fontWeight: 700 }}>
        Follow
      </h3>
      <div className="flex gap-3">
        {entries.map(([platform, url]) => {
          const Icon = ICON_MAP[platform] || Globe;
          return (
            <a key={platform} href={url} target="_blank" rel="noopener noreferrer" className="transition-colors" style={{ color: "rgba(255,255,255,0.4)", padding: 8, border: "1px solid rgba(255,255,255,0.08)" }}
              onMouseEnter={(e) => (e.currentTarget.style.color = "hsl(var(--accent))")}
              onMouseLeave={(e) => (e.currentTarget.style.color = "rgba(255,255,255,0.4)")}
            >
              <Icon size={16} />
            </a>
          );
        })}
      </div>
    </div>
  );
};

export default SidebarSocialLinks;
