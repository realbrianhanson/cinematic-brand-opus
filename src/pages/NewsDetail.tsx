import {
  newsFeedIssue,
  newsSourceLabel,
  uniqueNewsItems,
} from "../../supabase/functions/_shared/newsQuality";
import { formatPublicDate } from "@/lib/publicDate";
import { newsDisplay } from "@/lib/newsDisplay";
import type {
  PublicPost,
  PublicPillar,
  PublicGeneratedPage,
  PublicSiteSettings,
  PublicNewsItem,
} from "@/lib/publicTypes";
import type { Tables, Json } from "@/integrations/supabase/types";
import { renderNewsMarkdown, safeHref } from "@/lib/newsMarkdown";
import { useParams, Link } from "@/lib/router-compat";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  ArrowLeft,
  Clock,
  ExternalLink,
  Share2,
  Twitter,
  Linkedin,
  Facebook,
  Link as LinkIcon,
} from "lucide-react";
import Nav from "@/components/Nav";
import Footer from "@/components/Footer";
import { absoluteUrl, pageTitle } from "@/config/site";
import PageHead from "@/components/PageHead";
import { toast } from "@/hooks/use-toast";

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

const sourceName = newsSourceLabel;

interface NewsDetailProps {
  /** Server-rendered news item (published only). */
  initialItem?: PublicNewsItem | null;
}

const NewsDetail = ({ initialItem }: NewsDetailProps = {}) => {
  const { id } = useParams<{ id: string }>();

  const { data: item, isLoading } = useQuery({
    queryKey: ["news-item", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("source_items")
        .select(
          "id, title, url, raw_excerpt, image_url, topic_lane, published_at, full_content, ai_title, ai_summary, source_name",
        )
        .eq("id", id!)
        .eq("status", "published")
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
    ...(initialItem
      ? { initialData: initialItem as never, initialDataUpdatedAt: 0 }
      : {}),
  });

  const { data: related } = useQuery({
    queryKey: ["news-related", item?.topic_lane, id],
    queryFn: async () => {
      const { data } = await supabase
        .from("source_items")
        .select(
          "id, title, ai_title, ai_summary, raw_excerpt, image_url, topic_lane, published_at, source_name, url",
        )
        .eq("topic_lane", item!.topic_lane!)
        .eq("status", "published")
        .neq("id", id!)
        .order("published_at", { ascending: false, nullsFirst: false })
        .limit(30);
      return uniqueNewsItems([
        item!,
        ...(data ?? []).filter((row) => !newsFeedIssue(row)),
      ])
        .filter((row) => row.id !== item!.id)
        .slice(0, 4);
    },
    enabled: !!item?.topic_lane,
  });

  if (isLoading) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ background: "var(--brand-backdrop)" }}
      >
        <p className="font-body" style={{ color: "rgba(255,255,255,0.6)" }}>
          Loading article...
        </p>
      </div>
    );
  }
  if (!item) {
    return (
      <div
        className="min-h-screen flex flex-col items-center justify-center gap-6"
        style={{ background: "var(--brand-backdrop)" }}
      >
        <p className="font-display italic text-2xl" style={{ color: "#fff" }}>
          News item not found
        </p>
        <Link
          to="/news"
          className="font-body uppercase"
          style={{
            fontSize: 12,
            letterSpacing: "0.15em",
            color: "var(--brand-accent)",
          }}
        >
          ← Back to News
        </Link>
      </div>
    );
  }

  const { title, summary } = newsDisplay(item);
  const src = sourceName(item);
  const shareUrl = absoluteUrl(`/news/${item.id}`);
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
    <div
      className="min-h-screen"
      style={{ background: "#0b0b10", color: "#fff" }}
    >
      <Nav />

      <article
        id="main-content"
        className="mx-auto px-6 lg:px-14 pt-32 pb-24"
        style={{ maxWidth: 820 }}
      >
        <Link
          to="/news"
          className="inline-flex items-center gap-2 font-body uppercase mb-10 transition-colors duration-200"
          style={{
            fontSize: 11,
            letterSpacing: "0.18em",
            color: "rgba(255,255,255,0.45)",
          }}
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
          <span
            className="font-body uppercase"
            style={{
              fontSize: 11,
              letterSpacing: "0.15em",
              color: "var(--brand-accent)",
            }}
          >
            {laneLabel(item.topic_lane)}
          </span>
          <span
            className="font-body flex items-center gap-1"
            style={{ fontSize: 12, color: "rgba(255,255,255,0.7)" }}
          >
            <Clock size={12} />
            {item.published_at
              ? formatPublicDate(item.published_at, {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })
              : "Recent"}
          </span>
          <span
            className="font-body min-w-0 [overflow-wrap:anywhere]"
            style={{ fontSize: 12, color: "rgba(255,255,255,0.7)" }}
          >
            Source: {src}
          </span>
        </div>

        <h1
          className="font-display italic mb-6 [overflow-wrap:anywhere]"
          style={{ fontSize: "clamp(2rem, 5vw, 3.25rem)", lineHeight: 1.15 }}
        >
          {title}
        </h1>

        {summary && (
          <p
            className="font-body mb-10"
            style={{
              fontSize: 19,
              lineHeight: 1.6,
              color: "rgba(255,255,255,0.85)",
            }}
          >
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
            <div className="font-body">
              {renderNewsMarkdown(item.full_content)}
            </div>
          ) : (
            <div>
              <p
                className="font-body"
                style={{
                  color: "rgba(255,255,255,0.6)",
                  fontSize: 14,
                  fontStyle: "italic",
                }}
              >
                This briefing summarizes a third-party report. Read the source
                for its full reporting and context.
              </p>
            </div>
          )}

          {item.url && (
            <div
              className="mt-10 pt-6"
              style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}
            >
              <span
                className="font-body uppercase block mb-2"
                style={{
                  fontSize: 10,
                  letterSpacing: "0.18em",
                  color: "rgba(255,255,255,0.5)",
                }}
              >
                Reference
              </span>
              <a
                href={safeHref(item.url) ?? undefined}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex max-w-full items-center gap-2 font-body"
                style={{ color: "var(--brand-accent)", fontSize: 14 }}
              >
                <span className="min-w-0 [overflow-wrap:anywhere]">
                  Read the report on {src}
                </span>{" "}
                <ExternalLink className="shrink-0" size={13} />
              </a>
            </div>
          )}
        </div>

        {/* Share */}
        <div className="mt-10 flex items-center gap-3 flex-wrap">
          <span
            className="font-body uppercase flex items-center gap-2"
            style={{
              fontSize: 11,
              letterSpacing: "0.15em",
              color: "rgba(255,255,255,0.6)",
            }}
          >
            <Share2 size={13} /> Share
          </span>
          <a
            href={`https://twitter.com/intent/tweet?text=${shareTitle}&url=${encodeURIComponent(shareUrl)}`}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Share on Twitter"
            className="p-2"
            style={{
              border: "1px solid rgba(255,255,255,0.15)",
              color: "#fff",
            }}
          >
            <Twitter size={14} />
          </a>
          <a
            href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl)}`}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Share on LinkedIn"
            className="p-2"
            style={{
              border: "1px solid rgba(255,255,255,0.15)",
              color: "#fff",
            }}
          >
            <Linkedin size={14} />
          </a>
          <a
            href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Share on Facebook"
            className="p-2"
            style={{
              border: "1px solid rgba(255,255,255,0.15)",
              color: "#fff",
            }}
          >
            <Facebook size={14} />
          </a>
          <button
            onClick={copyLink}
            aria-label="Copy link"
            className="p-2"
            style={{
              border: "1px solid rgba(255,255,255,0.15)",
              color: "#fff",
              background: "transparent",
            }}
          >
            <LinkIcon size={14} />
          </button>
        </div>

        {/* Related */}
        {related && related.length > 0 && (
          <section className="mt-16">
            <h2
              className="font-display italic mb-6 [overflow-wrap:anywhere]"
              style={{ fontSize: 24 }}
            >
              Related News
            </h2>
            <div className="grid md:grid-cols-2 gap-5">
              {related.map((r) => (
                <Link
                  key={r.id}
                  to={`/news/${r.id}`}
                  className="group block p-4"
                  style={{
                    border: "1px solid rgba(255,255,255,0.08)",
                    background: "#14141b",
                    textDecoration: "none",
                  }}
                >
                  <div className="flex items-center gap-3 mb-2 flex-wrap">
                    <span
                      className="font-body uppercase"
                      style={{
                        fontSize: 10,
                        letterSpacing: "0.15em",
                        color: "var(--brand-accent)",
                      }}
                    >
                      {laneLabel(r.topic_lane)}
                    </span>
                    <span
                      className="font-body"
                      style={{ fontSize: 11, color: "rgba(255,255,255,0.55)" }}
                    >
                      {r.published_at
                        ? formatPublicDate(r.published_at, {
                            month: "short",
                            day: "numeric",
                          })
                        : ""}
                    </span>
                  </div>
                  <h3
                    className="font-display italic group-hover:text-[var(--brand-accent)] transition-colors"
                    style={{ fontSize: 17, lineHeight: 1.35, color: "#fff" }}
                  >
                    {newsDisplay(r).title}
                  </h3>
                  <p
                    className="font-body mt-2 [overflow-wrap:anywhere]"
                    style={{ fontSize: 12, color: "rgba(255,255,255,0.55)" }}
                  >
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
