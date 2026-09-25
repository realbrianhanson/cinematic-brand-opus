import { z } from "zod";
import { errorMessage } from "@/lib/errorMessage";
import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useSearchParams } from "@/lib/router-compat";
import { supabase } from "@/integrations/supabase/client";
import { safeMutation } from "@/lib/withTimeout";
import { useToast } from "@/hooks/use-toast";
import { invokeAdminFunction } from "./manualPublishClient";
import {
  bulkResultSummary,
  friendlyPublishError,
  keepVisibleSelection,
  publishPagesOneByOne,
  type BulkPublishResult,
  type PublishedRow,
} from "@/lib/resourcePages";
import {
  Search,
  MoreHorizontal,
  ExternalLink,
  Pencil,
  Eye,
  Archive,
  Trash2,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  CheckSquare,
  ImageIcon,
  Globe,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const STATUSES = ["all", "draft", "review", "published", "archived"] as const;
const PER_PAGE = 25;
// Every row renders exactly these 9 cells, so columns never shift.
const GRID_COLUMNS = "40px 1fr 120px 120px 110px 70px 60px 90px 50px";
// The list never loads page bodies (content_json).
const LIST_COLUMNS =
  "id, title, slug, status, niche_id, content_schema_id, performance_trend, quality_score, lint_flags, views, created_at, refresh_count, niches!generated_pages_niche_id_fkey(name, slug), content_schemas(name, slug)";
/** Refresh runs take 65-116 s (generation_logs); leave headroom. */
const REFRESH_TIMEOUT_MS = 180_000;
const CONFIRM_LIST_LIMIT = 8;

const statusColors: Record<string, { bg: string; color: string }> = {
  draft: {
    bg: "hsl(var(--admin-text-ghost) / 0.15)",
    color: "hsl(var(--admin-text-ghost))",
  },
  review: {
    bg: "hsl(var(--admin-accent) / 0.12)",
    color: "hsl(var(--admin-accent))",
  },
  published: {
    bg: "hsl(var(--admin-sage) / 0.12)",
    color: "hsl(var(--admin-sage))",
  },
  archived: {
    bg: "hsl(var(--admin-danger) / 0.12)",
    color: "hsl(var(--admin-danger))",
  },
};

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

const bodyError = (body: Record<string, unknown>, fallback: string) =>
  typeof body.error === "string" && body.error.trim() ? body.error : fallback;

/** Server-side quality score for one page (stored by the scoring function). */
async function scorePageOnServer(id: string) {
  const { status, body } = await invokeAdminFunction("score-content-quality", {
    page_id: id,
  });
  if (status !== 200)
    throw new Error(bodyError(body, "The quality check could not run."));
  const score = Number(body.score);
  if (!Number.isFinite(score))
    throw new Error("The quality check returned no score.");
  const issues = Array.isArray(body.issues)
    ? body.issues.filter((i): i is string => typeof i === "string")
    : [];
  return { score, issues };
}

async function publishOnePage(id: string) {
  const { error } = await supabase
    .from("generated_pages")
    .update({ status: "published", published_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

function blockedDescription(result: BulkPublishResult): string | undefined {
  if (!result.blocked.length) return undefined;
  const lines = result.blocked
    .slice(0, 3)
    .map((b) => `${b.title}: ${b.reason}`);
  const more = result.blocked.length - lines.length;
  return [...lines, ...(more > 0 ? [`and ${more} more`] : [])].join("\n");
}

const dialogOverlay: React.CSSProperties = {
  backgroundColor: "rgba(0,0,0,0.6)",
};

const GeneratedPagesManager = () => {
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const needsRefresh = params.get("trend") === "needs_refresh";
  const { toast } = useToast();

  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [nicheFilter, setNicheFilter] = useState("");
  const [schemaFilter, setSchemaFilter] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sortCol, setSortCol] = useState<
    "created_at" | "views" | "quality_score"
  >("created_at");
  const [sortAsc, setSortAsc] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [bulkAction, setBulkAction] = useState<string | null>(null);
  const [regenTarget, setRegenTarget] = useState<{
    id: string;
    title: string;
  } | null>(null);

  // Bulk actions only ever apply to rows Brian can see: a filter change
  // clears the selection.
  useEffect(() => {
    setSelected(new Set());
  }, [statusFilter, nicheFilter, schemaFilter, search, needsRefresh]);

  // Fetch data
  const {
    data: pages,
    isLoading,
    error: pagesError,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ["admin-generated-pages"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("generated_pages")
        .select(LIST_COLUMNS)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: niches } = useQuery({
    queryKey: ["admin-niches-list"],
    queryFn: async () => {
      const { data } = await supabase
        .from("niches")
        .select("id, name, slug")
        .order("name");
      return data ?? [];
    },
  });

  const { data: schemas } = useQuery({
    queryKey: ["admin-schemas-list"],
    queryFn: async () => {
      const { data } = await supabase
        .from("content_schemas")
        .select("id, name, slug")
        .order("name");
      return data ?? [];
    },
  });

  const { data: indexingMap } = useQuery({
    queryKey: ["admin-indexing-logs"],
    queryFn: async () => {
      const { data } = await supabase
        .from("indexing_log")
        .select("page_id, status")
        .order("submitted_at", { ascending: false });
      const map = new Map<string, string>();
      (data ?? []).forEach((log) => {
        if (log.page_id && log.status && !map.has(log.page_id))
          map.set(log.page_id, log.status);
      });
      return map;
    },
  });

  // Filter + sort
  const filtered = useMemo(() => {
    let list = pages ?? [];
    if (needsRefresh)
      list = list.filter(
        (p) =>
          p.performance_trend === "needs_refresh" && p.status === "published",
      );
    if (statusFilter !== "all")
      list = list.filter((p) => p.status === statusFilter);
    if (nicheFilter) list = list.filter((p) => p.niche_id === nicheFilter);
    if (schemaFilter)
      list = list.filter((p) => p.content_schema_id === schemaFilter);
    if (search)
      list = list.filter((p) =>
        p.title.toLowerCase().includes(search.toLowerCase()),
      );

    list = [...list].sort((a, b) => {
      const av = a[sortCol] ?? 0;
      const bv = b[sortCol] ?? 0;
      if (sortCol === "created_at") {
        return sortAsc
          ? new Date(av as string).getTime() - new Date(bv as string).getTime()
          : new Date(bv as string).getTime() - new Date(av as string).getTime();
      }
      return sortAsc ? Number(av) - Number(bv) : Number(bv) - Number(av);
    });
    return list;
  }, [
    pages,
    statusFilter,
    nicheFilter,
    schemaFilter,
    search,
    sortCol,
    sortAsc,
    needsRefresh,
  ]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  useEffect(() => {
    if (pages && page >= totalPages) setPage(totalPages - 1);
  }, [pages, page, totalPages]);
  const paginated = filtered.slice(page * PER_PAGE, (page + 1) * PER_PAGE);
  const selectedVisible = filtered.filter((p) => selected.has(p.id));
  const titleFor = (id: string) =>
    (pages ?? []).find((p) => p.id === id)?.title ?? id;

  const allOnPageSelected =
    paginated.length > 0 && paginated.every((p) => selected.has(p.id));

  const toggleAll = () => {
    const next = new Set(selected);
    if (allOnPageSelected) paginated.forEach((p) => next.delete(p.id));
    else paginated.forEach((p) => next.add(p.id));
    setSelected(next);
  };

  const toggleOne = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  const handleSort = (col: typeof sortCol) => {
    if (sortCol === col) setSortAsc(!sortAsc);
    else {
      setSortCol(col);
      setSortAsc(false);
    }
  };

  const SortIcon = ({ col }: { col: typeof sortCol }) => {
    if (sortCol !== col)
      return <ArrowUpDown size={12} style={{ opacity: 0.4 }} />;
    return sortAsc ? <ArrowUp size={12} /> : <ArrowDown size={12} />;
  };

  const refreshLists = () => {
    qc.invalidateQueries({ queryKey: ["admin-generated-pages"] });
    qc.invalidateQueries({ queryKey: ["admin-indexing-logs"] });
  };

  // OG image, silo links and IndexNow run only for pages that went live.
  const afterPublish = (published: PublishedRow[]) => {
    const urls: string[] = [];
    for (const { id } of published) {
      const pg = (pages ?? []).find((p) => p.id === id);
      supabase.functions
        .invoke("generate-og-image", { body: { page_id: id } })
        .catch(() => {});
      supabase.functions
        .invoke("build-silo-links", { body: { page_id: id } })
        .catch(() => {});
      if (pg?.content_schemas?.slug && pg.slug)
        urls.push(`/resources/${pg.content_schemas.slug}/${pg.slug}`);
    }
    if (urls.length)
      supabase.functions
        .invoke("submit-indexnow", { body: { urls } })
        .catch(() => {});
  };

  // Mutations
  const publishMutation = useMutation({
    mutationFn: (ids: string[]) =>
      safeMutation(
        () =>
          publishPagesOneByOne({
            ids,
            titleFor,
            scorePage: scorePageOnServer,
            publishPage: publishOnePage,
          }),
        30_000 + ids.length * 15_000,
      ),
    onSuccess: (result) => {
      refreshLists();
      afterPublish(result.published);
      setSelected(new Set(result.blocked.map((b) => b.id)));
      setBulkAction(null);
      toast({
        title: bulkResultSummary(result),
        description: blockedDescription(result),
        variant:
          result.blocked.length && !result.published.length
            ? "destructive"
            : "default",
      });
    },
    onError: (e) =>
      toast({
        title: "Could not publish",
        description: friendlyPublishError(errorMessage(e)),
        variant: "destructive",
      }),
  });

  const archiveMutation = useMutation({
    mutationFn: (ids: string[]) =>
      safeMutation(async () => {
        const { error } = await supabase
          .from("generated_pages")
          .update({ status: "archived" })
          .in("id", ids);
        if (error) throw error;
      }, 30000),
    onSuccess: (_data, ids) => {
      refreshLists();
      setSelected(new Set());
      setBulkAction(null);
      toast({ title: `${ids.length} archived` });
    },
    onError: (e) =>
      toast({
        title: "Could not update",
        description: errorMessage(e),
        variant: "destructive",
      }),
  });

  // One statement: keyword assignments cascade, and indexing/generation logs
  // keep their rows with page_id set to NULL (migration 20260923152000).
  const deleteMutation = useMutation({
    mutationFn: (ids: string[]) =>
      safeMutation(async () => {
        const { error } = await supabase
          .from("generated_pages")
          .delete()
          .in("id", ids);
        if (error) throw error;
      }),
    onSuccess: (_data, ids) => {
      refreshLists();
      setSelected(new Set());
      setDeleteId(null);
      setBulkAction(null);
      toast({ title: ids.length === 1 ? "Deleted" : `${ids.length} deleted` });
    },
    onError: (e) =>
      toast({
        title: "Could not delete",
        description: errorMessage(e),
        variant: "destructive",
      }),
  });

  // Rewrites one page's content in place with fresh research (same title
  // intent and URL) through the per-page refresh function.
  const regenerateMutation = useMutation({
    mutationFn: (id: string) =>
      safeMutation(async () => {
        const { status, body } = await invokeAdminFunction(
          "refresh-stale-content",
          { page_id: id },
        );
        if (status !== 200)
          throw new Error(bodyError(body, "The refresh could not run."));
        if (body.refreshed !== 1)
          throw new Error(
            Number(body.failed) > 0
              ? "The refresh failed. See Recent Generation Runs for the reason."
              : bodyError(body, "Nothing was refreshed."),
          );
      }, REFRESH_TIMEOUT_MS),
    onSuccess: () => {
      refreshLists();
      setRegenTarget(null);
      toast({
        title: "Content refreshed",
        description: "The page was rewritten and re-scored.",
      });
    },
    onError: (e) => {
      setRegenTarget(null);
      toast({
        title: "Refresh failed",
        description: errorMessage(e),
        variant: "destructive",
      });
    },
  });

  const bulkBusy =
    publishMutation.isPending ||
    archiveMutation.isPending ||
    deleteMutation.isPending;
  const bulkIds = [...keepVisibleSelection(selected, filtered)];

  const resetPage = () => setPage(0);

  return (
    <div>
      {needsRefresh && (
        <div className="admin-notice">
          Showing published resources flagged for refresh.{" "}
          <button
            className="admin-btn-ghost"
            onClick={() => {
              setParams({});
              resetPage();
            }}
          >
            Show all resources
          </button>
        </div>
      )}
      {/* Header */}
      <div
        className="flex items-center justify-between flex-wrap gap-4"
        style={{ marginBottom: 24 }}
      >
        <h1
          className="font-heading italic"
          style={{ fontSize: 28, fontWeight: 400 }}
        >
          Generated Pages
        </h1>
      </div>

      {/* Filter bar */}
      <div
        className="flex flex-wrap items-center gap-3"
        style={{ marginBottom: 20 }}
      >
        {/* Status tabs */}
        <div className="flex gap-1">
          {STATUSES.map((s) => (
            <button
              key={s}
              aria-pressed={statusFilter === s}
              onClick={() => {
                setStatusFilter(s);
                resetPage();
              }}
              className="font-body"
              style={{
                fontSize: 12,
                fontWeight: 500,
                padding: "6px 14px",
                borderRadius: 4,
                border: "1px solid hsl(var(--admin-border))",
                cursor: "pointer",
                textTransform: "capitalize",
                transition: "all 0.15s",
                background:
                  statusFilter === s
                    ? "hsl(var(--admin-accent))"
                    : "transparent",
                color:
                  statusFilter === s
                    ? "hsl(var(--admin-bg))"
                    : "hsl(var(--admin-text-soft))",
                borderColor:
                  statusFilter === s
                    ? "hsl(var(--admin-accent))"
                    : "hsl(var(--admin-border))",
              }}
            >
              {s}
            </button>
          ))}
        </div>

        {/* Content type dropdown */}
        <select
          aria-label="Filter by content type"
          value={schemaFilter}
          onChange={(e) => {
            setSchemaFilter(e.target.value);
            resetPage();
          }}
          className="admin-input font-body"
          style={{ fontSize: 12, padding: "6px 10px", minWidth: 140 }}
        >
          <option value="">All Content Types</option>
          {schemas?.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>

        {/* Niche dropdown */}
        <select
          aria-label="Filter by niche"
          value={nicheFilter}
          onChange={(e) => {
            setNicheFilter(e.target.value);
            resetPage();
          }}
          className="admin-input font-body"
          style={{ fontSize: 12, padding: "6px 10px", minWidth: 140 }}
        >
          <option value="">All Niches</option>
          {niches?.map((n) => (
            <option key={n.id} value={n.id}>
              {n.name}
            </option>
          ))}
        </select>

        {/* Search */}
        <div className="relative flex-1" style={{ minWidth: 180 }}>
          <Search
            size={14}
            aria-hidden
            style={{
              position: "absolute",
              left: 12,
              top: "50%",
              transform: "translateY(-50%)",
              color: "hsl(var(--admin-text-ghost))",
            }}
          />
          <input
            aria-label="Search pages"
            placeholder="Search pages..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              resetPage();
            }}
            className="admin-input font-body w-full"
            style={{ paddingLeft: 34, fontSize: 12 }}
          />
        </div>
      </div>

      {/* Table */}
      <div className="admin-card" style={{ overflow: "hidden" }}>
        {/* Header row */}
        <div
          className="hidden lg:grid items-center"
          style={{
            gridTemplateColumns: GRID_COLUMNS,
            padding: "10px 20px",
            borderBottom: "1px solid hsl(var(--admin-border))",
            backgroundColor: "hsl(var(--admin-surface-2))",
          }}
        >
          <label
            style={{
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <input
              type="checkbox"
              aria-label="Select all pages on this page"
              checked={allOnPageSelected}
              onChange={toggleAll}
              style={{ accentColor: "hsl(var(--admin-accent))" }}
            />
          </label>
          <span className="admin-label" style={{ marginBottom: 0 }}>
            Title
          </span>
          <span className="admin-label" style={{ marginBottom: 0 }}>
            Niche
          </span>
          <span className="admin-label" style={{ marginBottom: 0 }}>
            Type
          </span>
          <span className="admin-label" style={{ marginBottom: 0 }}>
            Status
          </span>
          <button
            onClick={() => handleSort("quality_score")}
            className="admin-label flex items-center gap-1"
            style={{
              marginBottom: 0,
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: 0,
              color: "inherit",
            }}
          >
            Score <SortIcon col="quality_score" />
          </button>
          <button
            onClick={() => handleSort("views")}
            className="admin-label flex items-center gap-1"
            style={{
              marginBottom: 0,
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: 0,
              color: "inherit",
            }}
          >
            Views <SortIcon col="views" />
          </button>
          <button
            onClick={() => handleSort("created_at")}
            className="admin-label flex items-center gap-1"
            style={{
              marginBottom: 0,
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: 0,
              color: "inherit",
            }}
          >
            Date <SortIcon col="created_at" />
          </button>
          <span />
        </div>

        {isLoading && (
          <div style={{ padding: 32, textAlign: "center" }}>
            <span
              className="font-body"
              style={{ color: "hsl(var(--admin-text-ghost))" }}
            >
              Loading...
            </span>
          </div>
        )}

        {pagesError && (
          <div role="alert" className="admin-notice">
            <p>
              Couldn't load generated pages: {errorMessage(pagesError)}. Your
              filters are still here.
            </p>
            <button
              className="admin-btn-ghost"
              disabled={isFetching}
              onClick={() => void refetch()}
            >
              Retry loading pages
            </button>
          </div>
        )}

        {paginated.map((pg) => {
          const niche = pg.niches;
          const schema = pg.content_schemas;
          const sc = statusColors[pg.status ?? "draft"] || statusColors.draft;
          const idxStatus = indexingMap?.get(pg.id);
          const idxLabel =
            idxStatus === "indexed"
              ? "Indexed by Google"
              : "Submitted to Google";
          const isPublished = pg.status === "published";

          return (
            <div
              key={pg.id}
              data-row
              className="lg:grid flex flex-col"
              style={{
                gridTemplateColumns: GRID_COLUMNS,
                padding: "12px 20px",
                borderBottom: "1px solid hsl(var(--admin-border))",
                alignItems: "center",
                transition: "background-color 0.15s",
                backgroundColor: selected.has(pg.id)
                  ? "hsl(var(--admin-accent) / 0.06)"
                  : undefined,
              }}
              onMouseEnter={(e) => {
                if (!selected.has(pg.id))
                  e.currentTarget.style.backgroundColor =
                    "hsl(var(--admin-surface-2))";
              }}
              onMouseLeave={(e) => {
                if (!selected.has(pg.id))
                  e.currentTarget.style.backgroundColor = "transparent";
              }}
            >
              <label
                style={{
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <input
                  type="checkbox"
                  aria-label={`Select ${pg.title}`}
                  checked={selected.has(pg.id)}
                  onChange={() => toggleOne(pg.id)}
                  style={{ accentColor: "hsl(var(--admin-accent))" }}
                />
              </label>
              <div className="flex items-center gap-2 min-w-0">
                {pg.performance_trend === "needs_refresh" && (
                  <span
                    title="Needs refresh (90+ days old)"
                    aria-label="Needs refresh"
                    style={{
                      display: "inline-block",
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      backgroundColor: "hsl(var(--admin-accent))",
                      flexShrink: 0,
                    }}
                  />
                )}
                <span
                  className="font-body truncate"
                  style={{
                    fontSize: 13,
                    fontWeight: 500,
                    color: "hsl(var(--admin-text))",
                  }}
                  title={pg.title}
                >
                  {pg.title.length > 50
                    ? pg.title.slice(0, 50) + "…"
                    : pg.title}
                </span>
              </div>
              <span
                className="admin-badge font-body"
                style={{
                  fontSize: 11,
                  backgroundColor: "hsl(var(--admin-accent) / 0.08)",
                  color: "hsl(var(--admin-accent))",
                  width: "fit-content",
                }}
              >
                {niche?.name || "—"}
              </span>
              <span
                className="admin-badge font-body"
                style={{
                  fontSize: 11,
                  backgroundColor: "hsl(var(--admin-sage) / 0.10)",
                  color: "hsl(var(--admin-sage))",
                  width: "fit-content",
                }}
              >
                {schema?.name || "—"}
              </span>
              {/* Status and Google indexing share one cell. */}
              <div className="flex items-center gap-1.5 min-w-0">
                <span
                  className="font-body"
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    padding: "3px 10px",
                    borderRadius: 4,
                    background: sc.bg,
                    color: sc.color,
                    width: "fit-content",
                    textTransform: "capitalize",
                  }}
                >
                  {pg.status}
                </span>
                {idxStatus && (
                  <span
                    role="img"
                    title={idxLabel}
                    aria-label={idxLabel}
                    style={{ display: "inline-flex" }}
                  >
                    <Globe
                      size={12}
                      aria-hidden
                      style={{
                        color:
                          idxStatus === "indexed"
                            ? "hsl(var(--admin-sage))"
                            : "hsl(var(--admin-accent))",
                        flexShrink: 0,
                      }}
                    />
                  </span>
                )}
              </div>
              <span
                className="font-body flex items-center gap-1"
                style={{ fontSize: 12, color: "hsl(var(--admin-text-soft))" }}
              >
                {pg.quality_score != null
                  ? Number(pg.quality_score).toFixed(1)
                  : "—"}
                {(() => {
                  const flags = pg.lint_flags;
                  const count = Array.isArray(flags) ? flags.length : 0;
                  if (!Array.isArray(flags) || !count) return null;
                  const preview = flags
                    .slice(0, 5)
                    .map((f: unknown) => {
                      if (typeof f === "string") return f;
                      const flag = z
                        .object({
                          field: z.string(),
                          phrase: z.string().optional(),
                          type: z.string().optional(),
                        })
                        .safeParse(f);
                      return flag.success
                        ? `${flag.data.field}: ${flag.data.phrase || flag.data.type || ""}`
                        : JSON.stringify(f);
                    })
                    .join(" · ");
                  return (
                    <span
                      title={`${count} lint issue${count === 1 ? "" : "s"}: ${preview}`}
                      style={{
                        fontSize: 10,
                        padding: "1px 6px",
                        borderRadius: 999,
                        background: "hsl(40 90% 50% / 0.15)",
                        color: "hsl(40 90% 55%)",
                        fontWeight: 600,
                      }}
                    >
                      ⚠ {count}
                    </span>
                  );
                })()}
              </span>
              <span
                className="font-body"
                style={{ fontSize: 12, color: "hsl(var(--admin-text-soft))" }}
              >
                {pg.views ?? 0}
              </span>
              <span
                className="font-body"
                style={{ fontSize: 11, color: "hsl(var(--admin-text-ghost))" }}
              >
                {timeAgo(pg.created_at ?? "")}
              </span>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    aria-label={`Actions for ${pg.title}`}
                    style={{
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      color: "hsl(var(--admin-text-soft))",
                      padding: 4,
                    }}
                  >
                    <MoreHorizontal size={16} aria-hidden />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" style={{ minWidth: 180 }}>
                  <DropdownMenuItem
                    onClick={() => {
                      // Drafts render for signed-in admins at the same URL.
                      const url = `/resources/${schema?.slug || "page"}/${pg.slug}`;
                      window.open(url, "_blank");
                    }}
                  >
                    <Eye size={14} className="mr-2" />{" "}
                    {isPublished ? "View live page" : "Preview draft"}
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link to={`/admin/pages/${pg.id}/edit`}>
                      <Pencil size={14} className="mr-2" /> Edit
                    </Link>
                  </DropdownMenuItem>
                  {!isPublished && (
                    <DropdownMenuItem
                      disabled={publishMutation.isPending}
                      onClick={() => publishMutation.mutate([pg.id])}
                    >
                      <ExternalLink size={14} className="mr-2" /> Publish
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem
                    disabled={archiveMutation.isPending}
                    onClick={() => archiveMutation.mutate([pg.id])}
                  >
                    <Archive size={14} className="mr-2" /> Archive
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    disabled={regenerateMutation.isPending}
                    onClick={() =>
                      setRegenTarget({ id: pg.id, title: pg.title })
                    }
                  >
                    <RefreshCw size={14} className="mr-2" /> Regenerate…
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={async () => {
                      toast({ title: "Generating OG image..." });
                      const { data, error } = await supabase.functions.invoke(
                        "generate-og-image",
                        { body: { page_id: pg.id } },
                      );
                      if (error || data?.error) {
                        toast({
                          title: "Failed",
                          description: error?.message || data?.error,
                          variant: "destructive",
                        });
                      } else {
                        qc.invalidateQueries({
                          queryKey: ["admin-generated-pages"],
                        });
                        toast({ title: "OG image generated" });
                      }
                    }}
                  >
                    <ImageIcon size={14} className="mr-2" /> Generate OG Image
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => setDeleteId(pg.id)}
                    style={{ color: "hsl(var(--admin-danger))" }}
                  >
                    <Trash2 size={14} className="mr-2" /> Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          );
        })}

        {!isLoading && !pagesError && filtered.length === 0 && (
          <div style={{ padding: 40, textAlign: "center" }}>
            <p
              className="font-body"
              style={{ fontSize: 13, color: "hsl(var(--admin-text-ghost))" }}
            >
              No generated pages found.
            </p>
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div
          className="flex items-center justify-between"
          style={{ marginTop: 16 }}
        >
          <span
            className="font-body"
            style={{ fontSize: 12, color: "hsl(var(--admin-text-ghost))" }}
          >
            {filtered.length} pages · Page {page + 1} of {totalPages}
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setPage(Math.max(0, page - 1))}
              disabled={page === 0}
              className="admin-btn-ghost"
              style={{ padding: "6px 12px", fontSize: 12 }}
            >
              <ChevronLeft size={14} /> Previous
            </button>
            <button
              onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
              disabled={page >= totalPages - 1}
              className="admin-btn-ghost"
              style={{ padding: "6px 12px", fontSize: 12 }}
            >
              Next <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}

      {/* Bulk actions bar */}
      {selectedVisible.length > 0 && (
        <div
          className="fixed bottom-6 left-1/2 flex items-center gap-4"
          style={{
            transform: "translateX(-50%)",
            padding: "12px 24px",
            borderRadius: 8,
            backgroundColor: "hsl(var(--admin-surface))",
            border: "1px solid hsl(var(--admin-border))",
            boxShadow: "0 8px 30px rgba(0,0,0,0.3)",
            zIndex: 50,
          }}
        >
          <span
            className="font-body"
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: "hsl(var(--admin-text))",
            }}
          >
            <CheckSquare
              size={14}
              aria-hidden
              style={{
                display: "inline",
                marginRight: 6,
                verticalAlign: "middle",
              }}
            />
            {selectedVisible.length} selected
          </span>
          <button
            onClick={() => setSelected(new Set())}
            className="admin-btn-ghost"
            style={{ fontSize: 12, padding: "6px 14px" }}
          >
            Clear
          </button>
          <button
            onClick={() => setBulkAction("publish")}
            className="admin-btn-ghost"
            style={{ fontSize: 12, padding: "6px 14px" }}
          >
            Publish Selected
          </button>
          <button
            onClick={() => setBulkAction("archive")}
            className="admin-btn-ghost"
            style={{ fontSize: 12, padding: "6px 14px" }}
          >
            Archive Selected
          </button>
          <button
            onClick={() => setBulkAction("delete")}
            className="admin-btn-ghost"
            style={{
              fontSize: 12,
              padding: "6px 14px",
              color: "hsl(var(--admin-danger))",
            }}
          >
            Delete Selected
          </button>
        </div>
      )}

      {/* Delete confirmation */}
      {deleteId && (
        <div
          className="fixed inset-0 flex items-center justify-center z-50"
          style={dialogOverlay}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-page-title"
            className="admin-card"
            style={{ padding: 32, maxWidth: 380, width: "90%" }}
          >
            <p
              id="delete-page-title"
              className="font-body"
              style={{
                fontSize: 15,
                marginBottom: 20,
                color: "hsl(var(--admin-text))",
              }}
            >
              Delete “{titleFor(deleteId)}”? This cannot be undone.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setDeleteId(null)}
                className="admin-btn-ghost"
              >
                Cancel
              </button>
              <button
                onClick={() => deleteMutation.mutate([deleteId])}
                disabled={deleteMutation.isPending}
                className="admin-btn-primary"
                style={{ background: "hsl(var(--admin-danger))" }}
              >
                {deleteMutation.isPending ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Regenerate confirmation */}
      {regenTarget && (
        <div
          className="fixed inset-0 flex items-center justify-center z-50"
          style={dialogOverlay}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="regenerate-page-title"
            className="admin-card"
            style={{ padding: 32, maxWidth: 440, width: "90%" }}
          >
            <p
              id="regenerate-page-title"
              className="font-body"
              style={{
                fontSize: 15,
                marginBottom: 12,
                color: "hsl(var(--admin-text))",
              }}
            >
              Rewrite “{regenTarget.title}” with fresh research?
            </p>
            <p
              className="font-body"
              style={{
                fontSize: 13,
                marginBottom: 20,
                color: "hsl(var(--admin-text-soft))",
              }}
            >
              The current content and any manual edits are replaced. The URL
              stays the same. It takes 1–2 minutes and uses AI and research
              credits.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setRegenTarget(null)}
                disabled={regenerateMutation.isPending}
                className="admin-btn-ghost"
              >
                Cancel
              </button>
              <button
                onClick={() => regenerateMutation.mutate(regenTarget.id)}
                disabled={regenerateMutation.isPending}
                className="admin-btn-primary"
              >
                {regenerateMutation.isPending
                  ? "Rewriting..."
                  : "Rewrite content"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk action confirmation */}
      {bulkAction && (
        <div
          className="fixed inset-0 flex items-center justify-center z-50"
          style={dialogOverlay}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="bulk-action-title"
            className="admin-card"
            style={{ padding: 32, maxWidth: 460, width: "90%" }}
          >
            <p
              id="bulk-action-title"
              className="font-body"
              style={{
                fontSize: 15,
                marginBottom: 12,
                color: "hsl(var(--admin-text))",
              }}
            >
              {bulkAction === "delete"
                ? `Delete ${bulkIds.length} pages? This cannot be undone.`
                : bulkAction === "publish"
                  ? `Publish ${bulkIds.length} pages? Each page is re-scored first; pages below 75 stay unpublished.`
                  : `Archive ${bulkIds.length} pages?`}
            </p>
            <ul
              className="font-body"
              style={{
                fontSize: 12,
                marginBottom: 20,
                paddingLeft: 16,
                color: "hsl(var(--admin-text-soft))",
              }}
            >
              {bulkIds.slice(0, CONFIRM_LIST_LIMIT).map((id) => (
                <li key={id} style={{ listStyle: "disc" }}>
                  {titleFor(id)}
                </li>
              ))}
              {bulkIds.length > CONFIRM_LIST_LIMIT && (
                <li style={{ listStyle: "none" }}>
                  and {bulkIds.length - CONFIRM_LIST_LIMIT} more
                </li>
              )}
            </ul>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setBulkAction(null)}
                disabled={bulkBusy}
                className="admin-btn-ghost"
              >
                Cancel
              </button>
              <button
                disabled={bulkBusy || bulkIds.length === 0}
                onClick={() => {
                  if (bulkAction === "delete") deleteMutation.mutate(bulkIds);
                  else if (bulkAction === "publish")
                    publishMutation.mutate(bulkIds);
                  else archiveMutation.mutate(bulkIds);
                }}
                className="admin-btn-primary"
                style={
                  bulkAction === "delete"
                    ? { background: "hsl(var(--admin-danger))" }
                    : {}
                }
              >
                {bulkBusy ? "Processing..." : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default GeneratedPagesManager;
