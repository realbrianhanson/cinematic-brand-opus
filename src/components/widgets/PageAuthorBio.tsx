import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const PageAuthorBio = ({ config }: { config: any }) => {
  const { data: settings } = useQuery({
    queryKey: ["widget-site-settings"],
    queryFn: async () => {
      const { data } = await supabase.from("site_settings").select("author_name, author_title, author_bio, author_credentials").limit(1).maybeSingle();
      return data;
    },
    staleTime: 60000,
  });

  if (!settings) return null;

  return (
    <div className="flex gap-5 items-start" style={{ padding: 24, border: "1px solid rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.02)" }}>
      {config.show_image !== false && (
        <div style={{ width: 56, height: 56, borderRadius: "50%", background: "hsl(var(--accent))", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <span className="font-display italic" style={{ fontSize: 22, color: "hsl(var(--accent-foreground))" }}>
            {(settings.author_name || "A")[0]}
          </span>
        </div>
      )}
      <div>
        <p className="font-body" style={{ fontSize: 15, fontWeight: 600, color: "hsl(var(--foreground))" }}>{settings.author_name}</p>
        {settings.author_title && (
          <p className="font-body" style={{ fontSize: 12, color: "hsl(var(--accent))", marginBottom: 6 }}>{settings.author_title}</p>
        )}
        {settings.author_bio && (
          <p className="font-body" style={{ fontSize: 13, color: "hsl(var(--muted-foreground))", lineHeight: 1.6 }}>{settings.author_bio}</p>
        )}
      </div>
    </div>
  );
};

export default PageAuthorBio;
