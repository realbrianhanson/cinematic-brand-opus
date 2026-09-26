import type { WidgetConfig, WidgetPageContext } from "@/lib/widgetConfig";
import { safeHref } from "@/lib/newsMarkdown";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Linkedin,
  Twitter,
  Facebook,
  Youtube,
  Instagram,
  Globe,
} from "lucide-react";

const ICON_MAP: Record<string, typeof Linkedin> = {
  linkedin: Linkedin,
  twitter: Twitter,
  facebook: Facebook,
  youtube: Youtube,
  instagram: Instagram,
};

const SidebarSocialLinks = ({ config }: { config: WidgetConfig }) => {
  const { data: settings } = useQuery({
    queryKey: ["widget-site-settings", "social-links"],
    queryFn: async () => {
      const { data } = await supabase
        .from("site_settings")
        .select("author_social_links")
        .limit(1)
        .maybeSingle();
      return data;
    },
    staleTime: 60000,
  });

  const links = (settings?.author_social_links || {}) as Record<string, string>;
  const entries = Object.entries(links)
    .map(([platform, url]) => [platform, safeHref(url)] as const)
    .filter((entry): entry is readonly [string, string] => !!entry[1]);

  if (!entries.length) return null;

  return (
    <div
      style={{
        padding: 24,
        border: "1px solid rgba(var(--site-ink-rgb,255,255,255),0.06)",
      }}
    >
      <h3
        className="font-body uppercase mb-4"
        style={{
          fontSize: 12,
          letterSpacing: "0.15em",
          color: "var(--site-accent-ink, hsl(var(--accent)))",
          fontWeight: 700,
        }}
      >
        Follow
      </h3>
      <div className="flex gap-3">
        {entries.map(([platform, url]) => {
          const Icon = ICON_MAP[platform] || Globe;
          return (
            <a
              key={platform}
              href={url}
              aria-label={platform}
              target="_blank"
              rel="noopener noreferrer"
              className="transition-colors"
              style={{
                color: "var(--site-text-70, rgba(255,255,255,0.7))",
                padding: 8,
                border: "1px solid rgba(var(--site-ink-rgb,255,255,255),0.08)",
              }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.color =
                  "var(--site-accent-ink, hsl(var(--accent)))")
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.color =
                  "var(--site-text-70, rgba(255,255,255,0.7))")
              }
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
