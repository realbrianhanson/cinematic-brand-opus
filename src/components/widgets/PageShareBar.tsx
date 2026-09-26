import type { WidgetConfig } from "@/lib/widgetConfig";
import { useState, useEffect, useRef } from "react";
import { Linkedin, Twitter, Facebook, Link2, Mail } from "lucide-react";
import { useLocation } from "@/lib/router-compat";
import { useSiteConfig } from "@/config/SiteConfigContext";
import { absoluteUrl } from "@/config/site";
import { withTimeout } from "@/lib/withTimeout";

const ICONS: Record<string, typeof Linkedin> = {
  linkedin: Linkedin,
  twitter: Twitter,
  facebook: Facebook,
  copy: Link2,
  email: Mail,
};

const PageShareBar = ({ config }: { config: WidgetConfig }) => {
  const { pathname } = useLocation();
  const siteConfig = useSiteConfig();
  const [copyState, setCopyState] = useState<
    "idle" | "copying" | "copied" | "manual"
  >("idle");
  const request = useRef(0);
  const platforms: string[] = config.platforms || [
    "linkedin",
    "twitter",
    "facebook",
    "copy",
  ];
  const url = absoluteUrl(pathname, siteConfig);
  const [title, setTitle] = useState("");
  useEffect(() => {
    setTitle(document.title);
    setCopyState("idle");
    request.current += 1;
    return () => {
      request.current += 1;
    };
  }, [url]);

  const shareUrls: Record<string, string> = {
    linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`,
    twitter: `https://twitter.com/intent/tweet?url=${encodeURIComponent(url)}&text=${encodeURIComponent(title)}`,
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`,
    email: `mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(url)}`,
  };

  const handleCopy = async () => {
    const operation = ++request.current;
    setCopyState("copying");
    try {
      await withTimeout(navigator.clipboard.writeText(url), 5000);
      if (request.current === operation) setCopyState("copied");
    } catch {
      if (request.current === operation) setCopyState("manual");
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        {platforms.map((p) => {
          const Icon = ICONS[p];
          if (!Icon) return null;
          if (p === "copy") {
            return (
              <button
                key={p}
                type="button"
                disabled={copyState === "copying"}
                onClick={handleCopy}
                className="min-h-11 p-2 transition-colors font-body flex items-center gap-1 disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--brand-accent)]"
                style={{
                  color: "var(--site-text-70, rgba(255,255,255,0.7))",
                  border:
                    "1px solid rgba(var(--site-ink-rgb,255,255,255),0.08)",
                  background: "none",
                  cursor: "pointer",
                  fontSize: 12,
                }}
              >
                <Icon size={14} aria-hidden="true" />{" "}
                {copyState === "copying" ? "Copying…" : "Copy link"}
              </button>
            );
          }
          return (
            <a
              key={p}
              aria-label={`Share via ${p}`}
              href={shareUrls[p]}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-11 min-w-11 items-center justify-center p-2 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--brand-accent)]"
              style={{
                color: "var(--site-text-70, rgba(255,255,255,0.7))",
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
              <Icon size={14} aria-hidden="true" />
            </a>
          );
        })}
      </div>
      <p role="status" className="text-xs text-white/75">
        {copyState === "copied" && "Page link copied."}
        {copyState === "manual" &&
          "We couldn’t copy the link. Select it below and copy it manually."}
      </p>
      {copyState === "manual" && (
        <input
          aria-label="Page link"
          readOnly
          value={url}
          onFocus={(event) => event.currentTarget.select()}
          className="w-full min-w-0 rounded border border-white/25 bg-white/5 px-3 py-2 text-sm text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--brand-accent)]"
        />
      )}
    </div>
  );
};

export default PageShareBar;
