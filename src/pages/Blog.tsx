import { useSiteConfig } from "@/config/SiteConfigContext";
import { fetchBlogPage } from "@/lib/publicLists";
import { useQuery } from "@tanstack/react-query";
import { blogArchivePath } from "../../supabase/functions/_shared/blogPagination";
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

interface BlogProps {
  category?: string;
  page?: number;
  /** The requested archive page is rendered on the server. */
  initialPage?: { items: unknown[]; nextPage: number | null } | null;
}

const Blog = ({ initialPage, category = "", page = 1 }: BlogProps = {}) => {
  const siteConfig = useSiteConfig();
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["public-posts-page", category, page],
    queryFn: () => fetchBlogPage(supabase, page - 1, category),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    ...(initialPage
      ? {
          initialData: initialPage as Awaited<ReturnType<typeof fetchBlogPage>>,
          initialDataUpdatedAt: 0,
        }
      : {}),
  });
  const posts = data?.items ?? [];
  const hasNextPage = data?.nextPage != null;

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
              ? "These articles could not be refreshed."
              : "Articles could not be loaded."}{" "}
            <button
              type="button"
              className="underline underline-offset-4"
              onClick={() => void refetch()}
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
        </div>

        {(page > 1 || hasNextPage) && (
          <nav
            aria-label="Article pages"
            className="mt-10 flex flex-wrap items-center justify-center gap-4"
          >
            {page > 1 && (
              <a
                href={blogArchivePath(page - 1, category)}
                rel="prev"
                className="public-secondary-action min-h-12"
              >
                {" "}
                <ArrowLeft size={16} aria-hidden="true" /> Previous articles
              </a>
            )}
            <span aria-current="page" className="px-3 text-sm text-white/75">
              Page {page}
            </span>
            {hasNextPage && (
              <a
                href={blogArchivePath(page + 1, category)}
                rel="next"
                className="public-secondary-action min-h-12"
              >
                Next articles <ArrowRight size={16} aria-hidden="true" />
              </a>
            )}
          </nav>
        )}

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
