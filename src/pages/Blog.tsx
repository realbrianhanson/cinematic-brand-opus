import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { ArrowRight, ArrowLeft, Clock } from "lucide-react";
import PageHead from "@/components/PageHead";
import Footer from "@/components/Footer";
import Nav from "@/components/Nav";
import CustomCursor from "@/components/CustomCursor";

// Simple hash to pick a stable gradient direction per post
const hashSeed = (s: string) => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) & 0xffffffff;
  return Math.abs(h);
};

const TypographicCover = ({ title }: { title: string }) => {
  const seed = hashSeed(title);
  const angle = 100 + (seed % 80); // 100-180deg
  const initial = (title || "•").trim().charAt(0).toUpperCase();
  return (
    <div
      aria-hidden="true"
      className="relative w-full flex items-end p-6"
      style={{
        height: 200,
        background: `linear-gradient(${angle}deg, #D4AF55 0%, #8B7023 55%, #14141b 100%)`,
        overflow: "hidden",
      }}
    >
      <span
        className="font-display italic select-none"
        style={{
          position: "absolute",
          top: -20,
          right: 8,
          fontSize: 220,
          lineHeight: 1,
          color: "rgba(7,7,14,0.35)",
        }}
      >
        {initial}
      </span>
      <span
        className="font-display italic relative"
        style={{
          fontSize: 24,
          lineHeight: 1.15,
          color: "rgba(7,7,14,0.9)",
          maxWidth: "80%",
          textShadow: "0 1px 0 rgba(255,255,255,0.08)",
        }}
      >
        {title.length > 60 ? title.slice(0, 60) + "…" : title}
      </span>
    </div>
  );
};

const Blog = () => {
  const { data: posts, isLoading, isError } = useQuery({
    queryKey: ["public-posts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("posts")
        .select("*, categories(name, slug)")
        .eq("status", "published")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    retry: 2,
    staleTime: 30_000,
  });

  const { data: newsItems } = useQuery({
    queryKey: ["public-news-signals"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("source_items")
        .select("id, title, url, author, published_at, raw_excerpt, image_url, topic_lane, ai_title, ai_summary, content_sources(name)")
        .order("published_at", { ascending: false, nullsFirst: false })
        .limit(60);
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 60_000,
  });

  const laneLabel = (lane?: string | null) => {
    switch (lane) {
      case "ai_tools": return "A.I. Tools";
      case "smb_marketing": return "SMB Marketing";
      case "ai_training": return "A.I. Training";
      case "industry": return "Industry";
      case "local_news": return "Jacksonville";
      default: return lane ? lane.replace(/_/g, " ") : "News";
    }
  };

  const sourceName = (n: any): string => {
    if (n?.content_sources?.name) return n.content_sources.name;
    try { return new URL(n.url).hostname.replace(/^www\./, ""); } catch { return "Source"; }
  };


  return (
    <div
      className="public-site min-h-screen"
      style={{ background: "#07070E", color: "#fff" }}
    >
      <PageHead title="Articles & Playbooks | Brian Hanson" description="AI, marketing, and building businesses that matter. Playbooks, frameworks, and applied strategy from Brian Hanson." url="https://brianhanson.com/blog" type="website" />
      <CustomCursor />
      <Nav />
      {/* Header */}
      <header
        className="pt-32 pb-16 px-6 lg:px-14 mx-auto"
        style={{ maxWidth: 1440 }}
      >
        <Link
          to="/"
          className="inline-flex items-center gap-2 font-body uppercase mb-12 transition-colors duration-200"
          style={{
            fontSize: 12,
            letterSpacing: "0.18em",
            color: "rgba(255,255,255,0.75)",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "#D4AF55")}
          onMouseLeave={(e) =>
            (e.currentTarget.style.color = "rgba(255,255,255,0.75)")
          }
        >
          <ArrowLeft size={14} />
          Back to Home
        </Link>
        <h1
          className="font-display italic"
          style={{
            fontSize: "clamp(2.5rem, 6vw, 4.5rem)",
            lineHeight: 1.1,
            color: "#fff",
          }}
        >
          Articles &amp; Playbooks
        </h1>
        <p
          className="font-body mt-4"
          style={{
            fontSize: 17,
            color: "rgba(255,255,255,0.85)",
            maxWidth: 560,
            lineHeight: 1.6,
          }}
        >
          AI, marketing, and building businesses that matter.
        </p>
      </header>

      {/* Posts grid */}
      <main id="main-content"
        className="px-6 lg:px-14 pb-24 mx-auto"
        style={{ maxWidth: 1440 }}
      >
        {isLoading && (
          <p
            className="font-body"
            style={{ color: "rgba(255,255,255,0.75)", fontSize: 15 }}
          >
            Loading...
          </p>
        )}

        {isError && !isLoading && (
          <p
            className="font-body"
            style={{ color: "rgba(255,255,255,0.75)", fontSize: 15 }}
          >
            Failed to load posts. Please refresh the page.
          </p>
        )}

        {!isLoading && !isError && posts?.length === 0 && (
          <p
            className="font-body"
            style={{ color: "rgba(255,255,255,0.75)", fontSize: 15 }}
          >
            No posts published yet. Check back soon.
          </p>
        )}

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
          {posts?.map((post) => (
            <Link
              to={`/blog/${post.slug}`}
              key={post.id}
              className="group block h-full"
              style={{
                border: "1px solid rgba(255,255,255,0.08)",
                background: "#14141b",
                transition: "border-color 0.3s, transform 0.3s",
                display: "flex",
                flexDirection: "column",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = "rgba(212,175,85,0.35)";
                e.currentTarget.style.transform = "translateY(-4px)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)";
                e.currentTarget.style.transform = "translateY(0)";
              }}
            >
              {post.featured_image ? (
                <div
                  style={{
                    height: 200,
                    overflow: "hidden",
                    background: "#0a0a14",
                    flexShrink: 0,
                  }}
                >
                  <img
                    src={post.featured_image}
                    alt={(post as any).featured_image_alt || post.title}
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                    loading="lazy"
                  />
                </div>
              ) : (
                <TypographicCover title={post.title} />
              )}
              <div className="p-6 flex flex-col flex-1">
                <div className="flex items-center gap-3 mb-4">
                  {(post as any).categories?.name && (
                    <span
                      className="font-body uppercase"
                      style={{
                        fontSize: 11,
                        letterSpacing: "0.15em",
                        color: "#D4AF55",
                      }}
                    >
                      {(post as any).categories.name}
                    </span>
                  )}
                  <span
                    className="font-body flex items-center gap-1"
                    style={{
                      fontSize: 12,
                      color: "rgba(255,255,255,0.7)",
                    }}
                  >
                    <Clock size={11} />
                    {post.reading_time ?? 1} min
                  </span>
                </div>
                <h2
                  className="font-display italic mb-3 transition-colors duration-300 group-hover:text-[#D4AF55]"
                  style={{
                    fontSize: 22,
                    lineHeight: 1.3,
                    color: "#fff",
                  }}
                >
                  {post.title}
                </h2>
                {post.excerpt && (
                  <p
                    className="font-body"
                    style={{
                      fontSize: 15,
                      color: "rgba(255,255,255,0.85)",
                      lineHeight: 1.6,
                      display: "-webkit-box",
                      WebkitLineClamp: 3,
                      WebkitBoxOrient: "vertical",
                      overflow: "hidden",
                    }}
                  >
                    {post.excerpt}
                  </p>
                )}
                <div
                  className="flex items-center gap-1 mt-auto pt-5 font-body uppercase transition-colors duration-300 group-hover:text-[#D4AF55]"
                  style={{
                    fontSize: 11,
                    letterSpacing: "0.15em",
                    color: "rgba(255,255,255,0.75)",
                  }}
                >
                  Read article <ArrowRight size={12} />
                </div>
              </div>
            </Link>
          ))}
        </div>

        {newsItems && newsItems.length > 0 && (
          <section style={{ marginTop: 96 }}>
            <div className="flex items-baseline justify-between flex-wrap gap-3 mb-8">
              <h2 className="font-display italic" style={{ fontSize: "clamp(1.75rem, 3.5vw, 2.5rem)", color: "#fff" }}>
                Latest News
              </h2>
              <span className="font-body uppercase" style={{ fontSize: 11, letterSpacing: "0.18em", color: "rgba(255,255,255,0.6)" }}>
                Live Signal Feed
              </span>
            </div>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {newsItems.map((n: any) => (
                <Link
                  key={n.id}
                  to={`/news/${n.id}`}
                  className="group block h-full"
                  style={{
                    border: "1px solid rgba(255,255,255,0.08)",
                    background: "#14141b",
                    transition: "border-color 0.3s, transform 0.3s",
                    textDecoration: "none",
                    display: "flex",
                    flexDirection: "column",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = "rgba(212,175,85,0.35)";
                    e.currentTarget.style.transform = "translateY(-3px)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)";
                    e.currentTarget.style.transform = "translateY(0)";
                  }}
                >
                  {n.image_url ? (
                    <div style={{ height: 180, overflow: "hidden", background: "#0a0a14", flexShrink: 0 }}>
                      <img
                        src={n.image_url}
                        alt={n.title || "News"}
                        loading="lazy"
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                        onError={(e) => { (e.currentTarget.parentElement as HTMLElement).style.display = "none"; }}
                      />
                    </div>
                  ) : (
                    <TypographicCover title={n.title || sourceName(n)} />
                  )}
                  <div className="p-5 flex flex-col flex-1">
                    <div className="flex items-center gap-3 mb-3 flex-wrap">
                      <span className="font-body uppercase" style={{ fontSize: 10, letterSpacing: "0.18em", color: "#D4AF55" }}>
                        {laneLabel(n.topic_lane)}
                      </span>
                      <span className="font-body flex items-center gap-1" style={{ fontSize: 11, color: "rgba(255,255,255,0.65)" }}>
                        <Clock size={10} />
                        {n.published_at ? new Date(n.published_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "Recent"}
                      </span>
                    </div>
                    <h3 className="font-display italic mb-2 transition-colors duration-300 group-hover:text-[#D4AF55]" style={{ fontSize: 18, lineHeight: 1.35, color: "#fff" }}>
                      {n.title}
                    </h3>
                    {n.raw_excerpt && (
                      <p className="font-body" style={{ fontSize: 14, color: "rgba(255,255,255,0.85)", lineHeight: 1.55, display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                        {n.raw_excerpt}
                      </p>
                    )}
                    <div className="flex items-center justify-between gap-2 mt-auto pt-4">
                      <span className="font-body truncate" style={{ fontSize: 12, color: "rgba(255,255,255,0.7)" }}>
                        {sourceName(n)}
                      </span>
                      <span className="flex items-center gap-1 font-body uppercase transition-colors duration-300 group-hover:text-[#D4AF55]" style={{ fontSize: 10, letterSpacing: "0.15em", color: "rgba(255,255,255,0.75)", whiteSpace: "nowrap" }}>
                        Read more <ArrowRight size={11} />
                      </span>
                    </div>
                  </div>

                </Link>
              ))}
            </div>
          </section>
        )}
      </main>
      <Footer />
    </div>
  );
};

export default Blog;
