import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Loader2, RefreshCw, Zap, ExternalLink, CheckCircle2, XCircle, Edit3 } from "lucide-react";
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

export default function ContentQueue() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [opps, setOpps] = useState<Opp[]>([]);
  const [queued, setQueued] = useState<QueuedPost[]>([]);

  const load = async () => {
    setLoading(true);
    const [{ data: oppData }, { data: postData }] = await Promise.all([
      supabase.from("content_opportunities").select("*")
        .in("status", ["proposed", "drafting", "rejected"])
        .order("created_at", { ascending: false }).limit(50),
      supabase.from("posts").select("id, title, slug, status, quality_score, originality_score, freshness_hours, lint_flags, source_citations, opportunity_id, created_at")
        .eq("status", "draft").not("opportunity_id", "is", null)
        .order("created_at", { ascending: false }).limit(30),
    ]);
    setOpps((oppData || []) as Opp[]);
    setQueued((postData || []) as QueuedPost[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const runNow = async () => {
    setRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke("daily-content-run", { body: {} });
      if (error) throw error;
      toast({ title: "Pipeline run complete", description: `${data?.log?.steps?.drafts?.length ?? 0} draft(s) queued.` });
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
      toast({ title: "Draft created", description: `Quality ${data?.quality_score}, originality ${data?.originality_score}%.` });
      await load();
    } catch (e: any) {
      toast({ title: "Draft failed", description: e.message, variant: "destructive" });
    }
  };

  const reject = async (id: string, reason: string) => {
    await supabase.from("content_opportunities").update({ status: "rejected", reject_reason: reason }).eq("id", id);
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

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          <h1 className="font-heading italic" style={{ fontSize: 32, color: "hsl(var(--admin-text))", marginBottom: 4 }}>
            Content Queue
          </h1>
          <p className="font-body" style={{ fontSize: 14, color: "hsl(var(--admin-text-ghost))" }}>
            Autonomous engine drafts. Review, edit, publish.
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
            Run pipeline now
          </button>
        </div>
      </div>

      {/* Drafted, awaiting approval */}
      <h2 className="font-heading italic" style={{ fontSize: 20, color: "hsl(var(--admin-text))", marginBottom: 12 }}>
        Ready to publish ({queued.length})
      </h2>
      {queued.length === 0 && !loading && (
        <div style={{ ...cardStyle, textAlign: "center", color: "hsl(var(--admin-text-ghost))", fontSize: 13 }}>
          No drafts waiting. Hit "Run pipeline now" to generate one.
        </div>
      )}
      {queued.map((p) => (
        <div key={p.id} style={cardStyle}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 16, fontWeight: 600, color: "hsl(var(--admin-text))", marginBottom: 6 }}>
                {p.title}
              </div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", fontSize: 12, color: "hsl(var(--admin-text-ghost))", marginBottom: 8 }}>
                <span>Quality: <strong style={{ color: (p.quality_score ?? 0) >= 85 ? "hsl(var(--admin-accent))" : "hsl(var(--admin-text-soft))" }}>{p.quality_score ?? "—"}</strong></span>
                <span>Originality: <strong>{p.originality_score ?? "—"}%</strong></span>
                <span>Fresh: <strong>{p.freshness_hours ?? "—"}h</strong></span>
                <span>Sources: <strong>{(p.source_citations as any[])?.length ?? 0}</strong></span>
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

      {/* Proposed / recent opportunities */}
      <h2 className="font-heading italic" style={{ fontSize: 20, color: "hsl(var(--admin-text))", marginBottom: 12, marginTop: 32 }}>
        Recent opportunities ({opps.length})
      </h2>
      {opps.map((o) => (
        <div key={o.id} style={cardStyle}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: "hsl(var(--admin-text))", marginBottom: 4 }}>{o.angle}</div>
              <div style={{ fontSize: 12, color: "hsl(var(--admin-text-ghost))", marginBottom: 8 }}>
                <span style={{ marginRight: 12 }}>Lane: <strong>{o.topic_lane}</strong></span>
                <span style={{ marginRight: 12 }}>Kw: <strong>{o.target_keyword || "—"}</strong></span>
                <span>Status: <strong style={{ color: o.status === "rejected" ? "hsl(var(--admin-danger))" : "hsl(var(--admin-text-soft))" }}>{o.status}</strong></span>
              </div>
              {o.rationale && <p style={{ fontSize: 13, color: "hsl(var(--admin-text-soft))", marginBottom: 4 }}>{o.rationale}</p>}
              {o.gap_reason && <p style={{ fontSize: 12, color: "hsl(var(--admin-text-ghost))", fontStyle: "italic" }}>Gap: {o.gap_reason}</p>}
              {o.reject_reason && <p style={{ fontSize: 12, color: "hsl(var(--admin-danger))" }}>Rejected: {o.reject_reason}</p>}
              {Array.isArray(o.brief?.sources) && (
                <div style={{ marginTop: 8, fontSize: 11 }}>
                  {o.brief.sources.slice(0, 3).map((s: any) => (
                    <a key={s.url} href={s.url} target="_blank" rel="noopener" style={{ display: "inline-flex", alignItems: "center", gap: 3, color: "hsl(var(--admin-text-ghost))", marginRight: 10, textDecoration: "underline" }}>
                      <ExternalLink size={10} /> {new URL(s.url).hostname.replace(/^www\./, "")}
                    </a>
                  ))}
                </div>
              )}
            </div>
            {o.status === "proposed" && (
              <div style={{ display: "flex", gap: 6, alignItems: "flex-start" }}>
                <button onClick={() => draftOne(o.id)}
                  style={{ padding: "8px 12px", background: "hsl(var(--admin-accent))", border: "none", borderRadius: 6, color: "#1a1208", cursor: "pointer", fontSize: 12, fontWeight: 600 }}>
                  Draft it
                </button>
                <button onClick={() => reject(o.id, "manual reject")}
                  style={{ padding: "8px 12px", background: "transparent", border: "1px solid hsl(var(--admin-border))", borderRadius: 6, color: "hsl(var(--admin-text-ghost))", cursor: "pointer", fontSize: 12, display: "flex", alignItems: "center", gap: 4 }}>
                  <XCircle size={12} /> Reject
                </button>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
