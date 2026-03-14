import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Eye, MousePointerClick, RefreshCw, FileText, Globe, Send, AlertTriangle, TrendingUp, ArrowRight } from "lucide-react";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";

type DateRange = "7d" | "30d" | "90d";

const PseoDashboard = () => {
  const { toast } = useToast();
  const [range, setRange] = useState<DateRange>("30d");
  const [sendingReport, setSendingReport] = useState(false);

  const daysAgo = range === "7d" ? 7 : range === "30d" ? 30 : 90;
  const sinceDate = new Date(Date.now() - daysAgo * 86400000).toISOString();

  // === Queries ===
  const { data: publishedPages } = useQuery({
    queryKey: ["pseo-published"],
    queryFn: async () => {
      const { count } = await supabase.from("generated_pages").select("id", { count: "exact", head: true }).eq("status", "published");
      return count ?? 0;
    },
  });

  const { data: totalViews } = useQuery({
    queryKey: ["pseo-views", range],
    queryFn: async () => {
      const { data } = await supabase.from("generated_pages").select("views").eq("status", "published");
      return (data ?? []).reduce((s, p) => s + (p.views ?? 0), 0);
    },
  });

  const { data: ctaClicks } = useQuery({
    queryKey: ["pseo-cta", range],
    queryFn: async () => {
      const { count } = await supabase.from("cta_events").select("id", { count: "exact", head: true }).eq("event_type", "click").gte("created_at", sinceDate);
      return count ?? 0;
    },
  });

  const { data: needsRefresh } = useQuery({
    queryKey: ["pseo-refresh"],
    queryFn: async () => {
      const { count } = await supabase.from("generated_pages").select("id", { count: "exact", head: true }).eq("performance_trend", "needs_refresh");
      return count ?? 0;
    },
  });

  // Views over time from page_engagement
  const { data: viewsOverTime } = useQuery({
    queryKey: ["pseo-views-time", range],
    queryFn: async () => {
      const { data } = await supabase.from("page_engagement").select("created_at").eq("event_type", "view").gte("created_at", sinceDate).order("created_at");
      if (!data?.length) return [];
      const buckets: Record<string, number> = {};
      for (const row of data) {
        const d = new Date(row.created_at!);
        const weekStart = new Date(d);
        weekStart.setDate(d.getDate() - d.getDay());
        const key = weekStart.toISOString().slice(0, 10);
        buckets[key] = (buckets[key] || 0) + 1;
      }
      return Object.entries(buckets).sort().map(([date, views]) => ({ date, views }));
    },
  });

  // Content type performance
  const { data: contentTypePerf } = useQuery({
    queryKey: ["pseo-ct-perf"],
    queryFn: async () => {
      const { data } = await supabase.from("generated_pages").select("views, content_schema_id, content_schemas(name)").eq("status", "published");
      if (!data?.length) return [];
      const agg: Record<string, { name: string; views: number }> = {};
      for (const p of data) {
        const name = (p as any).content_schemas?.name || "Unknown";
        const id = p.content_schema_id || "unknown";
        if (!agg[id]) agg[id] = { name, views: 0 };
        agg[id].views += p.views ?? 0;
      }
      return Object.values(agg).sort((a, b) => b.views - a.views);
    },
  });

  // Top 10 pages
  const { data: topPages } = useQuery({
    queryKey: ["pseo-top-pages"],
    queryFn: async () => {
      const { data } = await supabase
        .from("generated_pages")
        .select("id, title, views, slug, niche_id, niches!generated_pages_niche_id_fkey(name), content_schema_id, content_schemas(slug)")
        .eq("status", "published")
        .order("views", { ascending: false })
        .limit(10);
      return data ?? [];
    },
  });

  // CTA clicks per page for top pages
  const { data: ctaByPage } = useQuery({
    queryKey: ["pseo-cta-by-page"],
    queryFn: async () => {
      const { data } = await supabase.from("cta_events").select("page_id").eq("event_type", "click");
      const counts: Record<string, number> = {};
      for (const r of data ?? []) {
        if (r.page_id) counts[r.page_id] = (counts[r.page_id] || 0) + 1;
      }
      return counts;
    },
  });

  // Top niches
  const { data: topNiches } = useQuery({
    queryKey: ["pseo-top-niches"],
    queryFn: async () => {
      const { data: pages } = await supabase.from("generated_pages").select("id, views, niche_id, niches!generated_pages_niche_id_fkey(name)").eq("status", "published");
      const { data: clicks } = await supabase.from("cta_events").select("page_id, niche_slug").eq("event_type", "click");
      if (!pages?.length) return [];
      const clicksByPage: Record<string, number> = {};
      for (const c of clicks ?? []) {
        if (c.page_id) clicksByPage[c.page_id] = (clicksByPage[c.page_id] || 0) + 1;
      }
      const agg: Record<string, { name: string; pages: number; views: number; clicks: number }> = {};
      for (const p of pages) {
        const nId = p.niche_id || "unknown";
        const name = (p as any).niches?.name || "Unknown";
        if (!agg[nId]) agg[nId] = { name, pages: 0, views: 0, clicks: 0 };
        agg[nId].pages++;
        agg[nId].views += p.views ?? 0;
        agg[nId].clicks += clicksByPage[p.id] || 0;
      }
      return Object.values(agg).sort((a, b) => b.views - a.views);
    },
  });

  // Indexing funnel
  const { data: indexingFunnel } = useQuery({
    queryKey: ["pseo-indexing-funnel"],
    queryFn: async () => {
      const { count: published } = await supabase.from("generated_pages").select("id", { count: "exact", head: true }).eq("status", "published");
      const { count: submitted } = await supabase.from("indexing_log").select("id", { count: "exact", head: true });
      const { count: indexed } = await supabase.from("indexing_log").select("id", { count: "exact", head: true }).eq("status", "indexed");
      return { published: published ?? 0, submitted: submitted ?? 0, indexed: indexed ?? 0 };
    },
  });

  // Alerts data
  const { data: alertData } = useQuery({
    queryKey: ["pseo-alerts"],
    queryFn: async () => {
      const { data: allPublished } = await supabase.from("generated_pages").select("id").eq("status", "published");
      const { data: allSubmitted } = await supabase.from("indexing_log").select("page_id");
      const submittedIds = new Set((allSubmitted ?? []).map(l => l.page_id));
      const notSubmitted = (allPublished ?? []).filter(p => !submittedIds.has(p.id)).length;

      const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();
      const { count: staleSubmissions } = await supabase.from("indexing_log").select("id", { count: "exact", head: true }).eq("status", "submitted").lt("submitted_at", thirtyDaysAgo);

      const { count: refreshNeeded } = await supabase.from("generated_pages").select("id", { count: "exact", head: true }).eq("performance_trend", "needs_refresh");

      return { notSubmitted, staleSubmissions: staleSubmissions ?? 0, refreshNeeded: refreshNeeded ?? 0 };
    },
  });

  // Best niche
  const bestNiche = useMemo(() => {
    if (!topNiches?.length) return null;
    const withConversion = topNiches.filter(n => n.views > 0).map(n => ({ ...n, rate: n.clicks / n.views }));
    if (withConversion.length < 2) return null;
    const avg = withConversion.reduce((s, n) => s + n.rate, 0) / withConversion.length;
    const best = withConversion.sort((a, b) => b.rate - a.rate)[0];
    if (best.rate > avg * 1.5) return best;
    return null;
  }, [topNiches]);

  const handleSubmitAll = async () => {
    try {
      const { error } = await supabase.functions.invoke("submit-to-google", { body: { all_unsubmitted: true } });
      if (error) throw error;
      toast({ title: "Submitted", description: "All unsubmitted pages have been sent to Google." });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const handleRefreshStale = async () => {
    try {
      const { error } = await supabase.functions.invoke("refresh-stale-content", { body: {} });
      if (error) throw error;
      toast({ title: "Refresh started", description: "Stale content is being refreshed." });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const handleSendReport = async () => {
    setSendingReport(true);
    try {
      const { data, error } = await supabase.functions.invoke("weekly-report", { body: { manual: true } });
      if (error) throw error;
      toast({ title: "Report sent", description: data?.message || "Weekly report has been sent." });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setSendingReport(false);
    }
  };

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4" style={{ marginBottom: 28 }}>
        <div>
          <h1 className="font-body" style={{ fontSize: 22, fontWeight: 600, color: "hsl(var(--admin-text))" }}>
            pSEO Performance
          </h1>
          <p className="font-body" style={{ fontSize: 13, color: "hsl(var(--admin-text-ghost))", marginTop: 4 }}>
            Last {daysAgo} days
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div style={{ display: "flex", borderRadius: 6, overflow: "hidden", border: "1px solid hsl(var(--admin-border))" }}>
            {(["7d", "30d", "90d"] as DateRange[]).map(r => (
              <button
                key={r}
                onClick={() => setRange(r)}
                className="font-body"
                style={{
                  padding: "6px 14px", fontSize: 12, border: "none", cursor: "pointer",
                  backgroundColor: range === r ? "hsl(var(--admin-accent))" : "transparent",
                  color: range === r ? "hsl(var(--admin-accent-fg))" : "hsl(var(--admin-text-soft))",
                  fontWeight: range === r ? 600 : 400,
                }}
              >
                {r}
              </button>
            ))}
          </div>
          <button
            className="admin-btn-primary font-body"
            onClick={handleSendReport}
            disabled={sendingReport}
            style={{ fontSize: 12, padding: "6px 14px" }}
          >
            {sendingReport ? <Loader2 size={14} className="animate-spin" style={{ marginRight: 6 }} /> : <Send size={14} style={{ marginRight: 6 }} />}
            Send Test Report
          </button>
        </div>
      </div>

      {/* Row 1: Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16, marginBottom: 24 }}>
        <StatCard icon={<FileText size={18} />} label="Published Pages" value={publishedPages ?? 0} />
        <StatCard icon={<Eye size={18} />} label="Total Views" value={totalViews ?? 0} />
        <StatCard icon={<MousePointerClick size={18} />} label="CTA Clicks" value={ctaClicks ?? 0} />
        <StatCard icon={<RefreshCw size={18} />} label="Needs Refresh" value={needsRefresh ?? 0} accent={needsRefresh && needsRefresh > 0} />
      </div>

      {/* Row 2: Charts */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 24 }}>
        <div className="admin-card" style={{ padding: 20 }}>
          <h3 className="font-body" style={{ fontSize: 14, fontWeight: 600, color: "hsl(var(--admin-text))", marginBottom: 16 }}>
            Views Over Time
          </h3>
          <div style={{ height: 240 }}>
            {viewsOverTime?.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={viewsOverTime}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--admin-border))" />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: "hsl(var(--admin-text-ghost))" }} tickFormatter={d => new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" })} />
                  <YAxis tick={{ fontSize: 10, fill: "hsl(var(--admin-text-ghost))" }} />
                  <Tooltip contentStyle={{ backgroundColor: "hsl(var(--admin-surface))", border: "1px solid hsl(var(--admin-border))", borderRadius: 6, fontSize: 12 }} />
                  <Line type="monotone" dataKey="views" stroke="hsl(var(--admin-accent))" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full">
                <span className="font-body" style={{ fontSize: 12, color: "hsl(var(--admin-text-ghost))" }}>No view data yet</span>
              </div>
            )}
          </div>
        </div>

        <div className="admin-card" style={{ padding: 20 }}>
          <h3 className="font-body" style={{ fontSize: 14, fontWeight: 600, color: "hsl(var(--admin-text))", marginBottom: 16 }}>
            Content Type Performance
          </h3>
          <div style={{ height: 240 }}>
            {contentTypePerf?.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={contentTypePerf} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--admin-border))" />
                  <XAxis type="number" tick={{ fontSize: 10, fill: "hsl(var(--admin-text-ghost))" }} />
                  <YAxis dataKey="name" type="category" tick={{ fontSize: 10, fill: "hsl(var(--admin-text-ghost))" }} width={100} />
                  <Tooltip contentStyle={{ backgroundColor: "hsl(var(--admin-surface))", border: "1px solid hsl(var(--admin-border))", borderRadius: 6, fontSize: 12 }} />
                  <Bar dataKey="views" fill="hsl(var(--admin-accent))" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full">
                <span className="font-body" style={{ fontSize: 12, color: "hsl(var(--admin-text-ghost))" }}>No data yet</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Row 3: Tables */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 24 }}>
        {/* Top Pages */}
        <div className="admin-card" style={{ padding: 20 }}>
          <h3 className="font-body" style={{ fontSize: 14, fontWeight: 600, color: "hsl(var(--admin-text))", marginBottom: 16 }}>
            Top 10 Pages
          </h3>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  {["Title", "Niche", "Views", "Clicks"].map(h => (
                    <th key={h} className="font-body" style={{ fontSize: 11, fontWeight: 500, color: "hsl(var(--admin-text-ghost))", textAlign: "left", padding: "6px 8px", borderBottom: "1px solid hsl(var(--admin-border))" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(topPages ?? []).map(p => {
                  const ctSlug = (p as any).content_schemas?.slug;
                  const nSlug = (p as any).niches?.name;
                  return (
                    <tr key={p.id}>
                      <td className="font-body" style={{ fontSize: 12, padding: "8px", color: "hsl(var(--admin-text-soft))", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", borderBottom: "1px solid hsl(var(--admin-border))" }}>
                        <a href={`/resources/${ctSlug}/${p.slug}`} target="_blank" rel="noopener" style={{ color: "hsl(var(--admin-accent))", textDecoration: "none" }}>{p.title}</a>
                      </td>
                      <td className="font-body" style={{ fontSize: 12, padding: "8px", color: "hsl(var(--admin-text-ghost))", borderBottom: "1px solid hsl(var(--admin-border))" }}>{nSlug || "—"}</td>
                      <td className="font-body" style={{ fontSize: 12, padding: "8px", color: "hsl(var(--admin-text-soft))", borderBottom: "1px solid hsl(var(--admin-border))" }}>{(p.views ?? 0).toLocaleString()}</td>
                      <td className="font-body" style={{ fontSize: 12, padding: "8px", color: "hsl(var(--admin-text-soft))", borderBottom: "1px solid hsl(var(--admin-border))" }}>{(ctaByPage?.[p.id] ?? 0).toLocaleString()}</td>
                    </tr>
                  );
                })}
                {(!topPages?.length) && (
                  <tr><td colSpan={4} className="font-body" style={{ fontSize: 12, color: "hsl(var(--admin-text-ghost))", padding: 16, textAlign: "center" }}>No pages yet</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Top Niches */}
        <div className="admin-card" style={{ padding: 20 }}>
          <h3 className="font-body" style={{ fontSize: 14, fontWeight: 600, color: "hsl(var(--admin-text))", marginBottom: 16 }}>
            Top Niches
          </h3>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  {["Niche", "Pages", "Views", "Clicks", "Conv %"].map(h => (
                    <th key={h} className="font-body" style={{ fontSize: 11, fontWeight: 500, color: "hsl(var(--admin-text-ghost))", textAlign: "left", padding: "6px 8px", borderBottom: "1px solid hsl(var(--admin-border))" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(topNiches ?? []).map((n, i) => (
                  <tr key={n.name} style={i < 3 ? { backgroundColor: "hsl(var(--admin-sage) / 0.06)" } : undefined}>
                    <td className="font-body" style={{ fontSize: 12, padding: "8px", color: "hsl(var(--admin-text-soft))", borderBottom: "1px solid hsl(var(--admin-border))" }}>{n.name}</td>
                    <td className="font-body" style={{ fontSize: 12, padding: "8px", color: "hsl(var(--admin-text-ghost))", borderBottom: "1px solid hsl(var(--admin-border))" }}>{n.pages}</td>
                    <td className="font-body" style={{ fontSize: 12, padding: "8px", color: "hsl(var(--admin-text-soft))", borderBottom: "1px solid hsl(var(--admin-border))" }}>{n.views.toLocaleString()}</td>
                    <td className="font-body" style={{ fontSize: 12, padding: "8px", color: "hsl(var(--admin-text-soft))", borderBottom: "1px solid hsl(var(--admin-border))" }}>{n.clicks}</td>
                    <td className="font-body" style={{ fontSize: 12, padding: "8px", color: "hsl(var(--admin-text-soft))", borderBottom: "1px solid hsl(var(--admin-border))" }}>{n.views > 0 ? ((n.clicks / n.views) * 100).toFixed(1) + "%" : "—"}</td>
                  </tr>
                ))}
                {(!topNiches?.length) && (
                  <tr><td colSpan={5} className="font-body" style={{ fontSize: 12, color: "hsl(var(--admin-text-ghost))", padding: 16, textAlign: "center" }}>No data yet</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Row 4: Indexing Funnel */}
      <div className="admin-card" style={{ padding: 20, marginBottom: 24 }}>
        <h3 className="font-body" style={{ fontSize: 14, fontWeight: 600, color: "hsl(var(--admin-text))", marginBottom: 16 }}>
          Indexing Funnel
        </h3>
        <div className="flex items-center justify-center gap-6 flex-wrap" style={{ padding: "12px 0" }}>
          <FunnelStep label="Published" value={indexingFunnel?.published ?? 0} color="hsl(var(--admin-accent))" />
          <ArrowRight size={18} style={{ color: "hsl(var(--admin-text-ghost))" }} />
          <FunnelStep label="Submitted" value={indexingFunnel?.submitted ?? 0} color="hsl(var(--admin-sage))" />
          <ArrowRight size={18} style={{ color: "hsl(var(--admin-text-ghost))" }} />
          <FunnelStep label="Indexed" value={indexingFunnel?.indexed ?? 0} color="hsl(120 60% 45%)" />
        </div>
      </div>

      {/* Row 5: Alerts */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {alertData && alertData.notSubmitted > 0 && (
          <AlertCard
            type="info"
            message={`${alertData.notSubmitted} pages not submitted to Google yet`}
            action="Submit All"
            onAction={handleSubmitAll}
          />
        )}
        {alertData && alertData.staleSubmissions > 0 && (
          <AlertCard
            type="warning"
            message={`${alertData.staleSubmissions} pages haven't been indexed after 30 days`}
            action="Resubmit"
            onAction={handleSubmitAll}
          />
        )}
        {alertData && alertData.refreshNeeded > 0 && (
          <AlertCard
            type="warning"
            message={`${alertData.refreshNeeded} pages need content refresh`}
            action="Auto-Refresh"
            onAction={handleRefreshStale}
          />
        )}
        {bestNiche && (
          <AlertCard
            type="success"
            message={`${bestNiche.name} is your highest-converting niche — consider adding more content types`}
          />
        )}
      </div>
    </div>
  );
};

const StatCard = ({ icon, label, value, accent }: { icon: React.ReactNode; label: string; value: number; accent?: boolean | number | null }) => (
  <div className="admin-card" style={{ padding: 20 }}>
    <div className="flex items-center gap-3">
      <div style={{ color: accent ? "hsl(var(--admin-danger))" : "hsl(var(--admin-accent))" }}>{icon}</div>
      <div>
        <div className="font-body" style={{ fontSize: 24, fontWeight: 700, color: "hsl(var(--admin-text))" }}>{value.toLocaleString()}</div>
        <div className="font-body" style={{ fontSize: 12, color: "hsl(var(--admin-text-ghost))" }}>{label}</div>
      </div>
    </div>
  </div>
);

const FunnelStep = ({ label, value, color }: { label: string; value: number; color: string }) => (
  <div style={{ textAlign: "center" }}>
    <div className="font-body" style={{ fontSize: 28, fontWeight: 700, color }}>{value}</div>
    <div className="font-body" style={{ fontSize: 12, color: "hsl(var(--admin-text-ghost))" }}>{label}</div>
  </div>
);

const AlertCard = ({ type, message, action, onAction }: { type: "info" | "warning" | "success"; message: string; action?: string; onAction?: () => void }) => {
  const borderColor = type === "info" ? "hsl(var(--admin-accent))" : type === "warning" ? "hsl(40 90% 50%)" : "hsl(var(--admin-sage))";
  const Icon = type === "warning" ? AlertTriangle : type === "success" ? TrendingUp : Globe;
  return (
    <div className="admin-card flex items-center justify-between" style={{ padding: "14px 20px", borderLeft: `3px solid ${borderColor}` }}>
      <div className="flex items-center gap-3">
        <Icon size={16} style={{ color: borderColor, flexShrink: 0 }} />
        <span className="font-body" style={{ fontSize: 13, color: "hsl(var(--admin-text-soft))" }}>{message}</span>
      </div>
      {action && onAction && (
        <button
          onClick={onAction}
          className="font-body"
          style={{
            fontSize: 12, fontWeight: 500, padding: "6px 14px", borderRadius: 6,
            backgroundColor: "hsl(var(--admin-accent) / 0.12)", color: "hsl(var(--admin-accent))",
            border: "none", cursor: "pointer", whiteSpace: "nowrap",
          }}
        >
          {action}
        </button>
      )}
    </div>
  );
};

export default PseoDashboard;
