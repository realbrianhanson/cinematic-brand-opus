import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, Clock, ExternalLink, Share2, Twitter, Linkedin, Facebook, Link as LinkIcon } from "lucide-react";
import Nav from "@/components/Nav";
import Footer from "@/components/Footer";
import PageHead from "@/components/PageHead";
import { toast } from "@/hooks/use-toast";

// Very small markdown -> HTML for the AI output (## headings, paragraphs, **bold**, [text](url)).
const renderMarkdown = (md: string): string => {
  const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const lines = md.split(/\r?\n/);
  const out: string[] = [];
  let para: string[] = [];
  const flushPara = () => {
    if (!para.length) return;
    let text = escape(para.join(" ").trim());
    text = text.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    text = text.replace(
      /\[([^\]]+)\]\(([^)]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener noreferrer" style="color:#D4AF55;text-decoration:underline;">$1</a>',
    );
    out.push(`<p style="margin:0 0 1.2em 0;font-size:17px;line-height:1.8;color:rgba(255,255,255,0.9);">${text}</p>`);
    para = [];
  };
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      flushPara();
      continue;
    }
    if (line.startsWith("### ")) {
      flushPara();
      out.push(
        `<h3 style="font-family:'Instrument Serif',serif;font-style:italic;font-size:22px;margin:2em 0 0.7em;color:#fff;">${escape(line.slice(4))}</h3>`,
      );
      continue;
    }
    if (line.startsWith("## ")) {
      flushPara();
      out.push(
        `<h2 style="font-family:'Instrument Serif',serif;font-style:italic;font-size:28px;margin:2em 0 0.8em;color:#fff;">${escape(line.slice(3))}</h2>`,
      );
      continue;
    }
    if (line.startsWith("# ")) {
      flushPara();
      out.push(
        `<h2 style="font-family:'Instrument Serif',serif;font-style:italic;font-size:32px;margin:2em 0 0.8em;color:#fff;">${escape(line.slice(2))}</h2>`,
      );
      continue;
    }
    para.push(line);
  }
  flushPara();
  return out.join("\n");
};

const laneLabel = (lane?: string | null) => {
  switch (lane) {
    case "ai_tools":
      return "AI Tools";
    case "smb_marketing":
      return "SMB Marketing";
    case "ai_training":
      return "AI Training";
    case "industry":
      return "Industry";
    default:
      return lane ? lane.replace(/_/g, " ") : "News";
  }
};

const sourceName = (n: any): string => {
  if (n?.source_name) return n.source_name;
  try {
    return new URL(n.url).hostname.replace(/^www\./, "");
  } catch {
    return "Source";
  }
};

const NewsDetail = () => {
  const { id } = useParams<{ id: string }>();
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);

  const {
    data: item,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ["news-item", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("source_items")
        .select(
          "id, title, url, raw_excerpt, image_url, topic_lane, published_at, full_content, ai_title, ai_summary, source_name",
        )
        .eq("id", id!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  const { data: related } = useQuery({
    queryKey: ["news-related", item?.topic_lane, id],
    queryFn: async () => {
      const { data } = await supabase
        .from("source_items")
        .select("id, title, image_url, topic_lane, published_at, source_name, url")
        .eq("topic_lane", item!.topic_lane!)
        .eq("status", "published")
        .neq("id", id!)
        .order("published_at", { ascending: false, nullsFirst: false })
        .limit(6);
      return data ?? [];
    },
    enabled: !!item?.topic_lane,
  });

  // Auto-generate full content if missing.
  useEffect(() => {
    if (!item || item.full_content || generating) return;
    setGenerating(true);
    setGenError(null);
    supabase.functions
      .invoke("generate-news-article", { body: { id: item.id } })
      .then(({ error }) => {
        if (error) setGenError(error.message || "Failed to generate article");
        return refetch();
      })
      .catch((e) => setGenError(String(e)))
      .finally(() => setGenerating(false));
  }, [item?.id, item?.full_content]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#07070E" }}>
        <p className="font-body" style={{ color: "rgba(255,255,255,0.6)" }}>
          Loading article...
        </p>
      </div>
    );
  }
  if (!item) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-6" style={{ background: "#07070E" }}>
        <p className="font-display italic text-2xl" style={{ color: "#fff" }}>
          News item not found
        </p>
        <Link
          to="/blog"
          className="font-body uppercase"
          style={{ fontSize: 12, letterSpacing: "0.15em", color: "#D4AF55" }}
        >
          ← Back to Blog
        </Link>
      </div>
    );
  }

  const title = item.ai_title || item.title;
  const summary = item.ai_summary || item.raw_excerpt;
  const src = sourceName(item);
  const shareUrl = typeof window !== "undefined" ? window.location.href : "";
  const shareTitle = encodeURIComponent(title || "");

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      toast({ title: "Link copied" });
    } catch {
      /* noop */
    }
  };

  return (
    <div className="min-h-screen" style={{ background: "#0b0b10", color: "#fff" }}>
      <Nav />
      <PageHead
        title={`${title} | Brian Hanson`}
        description={summary || ""}
        url={shareUrl}
        image={item.image_url || undefined}
        publishedAt={item.published_at || undefined}
      />

      <article id="main-content" className="mx-auto px-6 lg:px-14 pt-32 pb-24" style={{ maxWidth: 820 }}>
        <Link
          to="/blog"
          className="inline-flex items-center gap-2 font-body uppercase mb-10 transition-colors duration-200"
          style={{ fontSize: 11, letterSpacing: "0.18em", color: "rgba(255,255,255,0.45)" }}
        >
          <ArrowLeft size={14} /> Back to News
        </Link>

        {item.image_url && (
          <img
            src={item.image_url}
            alt={title || "News"}
            loading="eager"
            className="w-full mb-8"
            style={{ maxHeight: 480, objectFit: "cover" }}
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = "none";
            }}
          />
        )}

        <div className="flex items-center gap-4 mb-6 flex-wrap">
          <span className="font-body uppercase" style={{ fontSize: 11, letterSpacing: "0.15em", color: "#D4AF55" }}>
            {laneLabel(item.topic_lane)}
          </span>
          <span className="font-body flex items-center gap-1" style={{ fontSize: 12, color: "rgba(255,255,255,0.7)" }}>
            <Clock size={12} />
            {item.published_at
              ? new Date(item.published_at).toLocaleDateString(undefined, {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })
              : "Recent"}
          </span>
          <span className="font-body" style={{ fontSize: 12, color: "rgba(255,255,255,0.7)" }}>
            Source: {src}
          </span>
        </div>

        <h1 className="font-display italic mb-6" style={{ fontSize: "clamp(2rem, 5vw, 3.25rem)", lineHeight: 1.15 }}>
          {title}
        </h1>

        {summary && (
          <p className="font-body mb-10" style={{ fontSize: 19, lineHeight: 1.6, color: "rgba(255,255,255,0.85)" }}>
            {summary}
          </p>
        )}

        <div
          style={{
            background: "#14141b",
            border: "1px solid rgba(255,255,255,0.06)",
            padding: "clamp(24px, 4vw, 40px)",
          }}
        >
          {item.full_content ? (
            <div className="font-body" dangerouslySetInnerHTML={{ __html: renderMarkdown(item.full_content) }} />
          ) : generating ? (
            <p className="font-body" style={{ color: "rgba(255,255,255,0.7)", fontSize: 16 }}>
              Generating the full article — this usually takes 10-20 seconds. The page will refresh automatically.
            </p>
          ) : genError ? (
            <p className="font-body" style={{ color: "#f88", fontSize: 15 }}>
              Could not generate the article: {genError}
            </p>
          ) : (
            <p className="font-body" style={{ color: "rgba(255,255,255,0.6)" }}>
              Preparing article...
            </p>
          )}

          {item.url && (
            <div className="mt-10 pt-6" style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}>
              <span
                className="font-body uppercase block mb-2"
                style={{ fontSize: 10, letterSpacing: "0.18em", color: "rgba(255,255,255,0.5)" }}
              >
                Reference
              </span>
              <a
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 font-body"
                style={{ color: "#D4AF55", fontSize: 14 }}
              >
                Original report on {src} <ExternalLink size={13} />
              </a>
            </div>
          )}
        </div>

        {/* Share */}
        <div className="mt-10 flex items-center gap-3 flex-wrap">
          <span
            className="font-body uppercase flex items-center gap-2"
            style={{ fontSize: 11, letterSpacing: "0.15em", color: "rgba(255,255,255,0.6)" }}
          >
            <Share2 size={13} /> Share
          </span>
          <a
            href={`https://twitter.com/intent/tweet?text=${shareTitle}&url=${encodeURIComponent(shareUrl)}`}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Share on Twitter"
            className="p-2"
            style={{ border: "1px solid rgba(255,255,255,0.15)", color: "#fff" }}
          >
            <Twitter size={14} />
          </a>
          <a
            href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl)}`}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Share on LinkedIn"
            className="p-2"
            style={{ border: "1px solid rgba(255,255,255,0.15)", color: "#fff" }}
          >
            <Linkedin size={14} />
          </a>
          <a
            href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Share on Facebook"
            className="p-2"
            style={{ border: "1px solid rgba(255,255,255,0.15)", color: "#fff" }}
          >
            <Facebook size={14} />
          </a>
          <button
            onClick={copyLink}
            aria-label="Copy link"
            className="p-2"
            style={{ border: "1px solid rgba(255,255,255,0.15)", color: "#fff", background: "transparent" }}
          >
            <LinkIcon size={14} />
          </button>
        </div>

        {/* Related */}
        {related && related.length > 0 && (
          <section className="mt-16">
            <h2 className="font-display italic mb-6" style={{ fontSize: 24 }}>
              Related News
            </h2>
            <div className="grid md:grid-cols-2 gap-5">
              {related.map((r: any) => (
                <Link
                  key={r.id}
                  to={`/news/${r.id}`}
                  className="group block p-4"
                  style={{ border: "1px solid rgba(255,255,255,0.08)", background: "#14141b", textDecoration: "none" }}
                >
                  <div className="flex items-center gap-3 mb-2 flex-wrap">
                    <span
                      className="font-body uppercase"
                      style={{ fontSize: 10, letterSpacing: "0.15em", color: "#D4AF55" }}
                    >
                      {laneLabel(r.topic_lane)}
                    </span>
                    <span className="font-body" style={{ fontSize: 11, color: "rgba(255,255,255,0.55)" }}>
                      {r.published_at
                        ? new Date(r.published_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })
                        : ""}
                    </span>
                  </div>
                  <h3
                    className="font-display italic group-hover:text-[#D4AF55] transition-colors"
                    style={{ fontSize: 17, lineHeight: 1.35, color: "#fff" }}
                  >
                    {r.title}
                  </h3>
                  <p className="font-body mt-2" style={{ fontSize: 12, color: "rgba(255,255,255,0.55)" }}>
                    {sourceName(r)}
                  </p>
                </Link>
              ))}
            </div>
          </section>
        )}
      </article>
      <Footer />
    </div>
  );
};

export default NewsDetail;
