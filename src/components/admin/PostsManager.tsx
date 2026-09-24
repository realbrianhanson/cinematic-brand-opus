import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useSearchParams } from "@/lib/router-compat";
import { supabase } from "@/integrations/supabase/client";
import { Plus, Search } from "lucide-react";
import { toast } from "sonner";
import QueryNotice from "./QueryNotice";
import { heldReasonSentences } from "./manualPublishClient";
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
const DELETE_WORD = "DELETE";
const LIST_KEYS = [
  ["admin-posts"],
  ["admin-post-review-counts"],
  ["admin-post-stats"],
  ["admin-recent-posts"],
  ["admin-content-queue"],
] as const;
type RowPost = {
  id: string;
  title: string;
  slug: string;
  status: string;
  contradicted_count?: number | null;
};
type RowAction = { kind: "unpublish" | "delete"; post: RowPost };
type DbError = { code?: string; message?: string };
class StaleRowError extends Error {}

/**
 * Review filters. "Ready to publish" means a draft with no recorded hold; the
 * full publishing check runs per article in the editor.
 */
const VIEWS = {
  facts: {
    label: "Needs fact review",
    help: "Live articles with claims the fact-checker marked as contradicted. Move each one back to draft or correct it",
  },
  held: {
    label: "Held",
    help: "Articles the publishing checks held back, with the reason",
  },
  ready: {
    label: "Ready to publish",
    help: "Drafts with no hold recorded. Open one to run the publishing check, then publish it on its own",
  },
} as const;
type View = keyof typeof VIEWS;
const VIEW_KEYS = Object.keys(VIEWS) as View[];

function contradicted(post: RowPost) {
  return post.contradicted_count ?? 0;
}
function claimsText(n: number) {
  return `${n} claim${n === 1 ? "" : "s"} the fact-checker marked as contradicted`;
}

function isPermissionError(error: DbError) {
  return (
    error.code === "42501" ||
    error.code === "PGRST301" ||
    /row-level security|permission denied|jwt/i.test(error.message ?? "")
  );
}

/** Turn a failed row action into a sentence Brian can act on. */
function describeRowFailure(action: RowAction, error: unknown): string {
  const { post, kind } = action;
  const name = `"${post.title}"`;
  const scheduled = post.status === "scheduled";
  if (error instanceof StaleRowError) {
    return kind === "delete"
      ? `${name} is no longer a draft, so it was not deleted. The list has been refreshed.`
      : `${name} is no longer ${scheduled ? "scheduled" : "published"}, so nothing was changed. The list has been refreshed.`;
  }
  const dbError = (error ?? {}) as DbError;
  if (kind === "delete" && dbError.code === "23503") {
    return `${name} is still linked to other content, so it can't be deleted. Nothing was removed.`;
  }
  const retry = isPermissionError(dbError)
    ? "Your admin session may have expired. Sign in again, then retry."
    : "Check your connection and try again.";
  if (kind === "delete") {
    return `Couldn't delete ${name}. Nothing was removed. ${retry}`;
  }
  return scheduled
    ? `Couldn't unschedule ${name}. It is still scheduled. ${retry}`
    : `Couldn't unpublish ${name}. It is still live. ${retry}`;
}

async function runRowAction({ kind, post }: RowAction) {
  // The status guard makes the change a no-op if the row moved on in another
  // tab (for example a draft that was published since this list loaded).
  const query =
    kind === "delete"
      ? supabase.from("posts").delete().eq("id", post.id).eq("status", "draft")
      : supabase
          .from("posts")
          .update({ status: "draft" })
          .eq("id", post.id)
          .eq("status", post.status);
  const { data, error } = await query.select("id");
  if (error) throw error;
  if (!data?.length) throw new StaleRowError();
}

function rowSuccessMessage({ kind, post }: RowAction) {
  if (kind === "delete")
    return `"${post.title}" and its revision history were permanently deleted.`;
  return post.status === "scheduled"
    ? `"${post.title}" is now a draft and will not go live.`
    : `"${post.title}" is now a draft. Its page is offline until you publish it again.`;
}

export default function PostsManager() {
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const view: View | null = VIEW_KEYS.includes(params.get("view") as View)
    ? (params.get("view") as View)
    : null;
  const status: Status =
    !view && statuses.includes(params.get("status") as Status)
      ? (params.get("status") as Status)
      : "all";
  const [search, setSearch] = useState("");
  const [term, setTerm] = useState("");
  const [category, setCategory] = useState("");
  const [from, setFrom] = useState("");
  const [sort, setSort] = useState("updated_at");
  const [page, setPage] = useState(0);
  // The last confirmation stays in state while the dialog animates closed so
  // its content does not flash to a different variant.
  const [confirmation, setConfirmation] = useState<RowAction | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const confirm = (next: RowAction) => {
    setTyped("");
    setConfirmation(next);
    setDialogOpen(true);
  };
  useEffect(() => {
    const timer = setTimeout(() => {
      setTerm(search.trim());
      setPage(0);
    }, 250);
    return () => clearTimeout(timer);
  }, [search]);
  useEffect(() => {
    setPage(0);
  }, [status, view, category, from, sort, term]);
  const posts = useQuery({
    queryKey: ["admin-posts", status, view, category, from, sort, term, page],
    refetchOnWindowFocus: true,
    queryFn: async () => {
      let query = supabase
        .from("posts")
        .select(
          "id,title,slug,status,created_at,updated_at,scheduled_at,contradicted_count,held_reason,held_at,categories(name)",
          { count: "exact" },
        );
      if (view === "facts")
        query = query.eq("status", "published").gt("contradicted_count", 0);
      else if (view === "held") query = query.not("held_reason", "is", null);
      else if (view === "ready")
        query = query.eq("status", "draft").is("held_reason", null);
      else if (status !== "all") query = query.eq("status", status);
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
  const reviewCounts = useQuery({
    queryKey: ["admin-post-review-counts"],
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const count = () =>
        supabase.from("posts").select("id", { count: "exact", head: true });
      const [facts, held, ready] = await Promise.all([
        count().eq("status", "published").gt("contradicted_count", 0),
        count().not("held_reason", "is", null),
        count().eq("status", "draft").is("held_reason", null),
      ]);
      for (const result of [facts, held, ready])
        if (result.error) throw result.error;
      return {
        facts: facts.count ?? 0,
        held: held.count ?? 0,
        ready: ready.count ?? 0,
      } satisfies Record<View, number>;
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
  const refreshLists = () =>
    Promise.all(
      LIST_KEYS.map((queryKey) => qc.invalidateQueries({ queryKey })),
    );
  // One article per action. There is deliberately no bulk publish here:
  // publishing runs per article from the editor, through the publish checks.
  const rowMutation = useMutation({
    mutationFn: runRowAction,
    onSuccess: (_data, action) => {
      toast.success(rowSuccessMessage(action));
      setDialogOpen(false);
      if (action.kind === "delete") {
        qc.removeQueries({ queryKey: ["admin-post", action.post.id] });
      } else {
        qc.invalidateQueries({ queryKey: ["admin-post", action.post.id] });
        qc.invalidateQueries({ queryKey: ["post-revisions", action.post.id] });
      }
      void refreshLists();
    },
    onError: (error, action) => {
      toast.error(describeRowFailure(action, error));
      if (error instanceof StaleRowError) void refreshLists();
    },
  });
  const busy = rowMutation.isPending;
  const items = posts.data?.items ?? [];
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
          <p>Find, review, and publish your work, one article at a time.</p>
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
            aria-pressed={!view && status === s}
            onClick={() => setParams(s === "all" ? {} : { status: s })}
          >
            {s}
          </button>
        ))}
      </div>
      <div
        className="admin-tabs"
        role="group"
        aria-label="Review filters"
        style={{ flexWrap: "wrap" }}
      >
        {VIEW_KEYS.map((key) => (
          <button
            key={key}
            className="admin-btn-ghost"
            aria-pressed={view === key}
            title={VIEWS[key].help}
            style={
              key === "facts" && (reviewCounts.data?.facts ?? 0) > 0
                ? { color: "#f87171" }
                : undefined
            }
            onClick={() => setParams(view === key ? {} : { view: key })}
          >
            {VIEWS[key].label}{" "}
            <span className="admin-badge">
              {reviewCounts.data ? reviewCounts.data[key] : "…"}
            </span>
          </button>
        ))}
      </div>
      {view && <p className="admin-help">{VIEWS[view].help}</p>}
      <QueryNotice
        error={reviewCounts.error}
        retry={() => reviewCounts.refetch()}
      />
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
      {!posts.error && (
        <section className="admin-card admin-section">
          {items.map((post) => (
            <PostRow
              key={post.id}
              post={post}
              busy={busy}
              onAction={(kind) => confirm({ kind, post })}
            />
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
                onClick={() => setPage((p) => p - 1)}
              >
                Previous
              </button>
              <button
                className="admin-btn-ghost"
                disabled={page + 1 >= pages || posts.isFetching}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </button>
            </div>
          </div>
        </section>
      )}
      <AlertDialog
        open={dialogOpen && !!confirmation}
        onOpenChange={(open) => {
          if (!open && !busy) setDialogOpen(false);
        }}
      >
        <AlertDialogContent className="admin-shell">
          {confirmation && (
            <RowActionConfirmation
              action={confirmation}
              typed={typed}
              onType={setTyped}
              pending={rowMutation.isPending}
              onConfirm={() => rowMutation.mutate(confirmation)}
            />
          )}
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

type ListPost = RowPost & {
  updated_at: string;
  scheduled_at: string | null;
  held_reason: string | null;
  categories: { name: string } | null;
};

function PostRow({
  post,
  busy,
  onAction,
}: {
  post: ListPost;
  busy: boolean;
  onAction: (kind: RowAction["kind"]) => void;
}) {
  const flagged = contradicted(post);
  const reasons = heldReasonSentences(post.held_reason);
  const live = post.status === "published";
  return (
    <div className="admin-recent-row">
      <div className="flex-1">
        <Link to={`/admin/posts/${post.id}/edit`} className="font-medium">
          {post.title}
        </Link>
        <span>
          {post.categories?.name ?? "Uncategorized"} · Updated{" "}
          {new Date(post.updated_at).toLocaleDateString()}
          {post.status === "scheduled" && post.scheduled_at
            ? ` · Goes live ${new Date(post.scheduled_at).toLocaleString()}`
            : ""}
        </span>
        {reasons.length > 0 && (
          <span
            className="block text-sm text-amber-400"
            title={reasons.join("\n")}
          >
            Held: {reasons[0]}
            {reasons.length > 1 ? ` (+${reasons.length - 1} more)` : ""}
          </span>
        )}
      </div>
      {flagged > 0 && (
        <>
          <span
            data-flag="fact-review"
            className="admin-badge"
            title={claimsText(flagged)}
            style={{
              background: "rgba(220,38,38,0.15)",
              color: "#f87171",
              border: "1px solid rgba(248,113,113,0.5)",
            }}
          >
            Needs fact review
          </span>
          <span className="sr-only">{claimsText(flagged)}</span>
        </>
      )}
      <span className="admin-badge">{post.status}</span>
      <div className="flex gap-3">
        <Link
          to={`/admin/posts/${post.id}/edit`}
          aria-label={`Edit ${post.title}`}
        >
          Edit
        </Link>
        <a
          href={`/blog/${post.slug}`}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`${live ? "View" : "Preview"} ${post.title}`}
        >
          {live ? "View" : "Preview"}
        </a>
        {post.status === "draft" ? (
          <button
            className="text-red-400"
            aria-label={`Delete ${post.title}`}
            disabled={busy}
            onClick={() => onAction("delete")}
          >
            Delete
          </button>
        ) : live && flagged > 0 ? (
          <button
            className="text-red-400"
            aria-label={`Move ${post.title} back to draft`}
            disabled={busy}
            onClick={() => onAction("unpublish")}
          >
            Move back to draft
          </button>
        ) : (
          <button
            aria-label={`${post.status === "scheduled" ? "Unschedule" : "Unpublish"} ${post.title}`}
            disabled={busy}
            onClick={() => onAction("unpublish")}
          >
            {post.status === "scheduled" ? "Unschedule" : "Unpublish"}
          </button>
        )}
      </div>
    </div>
  );
}

function RowActionConfirmation({
  action,
  typed,
  onType,
  pending,
  onConfirm,
}: {
  action: RowAction;
  typed: string;
  onType: (value: string) => void;
  pending: boolean;
  onConfirm: () => void;
}) {
  const { kind, post } = action;
  const isDelete = kind === "delete";
  const scheduled = post.status === "scheduled";
  const ready =
    !pending && (!isDelete || typed.trim().toUpperCase() === DELETE_WORD);
  return (
    <>
      <AlertDialogTitle>
        {isDelete
          ? "Permanently delete this draft?"
          : scheduled
            ? "Unschedule this article?"
            : "Unpublish this article?"}
      </AlertDialogTitle>
      <p className="font-medium">{post.title}</p>
      <AlertDialogDescription>
        {isDelete ? (
          <>
            This permanently deletes the article, its entire revision history,
            and its SEO settings. There is no trash, so it cannot be recovered.
            This cannot be undone.
          </>
        ) : scheduled ? (
          <>
            It moves back to Drafts and will not go live at its scheduled time.
            Nothing is deleted. Schedule it again from the editor when it is
            ready.
          </>
        ) : (
          <>
            {contradicted(post) > 0 && (
              <>
                It has {claimsText(contradicted(post))}. Moving it back to draft
                takes it offline while you correct them.{" "}
              </>
            )}
            It moves back to Drafts. The page at <code>/blog/{post.slug}</code>{" "}
            will stop working until you publish it again, so visitors and search
            engines following that link will see a “page not found” error.
            Nothing is deleted: the content, SEO settings, and revision history
            stay intact.
          </>
        )}
      </AlertDialogDescription>
      {isDelete && (
        <label className="admin-help flex flex-col gap-1">
          Type {DELETE_WORD} to confirm
          <input
            className="admin-input"
            autoComplete="off"
            value={typed}
            disabled={pending}
            onChange={(e) => onType(e.target.value)}
          />
        </label>
      )}
      <AlertDialogFooter>
        <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
        <AlertDialogAction
          className={isDelete ? "bg-red-600 hover:bg-red-700" : undefined}
          disabled={!ready}
          onClick={(e) => {
            e.preventDefault();
            if (ready) onConfirm();
          }}
        >
          {pending
            ? "Working…"
            : isDelete
              ? "Delete forever"
              : "Move back to draft"}
        </AlertDialogAction>
      </AlertDialogFooter>
    </>
  );
}
