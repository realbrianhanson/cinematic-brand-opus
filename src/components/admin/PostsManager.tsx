import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useSearchParams } from "@/lib/router-compat";
import { supabase } from "@/integrations/supabase/client";
import { Plus, Search } from "lucide-react";
import { toast } from "sonner";
import QueryNotice from "./QueryNotice";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogCancel,
  AlertDialogAction,
  AlertDialogFooter,
} from "@/components/ui/alert-dialog";
const SIZE = 25;
const statuses = ["all", "draft", "scheduled", "published"] as const;
type Status = (typeof statuses)[number];
export default function PostsManager() {
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const status: Status = statuses.includes(params.get("status") as Status)
    ? (params.get("status") as Status)
    : "all";
  const [search, setSearch] = useState("");
  const [term, setTerm] = useState("");
  const [category, setCategory] = useState("");
  const [from, setFrom] = useState("");
  const [sort, setSort] = useState("updated_at");
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmation, setConfirmation] = useState<"publish" | string | null>(
    null,
  );
  useEffect(() => {
    const timer = setTimeout(() => {
      setTerm(search.trim());
      setPage(0);
    }, 250);
    return () => clearTimeout(timer);
  }, [search]);
  useEffect(() => {
    setPage(0);
    setSelected(new Set());
  }, [status, category, from, sort, term]);
  const posts = useQuery({
    queryKey: ["admin-posts", status, category, from, sort, term, page],
    refetchOnWindowFocus: true,
    queryFn: async () => {
      let query = supabase
        .from("posts")
        .select("id,title,slug,status,created_at,updated_at,categories(name)", {
          count: "exact",
        });
      if (status !== "all") query = query.eq("status", status);
      if (category) query = query.eq("category_id", category);
      if (from) query = query.gte("created_at", `${from}T00:00:00Z`);
      if (term)
        query = query.ilike("title", `%${term.replace(/[\\%_]/g, "\\$&")}%`);
      const { data, error, count } = await query
        .order(sort, { ascending: sort === "title" })
        .order("id")
        .range(page * SIZE, (page + 1) * SIZE - 1);
      if (error) throw error;
      return { items: data ?? [], total: count ?? 0 };
    },
  });
  const categories = useQuery({
    queryKey: ["admin-categories-list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("categories")
        .select("id,name")
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });
  const mutation = useMutation({
    mutationFn: async (action: string) => {
      if (action !== "publish") {
        const { error } = await supabase
          .from("posts")
          .delete()
          .eq("id", action);
        if (error) throw error;
        return "Post deleted.";
      }
      const candidates =
        posts.data?.items.filter(
          (p) => selected.has(p.id) && p.status === "draft",
        ) ?? [];
      if (!candidates.length)
        throw new Error("Select drafts from the current page.");
      let published = 0,
        blocked = 0;
      for (const post of candidates) {
        const { data, error } = await supabase.functions.invoke(
          "manual-publish",
          { body: { post_id: post.id } },
        );
        if (error || data?.ok !== true || data?.decision === "blocked")
          blocked++;
        else published++;
      }
      return `${published} published. ${blocked} need review; open the editor for details. Publishing checks were preserved.`;
    },
    onSuccess: (message) => {
      toast.success(message);
      setConfirmation(null);
      setSelected(new Set());
      qc.invalidateQueries({ queryKey: ["admin-posts"] });
    },
    onError: (error) => toast.error(error.message),
  });
  const items = posts.data?.items ?? [];
  const drafts = items.filter(
    (p) => p.status === "draft" && selected.has(p.id),
  );
  const pages = Math.max(1, Math.ceil((posts.data?.total ?? 0) / SIZE));
  useEffect(() => {
    if (posts.data && page >= pages) setPage(pages - 1);
  }, [posts.data, page, pages]);
  return (
    <div className="admin-page-stack">
      <header className="admin-page-header">
        <div>
          <p className="admin-eyebrow">Content library</p>
          <h1>Articles</h1>
          <p>Find, review, and publish your work.</p>
        </div>
        <Link className="admin-btn-primary" to="/admin/posts/new">
          <Plus size={16} /> New Post
        </Link>
      </header>
      <div className="admin-tabs" aria-label="Filter articles by status">
        {statuses.map((s) => (
          <button
            key={s}
            className="admin-btn-ghost capitalize"
            aria-pressed={status === s}
            onClick={() => setParams(s === "all" ? {} : { status: s })}
          >
            {s}
          </button>
        ))}
      </div>
      <div className="admin-filters">
        <label className="flex-1">
          <span className="sr-only">Search articles</span>
          <div className="flex items-center gap-2">
            <Search size={16} />
            <input
              className="admin-input w-full"
              placeholder="Search articles…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </label>
        <select
          aria-label="Category"
          className="admin-input"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        >
          <option value="">All categories</option>
          {categories.data?.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <label className="admin-help">
          Created since{" "}
          <input
            aria-label="Created since"
            className="admin-input"
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
        <select
          aria-label="Sort articles"
          className="admin-input"
          value={sort}
          onChange={(e) => setSort(e.target.value)}
        >
          <option value="updated_at">Recently updated</option>
          <option value="created_at">Newest first</option>
          <option value="title">Title A–Z</option>
        </select>
      </div>
      <QueryNotice
        error={categories.error}
        retry={() => categories.refetch()}
      />
      <QueryNotice
        loading={posts.isPending}
        error={posts.error}
        retry={() => posts.refetch()}
      />
      {drafts.length > 0 && (
        <div className="admin-notice">
          <span>{drafts.length} drafts selected on this page.</span>
          <button
            className="admin-btn-primary"
            disabled={mutation.isPending}
            onClick={() => setConfirmation("publish")}
          >
            Review publishing
          </button>
          <button
            className="admin-btn-ghost"
            onClick={() => setSelected(new Set())}
          >
            Clear selection
          </button>
        </div>
      )}
      {!posts.error && (
        <section className="admin-card admin-section">
          {items.map((post) => (
            <div key={post.id} className="admin-recent-row">
              {post.status === "draft" && (
                <input
                  type="checkbox"
                  aria-label={`Select ${post.title}`}
                  checked={selected.has(post.id)}
                  onChange={(e) =>
                    setSelected((previous) => {
                      const next = new Set(previous);
                      if (e.target.checked) next.add(post.id);
                      else next.delete(post.id);
                      return next;
                    })
                  }
                />
              )}
              <div className="flex-1">
                <Link
                  to={`/admin/posts/${post.id}/edit`}
                  className="font-medium"
                >
                  {post.title}
                </Link>
                <span>
                  {post.categories?.name ?? "Uncategorized"} · Updated{" "}
                  {new Date(post.updated_at).toLocaleDateString()}
                </span>
              </div>
              <span className="admin-badge">{post.status}</span>
              <div className="flex gap-3">
                <Link
                  to={`/admin/posts/${post.id}/edit`}
                  aria-label={`Edit ${post.title}`}
                >
                  Edit
                </Link>
                {post.status === "published" && (
                  <a
                    href={`/blog/${post.slug}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`View ${post.title}`}
                  >
                    View
                  </a>
                )}
                <button
                  className="text-red-400"
                  aria-label={`Delete ${post.title}`}
                  disabled={mutation.isPending}
                  onClick={() => setConfirmation(post.id)}
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
          {!posts.isPending && !items.length && (
            <p>No articles match these filters.</p>
          )}
          <div className="admin-section-header">
            <span className="admin-help">
              {posts.data?.total ?? 0} articles · Page {page + 1} of {pages}
            </span>
            <div className="flex gap-2">
              <button
                className="admin-btn-ghost"
                disabled={page === 0 || posts.isFetching}
                onClick={() => {
                  setPage((p) => p - 1);
                  setSelected(new Set());
                }}
              >
                Previous
              </button>
              <button
                className="admin-btn-ghost"
                disabled={page + 1 >= pages || posts.isFetching}
                onClick={() => {
                  setPage((p) => p + 1);
                  setSelected(new Set());
                }}
              >
                Next
              </button>
            </div>
          </div>
        </section>
      )}
      <AlertDialog
        open={!!confirmation}
        onOpenChange={(open) => {
          if (!open && !mutation.isPending) setConfirmation(null);
        }}
      >
        <AlertDialogContent className="admin-shell">
          <AlertDialogTitle>
            {confirmation === "publish"
              ? `Publish ${drafts.length} selected drafts?`
              : "Delete this article?"}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {confirmation === "publish"
              ? "Each article will go through the normal publishing checks. Articles that fail remain unpublished."
              : "This permanently removes the article. This action cannot be undone."}
          </AlertDialogDescription>
          <ul className="max-h-48 overflow-auto text-sm">
            {(confirmation === "publish"
              ? drafts
              : items.filter((p) => p.id === confirmation)
            ).map((p) => (
              <li key={p.id}>{p.title}</li>
            ))}
          </ul>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={mutation.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={mutation.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (confirmation) mutation.mutate(confirmation);
              }}
            >
              {mutation.isPending
                ? "Working…"
                : confirmation === "publish"
                  ? "Publish selected"
                  : "Delete article"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
