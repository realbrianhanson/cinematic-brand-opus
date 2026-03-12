import { useState } from "react";
import { Linkedin, Twitter, Facebook, Link2, Mail } from "lucide-react";

const ICONS: Record<string, any> = {
  linkedin: Linkedin, twitter: Twitter, facebook: Facebook, copy: Link2, email: Mail,
};

const PageShareBar = ({ config }: { config: any }) => {
  const [copied, setCopied] = useState(false);
  const platforms: string[] = config.platforms || ["linkedin", "twitter", "facebook", "copy"];
  const url = typeof window !== "undefined" ? window.location.href : "";
  const title = typeof document !== "undefined" ? document.title : "";

  const shareUrls: Record<string, string> = {
    linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`,
    twitter: `https://twitter.com/intent/tweet?url=${encodeURIComponent(url)}&text=${encodeURIComponent(title)}`,
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`,
    email: `mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(url)}`,
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex items-center gap-3">
      {platforms.map((p) => {
        const Icon = ICONS[p];
        if (!Icon) return null;
        if (p === "copy") {
          return (
            <button key={p} onClick={handleCopy} className="p-2 transition-colors font-body flex items-center gap-1" style={{ color: "rgba(255,255,255,0.3)", border: "1px solid rgba(255,255,255,0.08)", background: "none", cursor: "pointer", fontSize: 11 }}>
              <Icon size={14} /> {copied ? "Copied!" : "Copy"}
            </button>
          );
        }
        return (
          <a key={p} href={shareUrls[p]} target="_blank" rel="noopener noreferrer" className="p-2 transition-colors" style={{ color: "rgba(255,255,255,0.3)", border: "1px solid rgba(255,255,255,0.08)" }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "hsl(var(--accent))")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "rgba(255,255,255,0.3)")}
          >
            <Icon size={14} />
          </a>
        );
      })}
    </div>
  );
};

export default PageShareBar;
