import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Plus, FileText, Eye, Pencil, Clock, AlertTriangle, RefreshCw, Loader2 } from "lucide-react";

const Dashboard = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);

  const { data: postStats } = useQuery({
    queryKey: ["admin-post-stats"],
    queryFn: async () => {
      const [all, published, drafts, scheduled] = await Promise.all([
        supabase.from("posts").select("*", { count: "exact", head: true }),
        supabase.from("posts").select("*", { count: "exact", head: true }).eq("status", "published"),
        supabase.from("posts").select("*", { count: "exact", head: true }).eq("status", "draft"),
        supabase.from("posts").select("*", { count: "exact", head: true }).eq("status", "scheduled"),
      ]);
      return { total: all.count ?? 0, published: published.count ?? 0, drafts: drafts.count ?? 0, scheduled: scheduled.count ?? 0 };
    },
  });

  const { data: recentPosts } = useQuery({
    queryKey: ["admin-recent-posts"],
    queryFn: async () => {
      const { data } = await supabase
        .from("posts")
        .select("id, title, slug, status, created_at, updated_at")
        .order("created_at", { ascending: false })
        .limit(5);
      return data ?? [];
    },
  });

  const stats = [
    { label: "Total Posts", value: postStats?.total ?? 0, icon: FileText, color: "#d4a843" },
    { label: "Published", value: postStats?.published ?? 0, icon: Eye, color: "#4ade80" },
    { label: "Drafts", value: postStats?.drafts ?? 0, icon: Pencil, color: "#facc15" },
    { label: "Scheduled", value: postStats?.scheduled ?? 0, icon: Clock, color: "#60a5fa" },
  ];

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4" style={{ marginBottom: 32 }}>
        <div>
          <h1 className="font-body" style={{ fontSize: 28, fontWeight: 700, color: "hsl(var(--admin-text))" }}>
            Dashboard
          </h1>
          <p className="font-body" style={{ fontSize: 14, color: "hsl(var(--admin-text-soft))", marginTop: 4 }}>
            Welcome to your blog admin panel
          </p>
        </div>
        <Link
          to="/admin/posts/new"
          className="admin-btn-primary"
          style={{
            background: "transparent",
            border: "1px solid hsl(var(--admin-border-hover))",
            color: "hsl(var(--admin-text))",
            fontWeight: 500,
            fontSize: 13,
            letterSpacing: "0.02em",
            textTransform: "none",
            padding: "10px 20px",
            borderRadius: 6,
          }}
        >
          <Plus size={16} /> New Post
        </Link>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4" style={{ gap: 16, marginBottom: 32 }}>
        {stats.map((s) => (
          <div
            key={s.label}
            className="admin-card"
            style={{ padding: "20px 20px" }}
          >
            <div className="flex items-center justify-between" style={{ marginBottom: 16 }}>
              <span className="font-body" style={{ fontSize: 13, color: "hsl(var(--admin-text-soft))" }}>
                {s.label}
              </span>
              <s.icon size={18} style={{ color: s.color }} strokeWidth={1.5} />
            </div>
            <span className="font-body block" style={{ fontSize: 32, fontWeight: 700, color: "hsl(var(--admin-text))" }}>
              {s.value}
            </span>
          </div>
        ))}
      </div>

      {/* Recent posts */}
      <div className="admin-card" style={{ overflow: "hidden" }}>
        <div
          className="flex items-center justify-between"
          style={{
            padding: "18px 24px",
            borderBottom: "1px solid hsl(var(--admin-border))",
          }}
        >
          <span className="font-body" style={{ fontSize: 16, fontWeight: 700, color: "hsl(var(--admin-text))" }}>
            Recent Posts
          </span>
          <Link
            to="/admin/posts"
            className="font-body"
            style={{ fontSize: 13, color: "hsl(var(--admin-text-soft))", textDecoration: "none", fontWeight: 500 }}
          >
            View All
          </Link>
        </div>

        {recentPosts?.length === 0 && (
          <div style={{ padding: "40px 24px", textAlign: "center" }}>
            <p className="font-body" style={{ fontSize: 13, color: "hsl(var(--admin-text-ghost))" }}>
              No posts yet. Create your first one!
            </p>
          </div>
        )}

        {recentPosts?.map((post) => (
          <div
            key={post.id}
            className="flex items-center justify-between"
            style={{
              padding: "16px 24px",
              borderBottom: "1px solid hsl(var(--admin-border))",
              transition: "background-color 0.15s",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "hsl(var(--admin-surface-2))")}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
          >
            <div className="min-w-0 flex-1">
              <span className="font-body block truncate" style={{ fontSize: 14, fontWeight: 500, color: "hsl(var(--admin-text))" }}>
                {post.title}
              </span>
              <span className="font-body" style={{ fontSize: 12, color: "hsl(var(--admin-text-ghost))" }}>
                Updated {new Date(post.updated_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
              </span>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <span
                className="font-body"
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  padding: "4px 12px",
                  borderRadius: 4,
                  background: post.status === "published" ? "rgba(74, 222, 128, 0.12)" : "rgba(250, 204, 21, 0.12)",
                  color: post.status === "published" ? "#4ade80" : "#facc15",
                }}
              >
                {post.status}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Dashboard;
