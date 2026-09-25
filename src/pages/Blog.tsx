import { useSiteConfig } from "@/config/SiteConfigContext";
import { fetchBlogPage } from "@/lib/publicLists";
import { useEffect, useMemo, useRef } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Link } from "@/lib/router-compat";
import { supabase } from "@/integrations/supabase/client";
import { ArrowRight, ArrowLeft, Clock } from "lucide-react";
import Footer from "@/components/Footer";
import Nav from "@/components/Nav";

// Simple hash to pick a stable gradient direction per post
const hashSeed = (s: string) => {
  let h = 0;
  for (let i = 0; i < s.length; i++)
    h = (h * 31 + s.charCodeAt(i)) & 0xffffffff;
  return Math.abs(h);
};

const TypographicCover = ({
  title,
  label,
}: {
  title: string;
  label?: string;
}) => {
  const seed = hashSeed(title);
  const angle = 100 + (seed % 80);
  const initial = (title || "•").trim().charAt(0).toUpperCase();
  return (
    <div
      aria-hidden="true"
      className="relative w-full flex items-end p-6"
      style={{
        height: 200,
        background: `linear-gradient(${angle}deg, var(--brand-accent) 0%, #8B7023 55%, #14141b 100%)`,
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
          color: "rgba(var(--brand-backdrop-rgb),0.35)",
        }}
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
            fontSize: 12,
            letterSpacing: "0.2em",
            color: "rgba(var(--brand-backdrop-rgb),0.85)",
            background: "rgba(255,255,255,0.35)",
            padding: "4px 8px",
            borderRadius: 2,
          }}
        >
          {label}
        </span>
      )}
      <span
        className="font-display italic relative"
        style={{
          fontSize: 22,
          lineHeight: 1.2,
          color: "rgba(var(--brand-backdrop-rgb),0.92)",
          maxWidth: "88%",
          textShadow: "0 1px 0 rgba(255,255,255,0.08)",
        }}
      >
        {title.length > 70 ? title.slice(0, 70) + "…" : title}
      </span>
    </div>
  );
};

const PAGE_SIZE = 12;

const CardSkeleton = () => (
  <div
    className="animate-pulse"
    style={{
      border: "1px solid rgba(255,255,255,0.08)",
      background: "#14141b",
      display: "flex",
      flexDirection: "column",
    }}
  >
    <div style={{ height: 200, background: "rgba(255,255,255,0.04)" }} />
    <div className="p-6 flex flex-col gap-3">
      <div
        style={{ height: 10, width: 90, background: "rgba(255,255,255,0.06)" }}
      />
      <div
        style={{
          height: 22,
          width: "85%",
          background: "rgba(255,255,255,0.08)",
        }}
      />
      <div
        style={{
          height: 14,
          width: "100%",
          background: "rgba(255,255,255,0.05)",
        }}
      />
      <div
        style={{
          height: 14,
          width: "70%",
          background: "rgba(255,255,255,0.05)",
        }}
      />
    </div>
  </div>
);

// Card-only columns — never fetch body_html on the index page.
const CARD_COLUMNS =
  "id, slug, title, excerpt, featured_image, featured_image_alt, reading_time, created_at, categories(name, slug)";

interface BlogProps {
  category?: string;
  /** First page rendered on the server so the list is in the initial HTML. */
  initialPage?: { items: unknown[]; nextPage: number | null } | null;
}

const Blog = ({ initialPage, category = "" }: BlogProps = {}) => {
  const siteConfig = useSiteConfig();
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const {
    data,
    isLoading,
    isError,
    refetch,
    isFetchNextPageError,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ["public-posts-infinite", category],
    initialPageParam: 0,
    queryFn: ({ pageParam }) => fetchBlogPage(supabase, pageParam, category),
    getNextPageParam: (last) => last.nextPage,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    ...(initialPage
      ? {
          initialData: {
            pages: [
              {
                items: initialPage.items as never[],
                nextPage: initialPage.nextPage,
              },
            ],
            pageParams: [0],
          },
          // Treat server data as immediately stale so signed-in admins and
          // fresh publishes still refetch after hydration.
          initialDataUpdatedAt: 0,
        }
      : {}),
  });

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || isError || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasNextPage && !isFetchingNextPage)
          fetchNextPage();
      },
      { rootMargin: "600px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage, isError]);

  const posts = useMemo(() => {
    const seen = new Set<string>();
    const out: Awaited<ReturnType<typeof fetchBlogPage>>["items"] = [];
    for (const p of data?.pages ?? []) {
      for (const it of p.items) {
        if (seen.has(it.id)) continue;
        seen.add(it.id);
        out.push(it);
      }
    }
    return out;
  }, [data]);

  return (
    <div
      className="public-site min-h-screen"
      style={{ background: "var(--brand-backdrop)", color: "#fff" }}
    >
      <Nav />
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
          onMouseEnter={(e) =>
            (e.currentTarget.style.color = "var(--brand-accent)")
          }
          onMouseLeave={(e) =>
            (e.currentTarget.style.color = "rgba(255,255,255,0.75)")
          }
        >
          <ArrowLeft size={14} />
          Back to Home
        </Link>
        <h1
          className="font-display"
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
          {siteConfig.content.blogDescription}
        </p>
      </header>

      {category && (
        <div className="px-6 lg:px-14 pb-6">
          Category: {category} · <Link to="/blog">Show all articles</Link>
        </div>
      )}
      <main
        id="main-content"
        className="px-6 lg:px-14 pb-24 mx-auto"
        style={{ maxWidth: 1440 }}
      >
        {isError && (
          <p
            role="alert"
            className="font-body"
            style={{ color: "rgba(255,255,255,0.75)", fontSize: 15 }}
          >
            {posts.length
              ? "More articles could not be loaded."
              : "Articles could not be loaded."}{" "}
            <button
              type="button"
              className="underline underline-offset-4"
              onClick={() =>
                void (isFetchNextPageError ? fetchNextPage() : refetch())
              }
            >
              Try again
            </button>
          </p>
        )}
        {!isLoading && !isError && posts.length === 0 && (
          <p
            className="font-body"
            style={{ color: "rgba(255,255,255,0.75)", fontSize: 15 }}
          >
            No posts published yet. Check back soon
          </p>
        )}

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
          {isLoading &&
            Array.from({ length: 6 }).map((_, i) => (
              <CardSkeleton key={`sk-${i}`} />
            ))}

          {posts.map((post, idx) => (
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
                e.currentTarget.style.borderColor =
                  "rgba(var(--brand-accent-rgb),0.35)";
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
                    alt={post.featured_image_alt || post.title}
                    width={640}
                    height={360}
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                    loading={idx < 3 ? "eager" : "lazy"}
                    decoding="async"
                    fetchPriority={idx === 0 ? "high" : "auto"}
                  />
                </div>
              ) : (
                <TypographicCover title={post.title} />
              )}
              <div className="p-6 flex flex-col flex-1">
                <div className="flex items-center gap-3 mb-4">
                  {post.categories?.name && (
                    <span
                      className="font-body uppercase"
                      style={{
                        fontSize: 12,
                        letterSpacing: "0.15em",
                        color: "var(--brand-accent)",
                      }}
                    >
                      {post.categories.name}
                    </span>
                  )}
                  <span
                    className="font-body flex items-center gap-1"
                    style={{ fontSize: 12, color: "rgba(255,255,255,0.7)" }}
                  >
                    <Clock size={11} />
                    {post.reading_time ?? 1} min
                  </span>
                </div>
                <h2
                  className="font-display mb-3 transition-colors duration-300 group-hover:text-[var(--brand-accent)]"
                  style={{ fontSize: 22, lineHeight: 1.3, color: "#fff" }}
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
                  className="flex items-center gap-1 mt-auto pt-5 font-body uppercase transition-colors duration-300 group-hover:text-[var(--brand-accent)]"
                  style={{
                    fontSize: 12,
                    letterSpacing: "0.15em",
                    color: "rgba(255,255,255,0.75)",
                  }}
                >
                  Read article <ArrowRight size={12} />
                </div>
              </div>
            </Link>
          ))}

          {isFetchingNextPage &&
            Array.from({ length: 3 }).map((_, i) => (
              <CardSkeleton key={`sk-more-${i}`} />
            ))}
        </div>

        {hasNextPage && !isLoading && (
          <div className="mt-8 text-center">
            <button
              type="button"
              className="public-secondary-action"
              disabled={isFetchingNextPage}
              onClick={() => void fetchNextPage()}
            >
              {isFetchingNextPage ? "Loading more…" : "Load more articles"}
            </button>
          </div>
        )}
        <div ref={sentinelRef} style={{ height: 1 }} aria-hidden="true" />

        {!hasNextPage && !isLoading && posts.length > 0 && (
          <p
            className="text-center font-body uppercase mt-12"
            style={{
              fontSize: 12,
              letterSpacing: "0.2em",
              color: "rgba(255,255,255,0.7)",
            }}
          >
            — End of articles —
          </p>
        )}
      </main>

      <Footer />
    </div>
  );
};

export default Blog;
