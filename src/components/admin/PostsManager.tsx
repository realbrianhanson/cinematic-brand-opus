import { useState, useEffect, useMemo, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "@/lib/router-compat";
import { supabase } from "@/integrations/supabase/client";
import { Plus, Trash2, Pencil, Search, Send } from "lucide-react";
import { toast } from "sonner";

const PostsManager = () => {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");

  // Realtime subscription for posts (debounced to prevent infinite refetch loops)
  useEffect(() => {
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    const channel = supabase
      .channel(`admin-posts-realtime-${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "posts" },
        () => {
          if (debounceTimer) clearTimeout(debounceTimer);
          debounceTimer = setTimeout(() => {
            qc.invalidateQueries({ queryKey: ["admin-posts"] });
          }, 2000);
        }
      )
      .subscribe();

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      supabase.removeChannel(channel);
    };
  }, [qc]);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [confirmPublishAll, setConfirmPublishAll] = useState(false);

  const { data: posts, isLoading } = useQuery({
    queryKey: ["admin-posts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("posts")
        .select("*, categories(name)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from("seo_metadata").delete().eq("post_id", id);
      const { error } = await supabase.from("posts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-posts"] });
      setDeleteId(null);
    },
  });
  const publishAllMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase
        .from("posts")
        .update({
          status: "published",
          scheduled_at: null,
          publish_override: true,
          publish_override_reason: "Bulk publish all drafts from admin UI",
          published_at: new Date().toISOString(),
        } as never)
        .eq("status", "draft")
        .select("id");
      if (error) throw error;
      return data?.length ?? 0;
    },
    onSuccess: (count) => {
      toast.success(`Published ${count} draft${count === 1 ? "" : "s"}`);
      qc.invalidateQueries({ queryKey: ["admin-posts"] });
      setConfirmPublishAll(false);
    },
    onError: (e: any) => {
      toast.error(e?.message || "Failed to publish drafts");
    },
  });

  const draftCount = useMemo(
    () => posts?.filter((p) => p.status === "draft").length ?? 0,
    [posts]
  );


  const filtered = useMemo(
    () => posts?.filter((p) => p.title.toLowerCase().includes(search.toLowerCase())) ?? [],
    [posts, search]
  );

  const handleDelete = useCallback((id: string) => setDeleteId(id), []);
  const handleCancelDelete = useCallback(() => setDeleteId(null), []);

  return (
    <div>
      <div className="flex items-center justify-between flex-wrap gap-4" style={{ marginBottom: 24 }}>
        <h1 className="font-heading italic" style={{ fontSize: 28, fontWeight: 400 }}>Posts</h1>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setConfirmPublishAll(true)}
            disabled={draftCount === 0}
            className="admin-btn-ghost"
            style={{ opacity: draftCount === 0 ? 0.4 : 1, display: "flex", alignItems: "center", gap: 6 }}
          >
            <Send size={14} /> Publish all drafts {draftCount > 0 && `(${draftCount})`}
          </button>
          <Link to="/admin/posts/new" className="admin-btn-primary">
            <Plus size={14} /> New Post
          </Link>
        </div>
      </div>

      {/* Search */}
      <div className="relative" style={{ marginBottom: 20 }}>
        <Search
          size={14}
          style={{
            position: "absolute",
            left: 14,
            top: "50%",
            transform: "translateY(-50%)",
            color: "hsl(var(--admin-text-ghost))",
          }}
        />
        <input
          placeholder="Search posts..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="admin-input font-body w-full"
          style={{ paddingLeft: 36 }}
        />
      </div>

      {/* Table */}
      <div className="admin-card" style={{ overflow: "hidden" }}>
        <div
          className="hidden md:grid"
          style={{
            gridTemplateColumns: "1fr 140px 100px 110px 80px",
            padding: "12px 24px",
            borderBottom: "1px solid hsl(var(--admin-border))",
            backgroundColor: "hsl(var(--admin-surface-2))",
          }}
        >
          {["Title", "Category", "Status", "Date", "Actions"].map((h) => (
            <span key={h} className="admin-label" style={{ marginBottom: 0 }}>{h}</span>
          ))}
        </div>

        {isLoading && (
          <div style={{ padding: 32, textAlign: "center" }}>
            <span className="font-body" style={{ color: "hsl(var(--admin-text-ghost))" }}>
              Loading...
            </span>
          </div>
        )}

        {filtered.map((post) => (
          <div
            key={post.id}
            className="md:grid flex flex-col"
            style={{
              gridTemplateColumns: "1fr 140px 100px 110px 80px",
              padding: "14px 24px",
              borderBottom: "1px solid hsl(var(--admin-border))",
              alignItems: "center",
              transition: "background-color 0.15s",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "hsl(var(--admin-surface-2))")}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
          >
            <span className="font-body truncate" style={{ fontSize: 14, fontWeight: 500 }}>
              {post.title}
            </span>
            <span className="font-body" style={{ fontSize: 12, color: "hsl(var(--admin-text-soft))" }}>
              {(post as any).categories?.name || "—"}
            </span>
            <span className={`admin-badge w-fit ${post.status === "published" ? "admin-badge-published" : "admin-badge-draft"}`}>
              {post.status}
            </span>
            <span className="font-body" style={{ fontSize: 11, color: "hsl(var(--admin-text-ghost))" }}>
              {new Date(post.created_at).toLocaleDateString()}
            </span>
            <div className="flex items-center gap-3">
              <Link to={`/admin/posts/${post.id}/edit`} style={{ color: "hsl(var(--admin-accent))" }}>
                <Pencil size={14} />
              </Link>
              <button
                onClick={() => setDeleteId(post.id)}
                style={{
                  color: "hsl(var(--admin-danger))",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                }}
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        ))}

        {filtered.length === 0 && !isLoading && (
          <div style={{ padding: 32, textAlign: "center" }}>
            <p className="font-body" style={{ fontSize: 13, color: "hsl(var(--admin-text-ghost))" }}>
              No posts found.
            </p>
          </div>
        )}
      </div>

      {/* Delete confirmation */}
      {deleteId && (
        <div
          className="fixed inset-0 flex items-center justify-center z-50"
          style={{ backgroundColor: "rgba(0,0,0,0.6)" }}
        >
          <div
            className="admin-card"
            style={{ padding: 32, maxWidth: 380, width: "90%" }}
          >
            <p className="font-body" style={{ fontSize: 15, marginBottom: 20 }}>
              Delete this post? This cannot be undone.
            </p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setDeleteId(null)} className="admin-btn-ghost">
                Cancel
              </button>
              <button
                onClick={() => deleteMutation.mutate(deleteId)}
                className="admin-btn-primary"
                style={{ background: "hsl(var(--admin-danger))" }}
              >
                {deleteMutation.isPending ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Publish-all confirmation */}
      {confirmPublishAll && (
        <div
          className="fixed inset-0 flex items-center justify-center z-50"
          style={{ backgroundColor: "rgba(0,0,0,0.6)" }}
        >
          <div className="admin-card" style={{ padding: 32, maxWidth: 440, width: "90%" }}>
            <h2 className="font-heading italic" style={{ fontSize: 20, marginBottom: 12 }}>
              Publish {draftCount} draft{draftCount === 1 ? "" : "s"}?
            </h2>
            <p className="font-body" style={{ fontSize: 14, marginBottom: 20, color: "hsl(var(--admin-text-soft))" }}>
              This bypasses quality, lint, and fact-check gates via publish override.
              Each post will go live immediately.
            </p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setConfirmPublishAll(false)} className="admin-btn-ghost">
                Cancel
              </button>
              <button
                onClick={() => publishAllMutation.mutate()}
                className="admin-btn-primary"
                disabled={publishAllMutation.isPending}
              >
                {publishAllMutation.isPending ? "Publishing..." : `Publish ${draftCount}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PostsManager;
