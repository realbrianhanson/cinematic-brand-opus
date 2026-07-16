import { useEffect, useMemo, useRef, useState } from "react";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, Clock, Search } from "lucide-react";
import PageHead from "@/components/PageHead";
import Footer from "@/components/Footer";
import Nav from "@/components/Nav";
import CustomCursor from "@/components/CustomCursor";

const hashSeed = (s: string) => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) & 0xffffffff;
  return Math.abs(h);
};

const TypographicCover = ({ title, label }: { title: string; label?: string }) => {
  const seed = hashSeed(title);
  const angle = 100 + (seed % 80);
  const initial = (title || "•").trim().charAt(0).toUpperCase();
  return (
    <div
      aria-hidden="true"
      className="relative w-full h-full flex items-end p-6"
      style={{
        background: `linear-gradient(${angle}deg, #D4AF55 0%, #8B7023 55%, #14141b 100%)`,
        overflow: "hidden",
      }}
    >
      <span
        className="font-display italic select-none"
        style={{ position: "absolute", top: -20, right: 8, fontSize: 220, lineHeight: 1, color: "rgba(7,7,14,0.35)" }}
      >
        {initial}
      </span>
      {label && (
        <span
          className="font-body uppercase"
          style={{
            position: "absolute",
            top: 12,
            left: 16,
            fontSize: 10,
            letterSpacing: "0.2em",
            color: "rgba(7,7,14,0.85)",
            background: "rgba(255,255,255,0.35)",
            padding: "4px 8px",
            borderRadius: 2,
          }}
        >
          {label}
        </span>
      )}
    </div>
  );
};

const NewsImage = ({
  src,
  alt,
  fallbackTitle,
  fallbackLabel,
}: {
  src: string;
  alt: string;
  fallbackTitle: string;
  fallbackLabel?: string;
}) => {
  const [failed, setFailed] = useState(false);
  if (failed) return <TypographicCover title={fallbackTitle} label={fallbackLabel} />;
  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      decoding="async"
      className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
      onError={() => setFailed(true)}
    />
  );
};

const BUCKETS: { value: "all" | "ai" | "marketing" | "sales"; label: string; lanes: string[] }[] = [
  { value: "all", label: "All", lanes: ["ai_tools", "ai_training", "smb_marketing", "sales"] },
  { value: "ai", label: "AI", lanes: ["ai_tools", "ai_training"] },
  { value: "marketing", label: "Marketing", lanes: ["smb_marketing"] },
  { value: "sales", label: "Sales", lanes: ["sales"] },
];

const ALLOWED_LANES = new Set(["ai_tools", "ai_training", "smb_marketing", "sales"]);

const bucketForLane = (lane?: string | null): "ai" | "marketing" | "sales" | null => {
  if (lane === "ai_tools" || lane === "ai_training") return "ai";
  if (lane === "smb_marketing") return "marketing";
  if (lane === "sales") return "sales";
  return null;
};

const laneLabel = (lane?: string | null) => {
  const b = bucketForLane(lane);
  if (b === "ai") return "AI";
  if (b === "marketing") return "Marketing";
  if (b === "sales") return "Sales";
  return "News";
};

const AI_KEYWORDS =
  /\b(a\.?i\.?|artificial intelligence|machine learning|ml|llm|large language model|gpt|chatgpt|openai|anthropic|claude|gemini|copilot|prompt|generative|neural|deep learning|automation)\b/i;
const MARKETING_KEYWORDS =
  /\b(marketing|seo|search engine|content strategy|brand(?:ing)?|advertising|ad campaign|social media|email marketing|newsletter|growth|inbound|hubspot|analytics|conversion rate|cro|paid media|ppc|funnel)\b/i;
const SALES_KEYWORDS =
  /\b(sales|sell(?:ing)?|revenue|pipeline|prospect(?:ing)?|lead(?:s|gen)?|outreach|outbound|cold (?:call|email)|closing|deal(?:s)?|quota|crm|account executive|sdr|bdr|negotiat)\b/i;

const isOnBrand = (n: any): boolean => {
  if (ALLOWED_LANES.has(n.topic_lane)) return true;
  const hay = `${n.ai_title || ""} ${n.title || ""} ${n.ai_summary || ""} ${n.raw_excerpt || ""}`;
  return AI_KEYWORDS.test(hay) || MARKETING_KEYWORDS.test(hay) || SALES_KEYWORDS.test(hay);
};

const sourceName = (n: any): string => {
  if (n?.source_name) return n.source_name;
  try {
    return new URL(n.url).hostname.replace(/^www\./, "");
  } catch {
    return "Source";
  }
};

const PAGE_SIZE = 18;

const NewsCardSkeleton = () => (
  <div
    className="grid gap-6 py-6 md:py-8 animate-pulse"
    style={{ gridTemplateColumns: "minmax(120px, 220px) 1fr", borderBottom: "1px solid rgba(255,255,255,0.08)" }}
  >
    <div style={{ aspectRatio: "4 / 3", background: "rgba(255,255,255,0.04)" }} />
    <div className="flex flex-col justify-center gap-3">
      <div style={{ height: 10, width: 80, background: "rgba(255,255,255,0.06)" }} />
      <div style={{ height: 22, width: "80%", background: "rgba(255,255,255,0.08)" }} />
      <div style={{ height: 14, width: "95%", background: "rgba(255,255,255,0.05)" }} />
      <div style={{ height: 14, width: "60%", background: "rgba(255,255,255,0.05)" }} />
    </div>
  </div>
);

const News = () => {
  const [query, setQuery] = useState("");
  const [lane, setLane] = useState<string>("all");
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const queryClient = useQueryClient();

  const {
    data,
    isLoading,
    isError,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ["public-news-infinite"],
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      const from = (pageParam as number) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      const { data, error } = await supabase
        .from("source_items")
        .select(
          "id, title, url, author, published_at, raw_excerpt, image_url, topic_lane, ai_title, ai_summary, content_sources(name)",
        )
        .eq("status", "published")
        .order("published_at", { ascending: false, nullsFirst: false })
        .range(from, to);
      if (error) throw error;
      return { items: data ?? [], nextPage: (data?.length ?? 0) === PAGE_SIZE ? (pageParam as number) + 1 : null };
    },
    getNextPageParam: (last) => last.nextPage,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  // Live updates: refetch when new news items land
  useEffect(() => {
    const channel = supabase
      .channel("public-news-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "source_items" }, () =>
        queryClient.invalidateQueries({ queryKey: ["public-news-infinite"] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  // IntersectionObserver for infinite scroll
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { rootMargin: "600px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const allItems = useMemo(() => {
    const seen = new Set<string>();
    const out: any[] = [];
    for (const page of data?.pages ?? []) {
      for (const it of page.items) {
        if (seen.has(it.id)) continue;
        seen.add(it.id);
        out.push(it);
      }
    }
    return out;
  }, [data]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const bucket = BUCKETS.find((b) => b.value === lane) ?? BUCKETS[0];
    const allowedLanes = new Set(bucket.lanes);
    return allItems.filter((n: any) => {
      if (!isOnBrand(n)) return false;
      if (lane !== "all" && !allowedLanes.has(n.topic_lane)) return false;
      if (!q) return true;
      const hay =
        `${n.ai_title || ""} ${n.title || ""} ${n.ai_summary || ""} ${n.raw_excerpt || ""} ${sourceName(n)}`.toLowerCase();
      return hay.includes(q);
    });
  }, [allItems, query, lane]);

  const featured = !query && lane === "all" ? filtered[0] : undefined;
  const rest = featured ? filtered.slice(1) : filtered;

  return (
    <div className="public-site min-h-screen" style={{ background: "#07070E", color: "#fff" }}>
      <PageHead
        title="Latest News | Brian Hanson"
        description="Global AI, marketing, and sales news — curated and summarized daily."
        url="https://brianhanson.com/news"
        type="website"
      />
      <CustomCursor />
      <Nav />

      <header className="pt-32 pb-10 px-6 lg:px-14 mx-auto" style={{ maxWidth: 1440 }}>
        <Link
          to="/"
          className="inline-flex items-center gap-2 font-body uppercase mb-10 transition-colors duration-200"
          style={{ fontSize: 12, letterSpacing: "0.18em", color: "rgba(255,255,255,0.75)" }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "#D4AF55")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "rgba(255,255,255,0.75)")}
        >
          <ArrowLeft size={14} />
          Back to Home
        </Link>
        <h1
          className="font-display italic"
          style={{ fontSize: "clamp(2.5rem, 6vw, 4.5rem)", lineHeight: 1.1, color: "#fff" }}
        >
          Latest News
        </h1>
        <p
          className="font-body mt-4"
          style={{ fontSize: 17, color: "rgba(255,255,255,0.85)", maxWidth: 640, lineHeight: 1.6 }}
        >
          A daily signal feed of global AI, marketing, and sales news — curated and summarized in one place.
        </p>
      </header>

      <main id="main-content" className="px-6 lg:px-14 pb-24 mx-auto" style={{ maxWidth: 1440 }}>
        <div className="flex flex-col lg:flex-row lg:items-center gap-4 mb-10">
          <div className="relative flex-1 max-w-xl">
            <Search
              size={16}
              style={{
                position: "absolute",
                left: 14,
                top: "50%",
                transform: "translateY(-50%)",
                color: "rgba(255,255,255,0.5)",
              }}
            />
            <input
              type="search"
              placeholder="Search news…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full font-body"
              style={{
                background: "#14141b",
                border: "1px solid rgba(255,255,255,0.08)",
                color: "#fff",
                padding: "12px 14px 12px 42px",
                fontSize: 15,
                outline: "none",
              }}
              onFocus={(e) => (e.currentTarget.style.borderColor = "rgba(212,175,85,0.5)")}
              onBlur={(e) => (e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)")}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {BUCKETS.map((l) => {
              const active = lane === l.value;
              return (
                <button
                  key={l.value}
                  onClick={() => setLane(l.value)}
                  className="font-body uppercase transition-colors"
                  style={{
                    fontSize: 11,
                    letterSpacing: "0.15em",
                    padding: "8px 14px",
                    border: `1px solid ${active ? "#D4AF55" : "rgba(255,255,255,0.12)"}`,
                    background: active ? "rgba(212,175,85,0.1)" : "transparent",
                    color: active ? "#D4AF55" : "rgba(255,255,255,0.75)",
                    cursor: "pointer",
                  }}
                >
                  {l.label}
                </button>
              );
            })}
          </div>
        </div>

        {isLoading && (
          <div className="flex flex-col" style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}>
            {Array.from({ length: 5 }).map((_, i) => (
              <NewsCardSkeleton key={i} />
            ))}
          </div>
        )}
        {isError && (
          <p className="font-body" style={{ color: "rgba(255,255,255,0.75)", fontSize: 15 }}>
            Failed to load news. Please refresh the page.
          </p>
        )}
        {!isLoading && !isError && filtered.length === 0 && (
          <p className="font-body" style={{ color: "rgba(255,255,255,0.75)", fontSize: 15 }}>
            {query || lane !== "all"
              ? "No news matches your search."
              : "No AI, Marketing, or Sales news is available at the moment."}
          </p>
        )}

        {featured && (
          <Link
            to={`/news/${featured.id}`}
            className="group grid gap-8 mb-16"
            style={{ gridTemplateColumns: "1fr", textDecoration: "none" }}
          >
            <div className="grid gap-8" style={{ gridTemplateColumns: "minmax(0, 1.4fr) minmax(0, 1fr)" }}>
              <div style={{ aspectRatio: "16 / 10", overflow: "hidden", background: "#0a0a14" }}>
                {featured.image_url ? (
                  <NewsImage
                    src={featured.image_url}
                    alt={featured.ai_title || featured.title || "News"}
                    fallbackTitle={featured.ai_title || featured.title || sourceName(featured)}
                    fallbackLabel={laneLabel(featured.topic_lane)}
                  />
                ) : (
                  <TypographicCover
                    title={featured.ai_title || featured.title || sourceName(featured)}
                    label={laneLabel(featured.topic_lane)}
                  />
                )}
              </div>
              <div className="flex flex-col justify-center">
                <span
                  className="font-body uppercase mb-3"
                  style={{ fontSize: 11, letterSpacing: "0.2em", color: "#D4AF55" }}
                >
                  Featured · {laneLabel(featured.topic_lane)}
                </span>
                <h2
                  className="font-display italic mb-4 transition-colors duration-300 group-hover:text-[#D4AF55]"
                  style={{ fontSize: "clamp(28px, 3.5vw, 44px)", lineHeight: 1.15, color: "#fff" }}
                >
                  {featured.ai_title || featured.title}
                </h2>
                {(featured.ai_summary || featured.raw_excerpt) && (
                  <p
                    className="font-body mb-4"
                    style={{
                      fontSize: 16,
                      color: "rgba(255,255,255,0.8)",
                      lineHeight: 1.6,
                      display: "-webkit-box",
                      WebkitLineClamp: 3,
                      WebkitBoxOrient: "vertical",
                      overflow: "hidden",
                    }}
                  >
                    {featured.ai_summary || featured.raw_excerpt}
                  </p>
                )}
                <div
                  className="flex items-center gap-3 flex-wrap font-body"
                  style={{ fontSize: 12, color: "rgba(255,255,255,0.6)" }}
                >
                  <span style={{ color: "rgba(255,255,255,0.85)" }}>{sourceName(featured)}</span>
                  <span style={{ opacity: 0.5 }}>•</span>
                  <span className="flex items-center gap-1">
                    <Clock size={11} />
                    {featured.published_at
                      ? new Date(featured.published_at).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })
                      : "Recent"}
                  </span>
                </div>
              </div>
            </div>
          </Link>
        )}

        <div className="flex flex-col" style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}>
          {rest.map((n: any) => (
            <Link
              key={n.id}
              to={`/news/${n.id}`}
              className="group grid gap-6 py-6 md:py-8"
              style={{
                gridTemplateColumns: "minmax(120px, 220px) 1fr",
                borderBottom: "1px solid rgba(255,255,255,0.08)",
                textDecoration: "none",
                transition: "background-color 0.25s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.02)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "transparent";
              }}
            >
              <div style={{ aspectRatio: "4 / 3", overflow: "hidden", background: "#0a0a14" }}>
                {n.image_url ? (
                  <NewsImage
                    src={n.image_url}
                    alt={n.ai_title || n.title || "News"}
                    fallbackTitle={n.ai_title || n.title || sourceName(n)}
                    fallbackLabel={laneLabel(n.topic_lane)}
                  />
                ) : (
                  <TypographicCover title={n.ai_title || n.title || sourceName(n)} label={laneLabel(n.topic_lane)} />
                )}
              </div>
              <div className="flex flex-col justify-center">
                <span
                  className="font-body uppercase mb-2"
                  style={{ fontSize: 11, letterSpacing: "0.18em", color: "#D4AF55" }}
                >
                  {laneLabel(n.topic_lane)}
                </span>
                <h3
                  className="font-display italic mb-2 transition-colors duration-300 group-hover:text-[#D4AF55]"
                  style={{ fontSize: "clamp(18px, 2.2vw, 24px)", lineHeight: 1.25, color: "#fff" }}
                >
                  {n.ai_title || n.title}
                </h3>
                {(n.ai_summary || n.raw_excerpt) && (
                  <p
                    className="font-body mb-3"
                    style={{
                      fontSize: 15,
                      color: "rgba(255,255,255,0.75)",
                      lineHeight: 1.55,
                      display: "-webkit-box",
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: "vertical",
                      overflow: "hidden",
                    }}
                  >
                    {n.ai_summary || n.raw_excerpt}
                  </p>
                )}
                <div
                  className="flex items-center gap-3 flex-wrap font-body"
                  style={{ fontSize: 12, color: "rgba(255,255,255,0.6)" }}
                >
                  <span style={{ color: "rgba(255,255,255,0.85)" }}>{sourceName(n)}</span>
                  <span style={{ opacity: 0.5 }}>•</span>
                  <span className="flex items-center gap-1">
                    <Clock size={11} />
                    {n.published_at
                      ? new Date(n.published_at).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })
                      : "Recent"}
                  </span>
                </div>
              </div>
            </Link>
          ))}

          {isFetchingNextPage &&
            Array.from({ length: 3 }).map((_, i) => <NewsCardSkeleton key={`sk-${i}`} />)}
        </div>

        {/* Sentinel */}
        <div ref={sentinelRef} style={{ height: 1 }} aria-hidden="true" />

        {!hasNextPage && !isLoading && filtered.length > 0 && (
          <p
            className="text-center font-body uppercase mt-10"
            style={{ fontSize: 11, letterSpacing: "0.2em", color: "rgba(255,255,255,0.4)" }}
          >
            — No more news —
          </p>
        )}
      </main>
      <Footer />
    </div>
  );
};

export default News;
