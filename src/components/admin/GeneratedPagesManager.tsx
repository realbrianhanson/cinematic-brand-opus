import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  Search, MoreHorizontal, ExternalLink, Pencil, Eye, Archive,
  Trash2, RefreshCw, ChevronLeft, ChevronRight, ArrowUpDown,
  ArrowUp, ArrowDown, CheckSquare, ImageIcon, Globe, Send,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const STATUSES = ["all", "draft", "review", "published", "archived"] as const;
const PER_PAGE = 25;

const statusColors: Record<string, { bg: string; color: string }> = {
  draft: { bg: "hsl(var(--admin-text-ghost) / 0.15)", color: "hsl(var(--admin-text-ghost))" },
  review: { bg: "hsl(var(--admin-accent) / 0.12)", color: "hsl(var(--admin-accent))" },
  published: { bg: "hsl(var(--admin-sage) / 0.12)", color: "hsl(var(--admin-sage))" },
  archived: { bg: "hsl(var(--admin-danger) / 0.12)", color: "hsl(var(--admin-danger))" },
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

const GeneratedPagesManager = () => {
  const qc = useQueryClient();
  const { toast } = useToast();

  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [nicheFilter, setNicheFilter] = useState("");
  const [schemaFilter, setSchemaFilter] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sortCol, setSortCol] = useState<"created_at" | "views" | "quality_score">("created_at");
  const [sortAsc, setSortAsc] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [bulkAction, setBulkAction] = useState<string | null>(null);

  // Fetch data
  const { data: pages, isLoading } = useQuery({
    queryKey: ["admin-generated-pages"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("generated_pages")
        .select("*, niches(name, slug), content_schemas(name, slug)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: niches } = useQuery({
    queryKey: ["admin-niches-list"],
    queryFn: async () => {
      const { data } = await supabase.from("niches").select("id, name, slug").order("name");
      return data ?? [];
    },
  });

  const { data: schemas } = useQuery({
    queryKey: ["admin-schemas-list"],
    queryFn: async () => {
      const { data } = await supabase.from("content_schemas").select("id, name, slug").order("name");
      return data ?? [];
    },
  });

  const { data: indexingMap } = useQuery({
    queryKey: ["admin-indexing-logs"],
    queryFn: async () => {
      const { data } = await supabase.from("indexing_log").select("page_id, status").order("submitted_at", { ascending: false });
      const map = new Map<string, string>();
      (data ?? []).forEach((log: any) => { if (!map.has(log.page_id)) map.set(log.page_id, log.status); });
      return map;
    },
  });

  // Filter + sort
  const filtered = useMemo(() => {
    let list = pages ?? [];
    if (statusFilter !== "all") list = list.filter((p) => p.status === statusFilter);
    if (nicheFilter) list = list.filter((p) => p.niche_id === nicheFilter);
    if (schemaFilter) list = list.filter((p) => p.content_schema_id === schemaFilter);
    if (search) list = list.filter((p) => p.title.toLowerCase().includes(search.toLowerCase()));

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
  }, [pages, statusFilter, nicheFilter, schemaFilter, search, sortCol, sortAsc]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const paginated = filtered.slice(page * PER_PAGE, (page + 1) * PER_PAGE);

  const allOnPageSelected = paginated.length > 0 && paginated.every((p) => selected.has(p.id));

  const toggleAll = () => {
    if (allOnPageSelected) {
      const next = new Set(selected);
      paginated.forEach((p) => next.delete(p.id));
      setSelected(next);
    } else {
      const next = new Set(selected);
      paginated.forEach((p) => next.add(p.id));
      setSelected(next);
    }
  };

  const toggleOne = (id: string) => {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
  };

  const handleSort = (col: typeof sortCol) => {
    if (sortCol === col) setSortAsc(!sortAsc);
    else { setSortCol(col); setSortAsc(false); }
  };

  const SortIcon = ({ col }: { col: typeof sortCol }) => {
    if (sortCol !== col) return <ArrowUpDown size={12} style={{ opacity: 0.4 }} />;
    return sortAsc ? <ArrowUp size={12} /> : <ArrowDown size={12} />;
  };

  // Mutations
  const updateStatus = useMutation({
    mutationFn: async ({ ids, status }: { ids: string[]; status: string }) => {
      const updateData: Record<string, any> = { status };
      if (status === "published") updateData.published_at = new Date().toISOString();
      const { error } = await supabase.from("generated_pages").update(updateData).in("id", ids);
      if (error) throw error;

      // On publish: trigger OG image generation and Google submission
      if (status === "published") {
        for (const id of ids) {
          const pg = (pages ?? []).find((p) => p.id === id);
          if (!pg) continue;
          const niche = (pg as any).niches;
          const schema = (pg as any).content_schemas;
          // Fire and forget — don't block on these
          supabase.functions.invoke("generate-og-image", { body: { page_id: id } }).catch(() => {});
          if (niche?.slug && schema?.slug) {
            const pageUrl = `/resources/${schema.slug}/${niche.slug}`;
            supabase.functions.invoke("submit-to-google", { body: { page_id: id, page_url: pageUrl } }).catch(() => {});
          }
        }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-generated-pages"] });
      qc.invalidateQueries({ queryKey: ["admin-indexing-logs"] });
      setSelected(new Set());
      setBulkAction(null);
      toast({ title: "Updated" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      await supabase.from("keyword_assignments").delete().in("page_id", ids);
      await supabase.from("generation_logs").delete().in("generated_page_id", ids);
      const { error } = await supabase.from("generated_pages").delete().in("id", ids);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-generated-pages"] });
      setSelected(new Set());
      setDeleteId(null);
      setBulkAction(null);
      toast({ title: "Deleted" });
    },
  });

  const regenerateMutation = useMutation({
    mutationFn: async (pageItem: any) => {
      const nicheSlug = (pageItem as any).niches?.slug;
      const schemaSlug = (pageItem as any).content_schemas?.slug;
      if (!nicheSlug || !schemaSlug) throw new Error("Missing niche or schema");
      const { data, error } = await supabase.functions.invoke("generate-content", {
        body: {
          niche_slugs: [nicheSlug],
          content_type_slug: schemaSlug,
          count_per_combination: 1,
          dry_run: true,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      if (!data?.content_json) throw new Error("No content returned");
      // Update the page with new content
      const { error: updateErr } = await supabase
        .from("generated_pages")
        .update({
          content_json: data.content_json,
          seo_meta: data.seo_meta,
          schema_markup: data.schema_markup,
          last_refreshed: new Date().toISOString(),
          refresh_count: (pageItem.refresh_count || 0) + 1,
        })
        .eq("id", pageItem.id);
      if (updateErr) throw updateErr;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-generated-pages"] });
      toast({ title: "Regenerated!" });
    },
    onError: (e: any) => {
      toast({ title: "Regeneration failed", description: e.message, variant: "destructive" });
    },
  });

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4" style={{ marginBottom: 24 }}>
        <h1 className="font-heading italic" style={{ fontSize: 28, fontWeight: 400 }}>Generated Pages</h1>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3" style={{ marginBottom: 20 }}>
        {/* Status tabs */}
        <div className="flex gap-1">
          {STATUSES.map((s) => (
            <button
              key={s}
              onClick={() => { setStatusFilter(s); setPage(0); }}
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
                background: statusFilter === s ? "hsl(var(--admin-accent))" : "transparent",
                color: statusFilter === s ? "hsl(var(--admin-bg))" : "hsl(var(--admin-text-soft))",
                borderColor: statusFilter === s ? "hsl(var(--admin-accent))" : "hsl(var(--admin-border))",
              }}
            >
              {s}
            </button>
          ))}
        </div>

        {/* Content type dropdown */}
        <select
          value={schemaFilter}
          onChange={(e) => { setSchemaFilter(e.target.value); setPage(0); }}
          className="admin-input font-body"
          style={{ fontSize: 12, padding: "6px 10px", minWidth: 140 }}
        >
          <option value="">All Content Types</option>
          {schemas?.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>

        {/* Niche dropdown */}
        <select
          value={nicheFilter}
          onChange={(e) => { setNicheFilter(e.target.value); setPage(0); }}
          className="admin-input font-body"
          style={{ fontSize: 12, padding: "6px 10px", minWidth: 140 }}
        >
          <option value="">All Niches</option>
          {niches?.map((n) => (
            <option key={n.id} value={n.id}>{n.name}</option>
          ))}
        </select>

        {/* Search */}
        <div className="relative flex-1" style={{ minWidth: 180 }}>
          <Search
            size={14}
            style={{
              position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)",
              color: "hsl(var(--admin-text-ghost))",
            }}
          />
          <input
            placeholder="Search pages..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
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
            gridTemplateColumns: "40px 1fr 120px 120px 90px 70px 60px 90px 50px",
            padding: "10px 20px",
            borderBottom: "1px solid hsl(var(--admin-border))",
            backgroundColor: "hsl(var(--admin-surface-2))",
          }}
        >
          <label style={{ cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <input
              type="checkbox"
              checked={allOnPageSelected}
              onChange={toggleAll}
              style={{ accentColor: "hsl(var(--admin-accent))" }}
            />
          </label>
          <span className="admin-label" style={{ marginBottom: 0 }}>Title</span>
          <span className="admin-label" style={{ marginBottom: 0 }}>Niche</span>
          <span className="admin-label" style={{ marginBottom: 0 }}>Type</span>
          <span className="admin-label" style={{ marginBottom: 0 }}>Status</span>
          <button
            onClick={() => handleSort("quality_score")}
            className="admin-label flex items-center gap-1"
            style={{ marginBottom: 0, background: "none", border: "none", cursor: "pointer", padding: 0, color: "inherit" }}
          >
            Score <SortIcon col="quality_score" />
          </button>
          <button
            onClick={() => handleSort("views")}
            className="admin-label flex items-center gap-1"
            style={{ marginBottom: 0, background: "none", border: "none", cursor: "pointer", padding: 0, color: "inherit" }}
          >
            Views <SortIcon col="views" />
          </button>
          <button
            onClick={() => handleSort("created_at")}
            className="admin-label flex items-center gap-1"
            style={{ marginBottom: 0, background: "none", border: "none", cursor: "pointer", padding: 0, color: "inherit" }}
          >
            Date <SortIcon col="created_at" />
          </button>
          <span />
        </div>

        {isLoading && (
          <div style={{ padding: 32, textAlign: "center" }}>
            <span className="font-body" style={{ color: "hsl(var(--admin-text-ghost))" }}>Loading...</span>
          </div>
        )}

        {paginated.map((pg) => {
          const niche = (pg as any).niches;
          const schema = (pg as any).content_schemas;
          const sc = statusColors[pg.status] || statusColors.draft;

          return (
            <div
              key={pg.id}
              className="lg:grid flex flex-col"
              style={{
                gridTemplateColumns: "40px 1fr 120px 120px 90px 70px 60px 90px 50px",
                padding: "12px 20px",
                borderBottom: "1px solid hsl(var(--admin-border))",
                alignItems: "center",
                transition: "background-color 0.15s",
                backgroundColor: selected.has(pg.id) ? "hsl(var(--admin-accent) / 0.06)" : undefined,
              }}
              onMouseEnter={(e) => {
                if (!selected.has(pg.id)) e.currentTarget.style.backgroundColor = "hsl(var(--admin-surface-2))";
              }}
              onMouseLeave={(e) => {
                if (!selected.has(pg.id)) e.currentTarget.style.backgroundColor = "transparent";
              }}
            >
              <label style={{ cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <input
                  type="checkbox"
                  checked={selected.has(pg.id)}
                  onChange={() => toggleOne(pg.id)}
                  style={{ accentColor: "hsl(var(--admin-accent))" }}
                />
              </label>
              <div className="flex items-center gap-2 min-w-0">
                {pg.performance_trend === "needs_refresh" && (
                  <span
                    title="Needs refresh (90+ days old)"
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
                  style={{ fontSize: 13, fontWeight: 500, color: "hsl(var(--admin-text))" }}
                  title={pg.title}
                >
                  {pg.title.length > 50 ? pg.title.slice(0, 50) + "…" : pg.title}
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
              {(() => {
                const idxStatus = indexingMap?.get(pg.id);
                if (!idxStatus) return null;
                const color = idxStatus === "indexed" ? "hsl(var(--admin-sage))" : "hsl(var(--admin-accent))";
                const label = idxStatus === "indexed" ? "Indexed by Google" : "Submitted to Google";
                return <span title={label}><Globe size={12} style={{ color, flexShrink: 0 }} /></span>;
              })()}
              <span className="font-body" style={{ fontSize: 12, color: "hsl(var(--admin-text-soft))" }}>
                {pg.quality_score != null ? Number(pg.quality_score).toFixed(1) : "—"}
              </span>
              <span className="font-body" style={{ fontSize: 12, color: "hsl(var(--admin-text-soft))" }}>
                {pg.views ?? 0}
              </span>
              <span className="font-body" style={{ fontSize: 11, color: "hsl(var(--admin-text-ghost))" }}>
                {timeAgo(pg.created_at)}
              </span>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    style={{ background: "none", border: "none", cursor: "pointer", color: "hsl(var(--admin-text-soft))", padding: 4 }}
                  >
                    <MoreHorizontal size={16} />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" style={{ minWidth: 160 }}>
                  <DropdownMenuItem
                    onClick={() => {
                      const url = `/resources/${schema?.slug || "page"}/${niche?.slug || "general"}`;
                      window.open(url, "_blank");
                    }}
                  >
                    <Eye size={14} className="mr-2" /> Preview
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link to={`/admin/pages/${pg.id}/edit`}>
                      <Pencil size={14} className="mr-2" /> Edit JSON
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => updateStatus.mutate({ ids: [pg.id], status: "published" })}
                  >
                    <ExternalLink size={14} className="mr-2" /> Publish
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => updateStatus.mutate({ ids: [pg.id], status: "archived" })}
                  >
                    <Archive size={14} className="mr-2" /> Archive
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => regenerateMutation.mutate(pg)}>
                    <RefreshCw size={14} className="mr-2" /> Regenerate
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={async () => {
                      toast({ title: "Generating OG image..." });
                      const { data, error } = await supabase.functions.invoke("generate-og-image", { body: { page_id: pg.id } });
                      if (error || data?.error) {
                        toast({ title: "Failed", description: error?.message || data?.error, variant: "destructive" });
                      } else {
                        qc.invalidateQueries({ queryKey: ["admin-generated-pages"] });
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

        {!isLoading && filtered.length === 0 && (
          <div style={{ padding: 40, textAlign: "center" }}>
            <p className="font-body" style={{ fontSize: 13, color: "hsl(var(--admin-text-ghost))" }}>
              No generated pages found.
            </p>
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between" style={{ marginTop: 16 }}>
          <span className="font-body" style={{ fontSize: 12, color: "hsl(var(--admin-text-ghost))" }}>
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
      {selected.size > 0 && (
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
          <span className="font-body" style={{ fontSize: 13, fontWeight: 600, color: "hsl(var(--admin-text))" }}>
            <CheckSquare size={14} style={{ display: "inline", marginRight: 6, verticalAlign: "middle" }} />
            {selected.size} selected
          </span>
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
            style={{ fontSize: 12, padding: "6px 14px", color: "hsl(var(--admin-danger))" }}
          >
            Delete Selected
          </button>
        </div>
      )}

      {/* Delete confirmation */}
      {deleteId && (
        <div
          className="fixed inset-0 flex items-center justify-center z-50"
          style={{ backgroundColor: "rgba(0,0,0,0.6)" }}
        >
          <div className="admin-card" style={{ padding: 32, maxWidth: 380, width: "90%" }}>
            <p className="font-body" style={{ fontSize: 15, marginBottom: 20, color: "hsl(var(--admin-text))" }}>
              Delete this page? This cannot be undone.
            </p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setDeleteId(null)} className="admin-btn-ghost">Cancel</button>
              <button
                onClick={() => deleteMutation.mutate([deleteId])}
                className="admin-btn-primary"
                style={{ background: "hsl(var(--admin-danger))" }}
              >
                {deleteMutation.isPending ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk action confirmation */}
      {bulkAction && (
        <div
          className="fixed inset-0 flex items-center justify-center z-50"
          style={{ backgroundColor: "rgba(0,0,0,0.6)" }}
        >
          <div className="admin-card" style={{ padding: 32, maxWidth: 420, width: "90%" }}>
            <p className="font-body" style={{ fontSize: 15, marginBottom: 20, color: "hsl(var(--admin-text))" }}>
              {bulkAction === "delete"
                ? `Delete ${selected.size} pages? This cannot be undone.`
                : `${bulkAction === "publish" ? "Publish" : "Archive"} ${selected.size} pages?`}
            </p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setBulkAction(null)} className="admin-btn-ghost">Cancel</button>
              <button
                onClick={() => {
                  const ids = Array.from(selected);
                  if (bulkAction === "delete") {
                    deleteMutation.mutate(ids);
                  } else {
                    updateStatus.mutate({ ids, status: bulkAction === "publish" ? "published" : "archived" });
                  }
                }}
                className="admin-btn-primary"
                style={bulkAction === "delete" ? { background: "hsl(var(--admin-danger))" } : {}}
              >
                {(deleteMutation.isPending || updateStatus.isPending) ? "Processing..." : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default GeneratedPagesManager;
