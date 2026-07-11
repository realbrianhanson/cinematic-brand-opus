import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Loader2, RefreshCw, Zap, ExternalLink, CheckCircle2, XCircle, Edit3, Radio, AlertTriangle, Clock, Trash2 } from "lucide-react";
import { useNavigate } from "react-router-dom";

type Opp = {
  id: string;
  angle: string;
  target_keyword: string | null;
  topic_lane: string;
  status: string;
  opportunity_score: number;
  rationale: string | null;
  gap_reason: string | null;
  reject_reason: string | null;
  last_error: string | null;
  attempts: number;
  last_attempt_at: string | null;
  brief: any;
  created_at: string;
};

type QueuedPost = {
  id: string;
  title: string;
  slug: string;
  status: string;
  quality_score: number | null;
  originality_score: number | null;
  freshness_hours: number | null;
  lint_flags: any;
  source_citations: any;
  opportunity_id: string | null;
  created_at: string;
};

type SourceItem = {
  id: string;
  url: string;
  title: string | null;
  topic_lane: string | null;
  status: string;
  published_at: string | null;
  fetched_at: string;
};

const STATUS_COLOR: Record<string, string> = {
  proposed: "hsl(var(--admin-text-soft))",
  drafting: "hsl(var(--admin-accent))",
  queued: "hsl(var(--admin-accent))",
  published: "hsl(var(--admin-success, var(--admin-accent)))",
  rejected: "hsl(var(--admin-danger))",
};

function timeAgo(iso: string | null): string {
  if (!iso) return "—";
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}

export default function ContentQueue() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [opps, setOpps] = useState<Opp[]>([]);
  const [queued, setQueued] = useState<QueuedPost[]>([]);
  const [items, setItems] = useState<SourceItem[]>([]);
  const [live, setLive] = useState(false);

  const load = async () => {
    setLoading(true);
    const [{ data: oppData }, { data: postData }, { data: itemData }] = await Promise.all([
      supabase.from("content_opportunities").select("*")
        .order("created_at", { ascending: false }).limit(80),
      supabase.from("posts").select("id, title, slug, status, quality_score, originality_score, freshness_hours, lint_flags, source_citations, opportunity_id, created_at")
        .eq("status", "draft").not("opportunity_id", "is", null)
        .order("created_at", { ascending: false }).limit(30),
      supabase.from("source_items").select("id, url, title, topic_lane, status, published_at, fetched_at")
        .order("fetched_at", { ascending: false }).limit(50),
    ]);
    setOpps((oppData || []) as Opp[]);
    setQueued((postData || []) as QueuedPost[]);
    setItems((itemData || []) as SourceItem[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  // Realtime subscriptions
  useEffect(() => {
    const channel = supabase
      .channel("content-queue")
      .on("postgres_changes", { event: "*", schema: "public", table: "content_opportunities" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "source_items" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "posts" }, () => load())
      .subscribe((s) => setLive(s === "SUBSCRIBED"));
    return () => { supabase.removeChannel(channel); };
  }, []);

  const runNow = async () => {
    setRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke("daily-content-run", { body: {} });
      if (error) throw error;
      toast({ title: "Pipeline run complete", description: `${data?.drafted ?? 0} draft(s) queued.` });
      await load();
    } catch (e: any) {
      toast({ title: "Run failed", description: e.message, variant: "destructive" });
    } finally {
      setRunning(false);
    }
  };

  const draftOne = async (id: string) => {
    try {
      const { data, error } = await supabase.functions.invoke("draft-from-opportunity", { body: { opportunity_id: id } });
      if (error) throw error;
      toast({ title: "Draft attempt complete", description: `Quality ${data?.quality_score ?? "—"}, originality ${data?.originality_score ?? "—"}%.` });
      await load();
    } catch (e: any) {
      toast({ title: "Draft failed", description: e.message, variant: "destructive" });
    }
  };

  const retry = async (id: string) => {
    await supabase.from("content_opportunities").update({ status: "proposed", attempts: 0, last_error: null, reject_reason: null }).eq("id", id);
    await load();
  };

  const reject = async (id: string, reason: string) => {
    await supabase.from("content_opportunities").update({ status: "rejected", reject_reason: reason }).eq("id", id);
    await load();
  };

  const deleteOpp = async (id: string) => {
    if (!confirm("Delete this opportunity? This cannot be undone.")) return;
    const { error } = await supabase.from("content_opportunities").delete().eq("id", id);
    if (error) { toast({ title: "Delete failed", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Deleted" });
    await load();
  };

  const deleteItem = async (id: string) => {
    if (!confirm("Delete this signal?")) return;
    const { error } = await supabase.from("source_items").delete().eq("id", id);
    if (error) { toast({ title: "Delete failed", description: error.message, variant: "destructive" }); return; }
    await load();
  };

  const publish = async (postId: string, oppId: string | null) => {
    const { error } = await supabase.from("posts").update({ status: "published" }).eq("id", postId);
    if (error) { toast({ title: "Publish failed", description: error.message, variant: "destructive" }); return; }
    if (oppId) await supabase.from("content_opportunities").update({ status: "published" }).eq("id", oppId);
    toast({ title: "Published" });
    await load();
  };

  const cardStyle: React.CSSProperties = {
    backgroundColor: "hsl(var(--admin-surface))",
    border: "1px solid hsl(var(--admin-border))",
    borderRadius: 8,
    padding: 20,
    marginBottom: 12,
  };

  // Aggregates
  const counts = opps.reduce((acc: Record<string, number>, o) => {
    acc[o.status] = (acc[o.status] || 0) + 1; return acc;
  }, {});
  const newItems = items.filter((i) => i.status === "new").length;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          <h1 className="font-heading italic" style={{ fontSize: 32, color: "hsl(var(--admin-text))", marginBottom: 4 }}>
            Content Queue
          </h1>
          <p className="font-body" style={{ fontSize: 14, color: "hsl(var(--admin-text-ghost))", display: "flex", alignItems: "center", gap: 8 }}>
            <Radio size={12} style={{ color: live ? "hsl(var(--admin-accent))" : "hsl(var(--admin-text-ghost))" }} />
            {live ? "Live — auto-updating" : "Connecting…"} · Pipeline runs every 30 min autonomously.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={load} disabled={loading}
            style={{ padding: "10px 14px", background: "transparent", border: "1px solid hsl(var(--admin-border))", borderRadius: 6, color: "hsl(var(--admin-text-soft))", cursor: "pointer", display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> Refresh
          </button>
          <button onClick={runNow} disabled={running}
            style={{ padding: "10px 16px", background: "hsl(var(--admin-accent))", border: "none", borderRadius: 6, color: "#1a1208", cursor: "pointer", display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600 }}>
            {running ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
            Run now
          </button>
        </div>
      </div>

      {/* Stats strip */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10, marginBottom: 24 }}>
        {[
          { label: "New signals", value: newItems },
          { label: "Proposed", value: counts.proposed || 0 },
          { label: "Drafting", value: counts.drafting || 0 },
          { label: "Ready", value: queued.length },
          { label: "Rejected (24h)", value: opps.filter((o) => o.status === "rejected" && Date.now() - new Date(o.created_at).getTime() < 86400000).length },
        ].map((s) => (
          <div key={s.label} style={{ ...cardStyle, marginBottom: 0, padding: 14, textAlign: "center" }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: "hsl(var(--admin-text))" }}>{s.value}</div>
            <div style={{ fontSize: 11, color: "hsl(var(--admin-text-ghost))", textTransform: "uppercase", letterSpacing: 0.5 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Ready */}
      <h2 className="font-heading italic" style={{ fontSize: 20, color: "hsl(var(--admin-text))", marginBottom: 12 }}>
        Ready to publish ({queued.length})
      </h2>
      {queued.length === 0 && !loading && (
        <div style={{ ...cardStyle, textAlign: "center", color: "hsl(var(--admin-text-ghost))", fontSize: 13 }}>
          No drafts waiting. The pipeline runs every 30 minutes; new drafts will appear here automatically.
        </div>
      )}
      {queued.map((p) => (
        <div key={p.id} style={cardStyle}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 16, fontWeight: 600, color: "hsl(var(--admin-text))", marginBottom: 6 }}>{p.title}</div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", fontSize: 12, color: "hsl(var(--admin-text-ghost))", marginBottom: 8 }}>
                <span>Quality: <strong style={{ color: (p.quality_score ?? 0) >= 85 ? "hsl(var(--admin-accent))" : "hsl(var(--admin-text-soft))" }}>{p.quality_score ?? "—"}</strong></span>
                <span>Originality: <strong>{p.originality_score ?? "—"}%</strong></span>
                <span>Fresh: <strong>{p.freshness_hours ?? "—"}h</strong></span>
                <span>Sources: <strong>{(p.source_citations as any[])?.length ?? 0}</strong></span>
                <span>Created {timeAgo(p.created_at)}</span>
                {Array.isArray(p.lint_flags) && p.lint_flags.length > 0 && (
                  <span style={{ color: "hsl(var(--admin-danger))" }}>Lint: {p.lint_flags.length}</span>
                )}
              </div>
            </div>
            <div style={{ display: "flex", gap: 6, alignItems: "flex-start" }}>
              <button onClick={() => navigate(`/admin/posts/${p.id}/edit`)}
                style={{ padding: "8px 12px", background: "transparent", border: "1px solid hsl(var(--admin-border))", borderRadius: 6, color: "hsl(var(--admin-text-soft))", cursor: "pointer", fontSize: 12, display: "flex", alignItems: "center", gap: 4 }}>
                <Edit3 size={12} /> Edit
              </button>
              <button onClick={() => publish(p.id, p.opportunity_id)}
                style={{ padding: "8px 12px", background: (p.quality_score ?? 0) >= 85 ? "hsl(var(--admin-accent))" : "transparent", border: `1px solid ${(p.quality_score ?? 0) >= 85 ? "hsl(var(--admin-accent))" : "hsl(var(--admin-border))"}`, borderRadius: 6, color: (p.quality_score ?? 0) >= 85 ? "#1a1208" : "hsl(var(--admin-text-soft))", cursor: "pointer", fontSize: 12, fontWeight: 600, display: "flex", alignItems: "center", gap: 4 }}>
                <CheckCircle2 size={12} /> Publish
              </button>
            </div>
          </div>
        </div>
      ))}

      {/* Opportunities pipeline */}
      <h2 className="font-heading italic" style={{ fontSize: 20, color: "hsl(var(--admin-text))", marginBottom: 12, marginTop: 32 }}>
        Pipeline ({opps.length})
      </h2>
      {opps.map((o) => (
        <div key={o.id} style={cardStyle}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: "hsl(var(--admin-text))", marginBottom: 4 }}>{o.angle}</div>
              <div style={{ fontSize: 12, color: "hsl(var(--admin-text-ghost))", marginBottom: 8, display: "flex", gap: 12, flexWrap: "wrap" }}>
                <span>Status: <strong style={{ color: STATUS_COLOR[o.status] || "hsl(var(--admin-text-soft))" }}>{o.status}</strong></span>
                <span>Lane: <strong>{o.topic_lane}</strong></span>
                <span>Kw: <strong>{o.target_keyword || "—"}</strong></span>
                <span>Attempts: <strong>{o.attempts ?? 0}</strong></span>
                <span><Clock size={10} style={{ display: "inline", marginRight: 3 }} />{timeAgo(o.created_at)}</span>
                {o.last_attempt_at && <span>Last try {timeAgo(o.last_attempt_at)}</span>}
              </div>
              {o.rationale && <p style={{ fontSize: 13, color: "hsl(var(--admin-text-soft))", marginBottom: 4 }}>{o.rationale}</p>}
              {o.gap_reason && <p style={{ fontSize: 12, color: "hsl(var(--admin-text-ghost))", fontStyle: "italic" }}>Gap: {o.gap_reason}</p>}
              {o.reject_reason && (
                <p style={{ fontSize: 12, color: "hsl(var(--admin-danger))", display: "flex", alignItems: "center", gap: 4 }}>
                  <XCircle size={11} /> Rejected: {o.reject_reason}
                </p>
              )}
              {o.last_error && o.status !== "rejected" && (
                <p style={{ fontSize: 12, color: "hsl(var(--admin-danger))", display: "flex", alignItems: "center", gap: 4 }}>
                  <AlertTriangle size={11} /> Last error: {o.last_error}
                </p>
              )}
              {Array.isArray(o.brief?.sources) && (
                <div style={{ marginTop: 8, fontSize: 11 }}>
                  {o.brief.sources.slice(0, 3).map((s: any) => (
                    <a key={s.url} href={s.url} target="_blank" rel="noopener" style={{ display: "inline-flex", alignItems: "center", gap: 3, color: "hsl(var(--admin-text-ghost))", marginRight: 10, textDecoration: "underline" }}>
                      <ExternalLink size={10} /> {(() => { try { return new URL(s.url).hostname.replace(/^www\./, ""); } catch { return s.url; } })()}
                    </a>
                  ))}
                </div>
              )}
            </div>
            <div style={{ display: "flex", gap: 6, alignItems: "flex-start", flexDirection: "column" }}>
              {o.status === "proposed" && (
                <button onClick={() => draftOne(o.id)}
                  style={{ padding: "8px 12px", background: "hsl(var(--admin-accent))", border: "none", borderRadius: 6, color: "#1a1208", cursor: "pointer", fontSize: 12, fontWeight: 600 }}>
                  Draft now
                </button>
              )}
              {o.status === "rejected" && (
                <button onClick={() => retry(o.id)}
                  style={{ padding: "8px 12px", background: "transparent", border: "1px solid hsl(var(--admin-border))", borderRadius: 6, color: "hsl(var(--admin-text-soft))", cursor: "pointer", fontSize: 12 }}>
                  Retry
                </button>
              )}
              {o.status !== "rejected" && o.status !== "published" && (
                <button onClick={() => reject(o.id, "manual reject")}
                  style={{ padding: "8px 12px", background: "transparent", border: "1px solid hsl(var(--admin-border))", borderRadius: 6, color: "hsl(var(--admin-text-ghost))", cursor: "pointer", fontSize: 12, display: "flex", alignItems: "center", gap: 4 }}>
                  <XCircle size={12} /> Reject
                </button>
              )}
              <button onClick={() => deleteOpp(o.id)}
                style={{ padding: "8px 12px", background: "transparent", border: "1px solid hsl(var(--admin-danger))", borderRadius: 6, color: "hsl(var(--admin-danger))", cursor: "pointer", fontSize: 12, display: "flex", alignItems: "center", gap: 4 }}>
                <Trash2 size={12} /> Delete
              </button>
            </div>
          </div>
        </div>
      ))}

      {/* Raw source items */}
      <h2 className="font-heading italic" style={{ fontSize: 20, color: "hsl(var(--admin-text))", marginBottom: 12, marginTop: 32 }}>
        Latest signals ({items.length})
      </h2>
      <div style={cardStyle}>
        {items.length === 0 && <div style={{ fontSize: 13, color: "hsl(var(--admin-text-ghost))", textAlign: "center" }}>No news items polled yet.</div>}
        {items.map((i) => (
          <div key={i.id} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid hsl(var(--admin-border))", gap: 12, fontSize: 13 }}>
            <div style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              <a href={i.url} target="_blank" rel="noopener" style={{ color: "hsl(var(--admin-text))", textDecoration: "none" }}>
                {i.title || i.url}
              </a>
              <span style={{ marginLeft: 8, fontSize: 11, color: "hsl(var(--admin-text-ghost))" }}>· {i.topic_lane} · {timeAgo(i.published_at || i.fetched_at)}</span>
            </div>
            <span style={{ fontSize: 11, color: STATUS_COLOR[i.status] || "hsl(var(--admin-text-ghost))", textTransform: "uppercase" }}>{i.status}</span>
            <button onClick={() => deleteItem(i.id)} title="Delete signal"
              style={{ background: "transparent", border: "none", color: "hsl(var(--admin-text-ghost))", cursor: "pointer", padding: 2, display: "flex", alignItems: "center" }}>
              <Trash2 size={12} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
