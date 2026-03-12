import { useState, useEffect, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { X, ArrowRight } from "lucide-react";

interface PublicCTAProps {
  variant: "inline" | "sticky" | "end";
  nicheSlug?: string;
  contentTypeSlug?: string;
  nicheName?: string;
  pageId?: string;
  pageType?: string;
}

const PublicCTA = ({ variant, nicheSlug, contentTypeSlug, nicheName, pageId, pageType }: PublicCTAProps) => {
  const { data: settings } = useQuery({
    queryKey: ["public-site-settings"],
    queryFn: async () => {
      const { data } = await supabase.from("site_settings").select("*").limit(1).maybeSingle();
      return data;
    },
    staleTime: 60000,
  });

  const [stickyVisible, setStickyVisible] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (variant !== "sticky") return;
    const onScroll = () => {
      const scrollPct = window.scrollY / (document.documentElement.scrollHeight - window.innerHeight);
      setStickyVisible(scrollPct > 0.5);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [variant]);

  const buildUrl = useCallback(() => {
    if (!settings?.cta_url) return "";
    try {
      const url = new URL(settings.cta_url);
      url.searchParams.set("utm_source", window.location.hostname);
      url.searchParams.set("utm_medium", "pseo");
      if (contentTypeSlug) url.searchParams.set("utm_campaign", contentTypeSlug);
      if (nicheSlug) url.searchParams.set("utm_content", nicheSlug);
      return url.toString();
    } catch {
      return settings.cta_url;
    }
  }, [settings?.cta_url, nicheSlug, contentTypeSlug]);

  const logClick = () => {
    supabase.from("cta_events").insert({
      page_id: pageId || null,
      page_type: pageType || null,
      cta_variant: variant,
      event_type: "click",
      niche_slug: nicheSlug || null,
      content_type_slug: contentTypeSlug || null,
    }).then(() => {});
  };

  if (!settings?.cta_url) return null;

  const subtext = nicheName && settings.cta_subtext
    ? settings.cta_subtext.replace(/your business/gi, `your ${nicheName} business`)
    : settings.cta_subtext;

  const href = buildUrl();

  // === INLINE ===
  if (variant === "inline") {
    return (
      <div className="my-12 p-6 lg:p-8 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-5" style={{ background: "rgba(212,175,85,0.05)", border: "1px solid rgba(212,175,85,0.1)" }}>
        <div>
          <p className="font-body font-bold mb-1" style={{ fontSize: 18, color: "rgba(255,255,255,0.85)" }}>
            {settings.cta_headline || "Get Started"}
          </p>
          {subtext && (
            <p className="font-body" style={{ fontSize: 14, color: "rgba(255,255,255,0.4)", lineHeight: 1.5 }}>
              {subtext}
            </p>
          )}
        </div>
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          onClick={logClick}
          className="font-body uppercase shrink-0 inline-flex items-center gap-2 px-6 py-3 transition-all duration-200"
          style={{
            fontSize: 11,
            letterSpacing: "0.12em",
            fontWeight: 600,
            background: "#D4AF55",
            color: "#07070E",
            border: "none",
            textDecoration: "none",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "#E8C96A")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "#D4AF55")}
        >
          {settings.cta_button_text || "Learn More"} <ArrowRight size={14} />
        </a>
      </div>
    );
  }

  // === STICKY ===
  if (variant === "sticky") {
    if (dismissed || !stickyVisible) return null;
    return (
      <div
        className="fixed bottom-0 left-0 right-0 z-50 flex items-center justify-between px-6 lg:px-10"
        style={{
          height: 56,
          background: "rgba(7,7,14,0.95)",
          borderTop: "1px solid rgba(212,175,85,0.15)",
          backdropFilter: "blur(12px)",
          animation: "slideUp 0.3s ease-out",
        }}
      >
        <style>{`@keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }`}</style>
        <p className="font-body truncate mr-4" style={{ fontSize: 13, color: "rgba(255,255,255,0.6)" }}>
          {settings.cta_headline || "Get Started"} →
        </p>
        <div className="flex items-center gap-3 shrink-0">
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            onClick={logClick}
            className="font-body uppercase px-4 py-1.5 transition-all"
            style={{ fontSize: 10, letterSpacing: "0.1em", fontWeight: 600, background: "#D4AF55", color: "#07070E", textDecoration: "none" }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "#E8C96A")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "#D4AF55")}
          >
            {settings.cta_button_text || "Learn More"}
          </a>
          <button
            onClick={() => setDismissed(true)}
            style={{ color: "rgba(255,255,255,0.3)", background: "none", border: "none", cursor: "pointer", padding: 4 }}
          >
            <X size={16} />
          </button>
        </div>
      </div>
    );
  }

  // === END ===
  return (
    <div className="my-16 p-10 lg:p-14 text-center" style={{ background: "linear-gradient(135deg, rgba(212,175,85,0.12), rgba(212,175,85,0.04))", border: "1px solid rgba(212,175,85,0.15)" }}>
      <h3 className="font-display italic mb-4" style={{ fontSize: 24, color: "#fff" }}>
        {settings.cta_headline || "Get Started"}
      </h3>
      {subtext && (
        <p className="font-body mb-6 mx-auto" style={{ fontSize: 15, color: "rgba(255,255,255,0.5)", lineHeight: 1.6, maxWidth: 480 }}>
          {subtext}
        </p>
      )}
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        onClick={logClick}
        className="font-body uppercase inline-flex items-center gap-2 px-8 py-4 transition-all duration-200"
        style={{
          fontSize: 12,
          letterSpacing: "0.12em",
          fontWeight: 600,
          background: "#D4AF55",
          color: "#07070E",
          textDecoration: "none",
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = "#E8C96A")}
        onMouseLeave={(e) => (e.currentTarget.style.background = "#D4AF55")}
      >
        {settings.cta_button_text || "Learn More"} <ArrowRight size={14} />
      </a>
      {settings.cta_social_proof && (
        <p className="font-body mt-5" style={{ fontSize: 12, color: "rgba(255,255,255,0.3)" }}>
          {settings.cta_social_proof}
        </p>
      )}
    </div>
  );
};

export default PublicCTA;
