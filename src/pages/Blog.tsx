import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { ArrowRight, ArrowLeft, Clock } from "lucide-react";
import PageHead from "@/components/PageHead";
import Footer from "@/components/Footer";
import Nav from "@/components/Nav";
import CustomCursor from "@/components/CustomCursor";

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

  return (
    <div
      className="public-site min-h-screen"
      style={{ background: "#07070E", color: "#fff" }}
    >
      <PageHead title="Blog | Brian Hanson" description="Insights on authority, leadership, and legacy." url="/blog" type="website" />
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
            fontSize: 11,
            letterSpacing: "0.18em",
            color: "rgba(255,255,255,0.4)",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "#D4AF55")}
          onMouseLeave={(e) =>
            (e.currentTarget.style.color = "rgba(255,255,255,0.4)")
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
          Insights & Ideas
        </h1>
        <p
          className="font-body mt-4"
          style={{
            fontSize: 16,
            color: "rgba(255,255,255,0.4)",
            maxWidth: 520,
          }}
        >
          Thoughts on AI, marketing, and building businesses that matter.
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
            style={{ color: "rgba(255,255,255,0.3)", fontSize: 14 }}
          >
            Loading...
          </p>
        )}

        {isError && !isLoading && (
          <p
            className="font-body"
            style={{ color: "rgba(255,255,255,0.3)", fontSize: 14 }}
          >
            Failed to load posts. Please refresh the page.
          </p>
        )}

        {!isLoading && !isError && posts?.length === 0 && (
          <p
            className="font-body"
            style={{ color: "rgba(255,255,255,0.3)", fontSize: 14 }}
          >
            No posts published yet. Check back soon.
          </p>
        )}

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
          {posts?.map((post) => (
            <Link
              to={`/blog/${post.slug}`}
              key={post.id}
              className="group block"
              style={{
                border: "1px solid rgba(255,255,255,0.06)",
                transition: "border-color 0.3s, transform 0.3s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = "rgba(212,175,85,0.25)";
                e.currentTarget.style.transform = "translateY(-4px)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = "rgba(255,255,255,0.06)";
                e.currentTarget.style.transform = "translateY(0)";
              }}
            >
              {post.featured_image && (
                <div
                  style={{
                    height: 200,
                    overflow: "hidden",
                    background: "#0a0a14",
                  }}
                >
                  <img
                    src={post.featured_image}
                    alt={post.title}
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                    loading="lazy"
                  />
                </div>
              )}
              <div className="p-6">
                <div className="flex items-center gap-3 mb-4">
                  {(post as any).categories?.name && (
                    <span
                      className="font-body uppercase"
                      style={{
                        fontSize: 9,
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
                      fontSize: 10,
                      color: "rgba(255,255,255,0.25)",
                    }}
                  >
                    <Clock size={10} />
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
                      fontSize: 13,
                      color: "rgba(255,255,255,0.35)",
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
                  className="flex items-center gap-1 mt-5 font-body uppercase transition-colors duration-300 group-hover:text-[#D4AF55]"
                  style={{
                    fontSize: 10,
                    letterSpacing: "0.15em",
                    color: "rgba(255,255,255,0.3)",
                  }}
                >
                  Read article <ArrowRight size={12} />
                </div>
              </div>
            </Link>
          ))}
        </div>
      </main>
    </div>
  );
};

export default Blog;
