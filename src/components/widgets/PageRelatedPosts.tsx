import type { WidgetConfig, WidgetPageContext } from "@/lib/widgetConfig";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const PageRelatedPosts = ({
  config,
  pageContext,
}: {
  config: WidgetConfig;
  pageContext?: WidgetPageContext;
}) => {
  const count = config.count || 3;
  const { data: posts } = useQuery({
    queryKey: [
      "widget-related-posts",
      pageContext?.postId,
      pageContext?.categoryId,
      count,
    ],
    queryFn: async () => {
      let query = supabase
        .from("posts")
        .select("id, title, slug, excerpt, featured_image")
        .eq("status", "published");
      if (pageContext?.postId) query = query.neq("id", pageContext.postId);
      if (pageContext?.categoryId)
        query = query.eq("category_id", pageContext.categoryId);
      const { data } = await query
        .order("created_at", { ascending: false })
        .limit(count);
      return data || [];
    },
    staleTime: 60000,
  });

  if (!posts?.length) return null;

  return (
    <section aria-labelledby="related-posts-heading">
      <h2
        id="related-posts-heading"
        className="mb-6 font-display text-title text-white"
      >
        {config.title || "Keep reading"}
      </h2>
      <div className="grid md:grid-cols-3 gap-4">
        {posts.map((post) => (
          <a
            key={post.id}
            href={`/blog/${post.slug}`}
            className="group block"
            style={{
              border: "1px solid rgba(255,255,255,0.06)",
              textDecoration: "none",
              transition: "border-color 0.3s",
            }}
            onMouseEnter={(e) =>
              (e.currentTarget.style.borderColor =
                "rgba(var(--brand-accent-rgb),0.25)")
            }
            onMouseLeave={(e) =>
              (e.currentTarget.style.borderColor = "rgba(255,255,255,0.06)")
            }
          >
            {post.featured_image && (
              <img
                src={post.featured_image}
                alt=""
                style={{ width: "100%", height: 120, objectFit: "cover" }}
                loading="lazy"
              />
            )}
            <div style={{ padding: 16 }}>
              <p className="font-body text-body font-medium leading-snug text-white">
                {post.title}
              </p>
            </div>
          </a>
        ))}
      </div>
    </section>
  );
};

export default PageRelatedPosts;
