import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const SidebarPopularPosts = ({ config }: { config: any }) => {
  const count = config.count || 5;
  const { data: posts } = useQuery({
    queryKey: ["widget-popular-posts", count],
    queryFn: async () => {
      const { data } = await supabase
        .from("posts")
        .select("id, title, slug, created_at")
        .eq("status", "published")
        .order("created_at", { ascending: false })
        .limit(count);
      return data || [];
    },
    staleTime: 60000,
  });

  if (!posts?.length) return null;

  return (
    <div style={{ padding: 24, border: "1px solid rgba(255,255,255,0.06)" }}>
      <h3 className="font-body uppercase mb-4" style={{ fontSize: 10, letterSpacing: "0.15em", color: "hsl(var(--accent))", fontWeight: 700 }}>
        Popular Posts
      </h3>
      <div className="flex flex-col gap-3">
        {posts.map((post) => (
          <a key={post.id} href={`/blog/${post.slug}`} className="font-body block transition-colors" style={{ fontSize: 13, color: "rgba(255,255,255,0.6)", textDecoration: "none" }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "hsl(var(--accent))")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "rgba(255,255,255,0.6)")}
          >
            {post.title}
          </a>
        ))}
      </div>
    </div>
  );
};

export default SidebarPopularPosts;
