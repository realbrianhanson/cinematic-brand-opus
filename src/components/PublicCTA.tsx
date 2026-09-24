import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSiteConfig } from "@/config/SiteConfigContext";
import { safeHref } from "@/lib/newsMarkdown";
import { X, ArrowRight } from "lucide-react";
import {
  contentOfferCopy,
  resolveContentOffer,
} from "@/lib/contentOfferRouting";
import {
  isSummitUrl,
  summitHref,
  type SummitPlacement,
} from "@/lib/summitLink";

interface PublicCTAProps {
  variant: "inline" | "sticky" | "end";
  nicheSlug?: string;
  contentTypeSlug?: string;
  nicheName?: string;
  pageId?: string;
  pageType?: string;
  /**
   * When set and the configured CTA is the Summit, the link carries the
   * site-wide Summit tags for this placement instead of the pSEO tags.
   */
  summitPlacement?: SummitPlacement;
}

const PublicCTA = ({
  variant,
  nicheSlug,
  contentTypeSlug,
  nicheName,
  pageId,
  pageType,
  summitPlacement,
}: PublicCTAProps) => {
  const siteConfig = useSiteConfig();
  const { data: settings } = useQuery({
    queryKey: ["public-site-settings"],
    queryFn: async () => {
      const { data } = await supabase
        .from("site_settings")
        .select(
          "id, site_name, site_url, author_name, author_title, author_bio, author_credentials, author_social_links, cta_url, cta_headline, cta_subtext, cta_button_text, cta_social_proof, publisher_name, publisher_url, updated_at",
        )
        .limit(1)
        .maybeSingle();
      return data;
    },
    staleTime: 60000,
  });

  const { data: matchedOffer, isPending: routingPending } = useQuery({
    queryKey: [
      "public-content-offer",
      pageType,
      pageId,
      contentTypeSlug,
      nicheSlug,
    ],
    queryFn: () =>
      resolveContentOffer({ pageId, pageType, contentTypeSlug, nicheSlug }),
    staleTime: 30_000,
    retry: false,
  });

  const [stickyVisible, setStickyVisible] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (variant !== "sticky") return;
    const onScroll = () => {
      const scrollPct =
        window.scrollY /
        (document.documentElement.scrollHeight - window.innerHeight);
      setStickyVisible(scrollPct > 0.5);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [variant]);

  const offerCopy = matchedOffer ? contentOfferCopy(matchedOffer) : null;
  const headline =
    offerCopy?.headline || settings?.cta_headline || "Get Started";
  const buttonText =
    offerCopy?.buttonText || settings?.cta_button_text || "Learn More";
  const subtext = offerCopy
    ? offerCopy.subtext
    : nicheName && settings?.cta_subtext
      ? settings.cta_subtext.replace(
          /your business/gi,
          `your ${nicheName} business`,
        )
      : settings?.cta_subtext;

  let href = offerCopy?.href || "";
  if (!offerCopy && safeHref(settings?.cta_url)) {
    try {
      if (summitPlacement && isSummitUrl(settings!.cta_url)) {
        href = summitHref(settings!.cta_url!, summitPlacement);
      } else {
        const url = new URL(settings!.cta_url!, siteConfig.identity.siteUrl);
        url.searchParams.set(
          "utm_source",
          new URL(siteConfig.identity.siteUrl).hostname,
        );
        url.searchParams.set("utm_medium", "pseo");
        if (contentTypeSlug)
          url.searchParams.set("utm_campaign", contentTypeSlug);
        if (nicheSlug) url.searchParams.set("utm_content", nicheSlug);
        href = url.toString();
      }
    } catch {
      // Invalid global settings produce no link; a configured offer stays usable.
    }
  }
  if (routingPending || !href) return null;
  const linkProps = {
    href,
    // Native offer links stay in this tab and preserve acquisition attribution.
    target: offerCopy ? undefined : "_blank",
    rel: offerCopy ? undefined : "noopener noreferrer",
    "data-conversion-destination": offerCopy ? undefined : "external_resource",
    "data-conversion-placement": "resource",
  };

  // === INLINE ===
  if (variant === "inline") {
    return (
      <div
        className="my-12 p-6 lg:p-8 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-5"
        style={{
          background: "rgba(var(--brand-accent-rgb),0.05)",
          border: "1px solid rgba(var(--brand-accent-rgb),0.1)",
        }}
      >
        <div>
          <p
            className="font-body font-bold mb-1"
            style={{ fontSize: 18, color: "rgba(255,255,255,0.9)" }}
          >
            {headline}
          </p>
          {subtext && (
            <p
              className="font-body"
              style={{
                fontSize: 14,
                color: "rgba(255,255,255,0.75)",
                lineHeight: 1.5,
              }}
            >
              {subtext}
            </p>
          )}
        </div>
        <a
          {...linkProps}
          className="font-body uppercase shrink-0 inline-flex items-center gap-2 px-6 py-3 transition-all duration-200"
          style={{
            fontSize: 12,
            letterSpacing: "0.12em",
            fontWeight: 600,
            background: "var(--brand-accent)",
            color: "var(--brand-backdrop)",
            border: "none",
            textDecoration: "none",
          }}
          onMouseEnter={(e) =>
            (e.currentTarget.style.background = "var(--brand-accent-light)")
          }
          onMouseLeave={(e) =>
            (e.currentTarget.style.background = "var(--brand-accent)")
          }
        >
          {buttonText} <ArrowRight size={14} />
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
          background: "rgba(var(--brand-backdrop-rgb),0.95)",
          borderTop: "1px solid rgba(var(--brand-accent-rgb),0.15)",
          backdropFilter: "blur(12px)",
          animation: "slideUp 0.3s ease-out",
        }}
      >
        <style>{`@keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }`}</style>
        <p
          className="font-body truncate mr-4"
          style={{ fontSize: 13, color: "rgba(255,255,255,0.8)" }}
        >
          {headline} →
        </p>
        <div className="flex items-center gap-3 shrink-0">
          <a
            {...linkProps}
            className="font-body uppercase px-4 py-1.5 transition-all"
            style={{
              fontSize: 12,
              letterSpacing: "0.1em",
              fontWeight: 600,
              background: "var(--brand-accent)",
              color: "var(--brand-backdrop)",
              textDecoration: "none",
            }}
            onMouseEnter={(e) =>
              (e.currentTarget.style.background = "var(--brand-accent-light)")
            }
            onMouseLeave={(e) =>
              (e.currentTarget.style.background = "var(--brand-accent)")
            }
          >
            {buttonText}
          </a>
          <button
            onClick={() => setDismissed(true)}
            aria-label="Dismiss notification"
            style={{
              color: "rgba(255,255,255,0.7)",
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: 4,
            }}
          >
            <X size={16} />
          </button>
        </div>
      </div>
    );
  }

  // === END ===
  return (
    <div
      className="my-16 p-10 lg:p-14 text-center"
      style={{
        background:
          "linear-gradient(135deg, rgba(var(--brand-accent-rgb),0.12), rgba(var(--brand-accent-rgb),0.04))",
        border: "1px solid rgba(var(--brand-accent-rgb),0.15)",
      }}
    >
      <h3 className="font-display text-title mb-4 text-white">{headline}</h3>
      {subtext && (
        <p
          className="font-body mb-6 mx-auto"
          style={{
            fontSize: 15,
            color: "rgba(255,255,255,0.8)",
            lineHeight: 1.6,
            maxWidth: 480,
          }}
        >
          {subtext}
        </p>
      )}
      <a
        {...linkProps}
        className="font-body uppercase inline-flex items-center gap-2 px-8 py-4 transition-all duration-200"
        style={{
          fontSize: 12,
          letterSpacing: "0.12em",
          fontWeight: 600,
          background: "var(--brand-accent)",
          color: "var(--brand-backdrop)",
          textDecoration: "none",
        }}
        onMouseEnter={(e) =>
          (e.currentTarget.style.background = "var(--brand-accent-light)")
        }
        onMouseLeave={(e) =>
          (e.currentTarget.style.background = "var(--brand-accent)")
        }
      >
        {buttonText} <ArrowRight size={14} />
      </a>
      {!offerCopy && settings?.cta_social_proof && (
        <p
          className="font-body mt-5"
          style={{ fontSize: 12, color: "rgba(255,255,255,0.7)" }}
        >
          {settings.cta_social_proof}
        </p>
      )}
    </div>
  );
};

export default PublicCTA;
