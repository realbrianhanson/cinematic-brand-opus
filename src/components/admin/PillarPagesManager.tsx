import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@/lib/router-compat";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, Loader2, Sparkles, Zap } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const PillarPagesManager = () => {
  const { toast } = useToast();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; title: string } | null>(null);
  const [confirmAllMissing, setConfirmAllMissing] = useState(false);
  const [generatingNicheId, setGeneratingNicheId] = useState<string | null>(null);

  const { data: pillars, isLoading } = useQuery({
    queryKey: ["admin-pillars"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pillar_pages")
        .select("*, niches(name)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: linkedCounts } = useQuery({
    queryKey: ["admin-pillar-linked-counts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("generated_pages")
        .select("niche_id")
        .eq("status", "published");
      if (error) throw error;
      const counts: Record<string, number> = {};
      (data ?? []).forEach((p) => {
        if (p.niche_id) counts[p.niche_id] = (counts[p.niche_id] || 0) + 1;
      });
      return counts;
    },
  });

  // Active niches for generate-pillar dropdown/action
  const { data: activeNiches } = useQuery({
    queryKey: ["admin-active-niches-for-pillars"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("niches")
        .select("id, name, slug, context")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const generatePillar = async (nicheId: string, nicheName: string) => {
    setGeneratingNicheId(nicheId);
    try {
      const { data, error } = await supabase.functions.invoke("generate-pillar", {
        body: { niche_id: nicheId },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      toast({
        title: "Pillar generated",
        description: `${nicheName}: score ${data?.score ?? "?"}/100 — ${data?.score >= 75 ? "published" : "saved as draft"}.`,
      });
      qc.invalidateQueries({ queryKey: ["admin-pillars"] });
    } catch (e: any) {
      toast({ title: "Generate failed", description: e.message, variant: "destructive" });
    } finally {
      setGeneratingNicheId(null);
    }
  };

  const generateAllMissing = async () => {
    setConfirmAllMissing(false);
    setGeneratingNicheId("__all__");
    try {
      const { data, error } = await supabase.functions.invoke("generate-pillar", {
        body: { all_missing: true },
      });
      if (error) throw new Error(error.message);
      const results = (data?.results ?? []) as any[];
      const ok = results.filter((r) => r.success).length;
      toast({ title: "Batch complete", description: `${ok}/${results.length} pillars generated.` });
      qc.invalidateQueries({ queryKey: ["admin-pillars"] });
    } catch (e: any) {
      toast({ title: "Batch failed", description: e.message, variant: "destructive" });
    } finally {
      setGeneratingNicheId(null);
    }
  };

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("pillar_pages").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-pillars"] });
      toast({ title: "Pillar page deleted" });
      setDeleteTarget(null);
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const formatDate = (d: string | null) => {
    if (!d) return "—";
    return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  };

  // Compute which active niches don't yet have a pillar
  const nichesWithPillar = new Set((pillars ?? []).map((p: any) => p.niche_id).filter(Boolean));
  const nichesMissingPillar = (activeNiches ?? []).filter((n: any) => !nichesWithPillar.has(n.id));


  return (
    <div>
      <div className="flex items-center justify-between" style={{ marginBottom: 24 }}>
        <h1 className="font-body" style={{ fontSize: 22, fontWeight: 600, color: "hsl(var(--admin-text))" }}>
          Pillar Pages
        </h1>
        <div className="flex items-center gap-2">
          {nichesMissingPillar.length > 0 && (
            <button
              onClick={() => setConfirmAllMissing(true)}
              disabled={!!generatingNicheId}
              className="admin-btn-secondary font-body"
              style={{ display: "inline-flex", alignItems: "center" }}
            >
              <Zap size={14} style={{ marginRight: 6 }} />
              Generate All Missing ({nichesMissingPillar.length})
            </button>
          )}
          <Link to="/admin/pillars/new" className="admin-btn-primary font-body" style={{ textDecoration: "none" }}>
            <Plus size={14} style={{ marginRight: 6 }} /> New Pillar
          </Link>
        </div>
      </div>

      {/* Per-niche generate buttons for niches without a pillar */}
      {nichesMissingPillar.length > 0 && (
        <div className="admin-card font-body" style={{ padding: 16, marginBottom: 20 }}>
          <p style={{ fontSize: 12, fontWeight: 600, color: "hsl(var(--admin-text-ghost))", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 10 }}>
            Niches without a pillar page
          </p>
          <div className="flex flex-wrap gap-2">
            {nichesMissingPillar.map((n: any) => {
              const busy = generatingNicheId === n.id || generatingNicheId === "__all__";
              const targetKw = (n.context as any)?.target_keyword;
              return (
                <button
                  key={n.id}
                  onClick={() => generatePillar(n.id, n.name)}
                  disabled={!!generatingNicheId}
                  title={targetKw ? `Target: ${targetKw}` : "No target_keyword set on niche"}
                  className="font-body"
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 6,
                    fontSize: 12, padding: "6px 12px",
                    border: "1px solid hsl(var(--admin-border))",
                    borderRadius: 6,
                    background: "hsl(var(--admin-surface))",
                    color: "hsl(var(--admin-text))",
                    cursor: busy ? "wait" : "pointer",
                    opacity: busy ? 0.6 : 1,
                  }}
                >
                  {busy ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                  Generate: {n.name}
                </button>
              );
            })}
          </div>
        </div>
      )}


      {isLoading ? (
        <div className="flex justify-center" style={{ padding: 60 }}>
          <Loader2 size={24} className="animate-spin" style={{ color: "hsl(var(--admin-text-ghost))" }} />
        </div>
      ) : !pillars?.length ? (
        <div className="admin-card font-body" style={{ padding: 40, textAlign: "center", color: "hsl(var(--admin-text-ghost))", fontSize: 13 }}>
          No pillar pages yet. Create one to anchor your content clusters.
        </div>
      ) : (
        <div className="admin-card" style={{ overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                {["Title", "Niche", "Status", "Linked Pages", "Published", "Actions"].map((h) => (
                  <th key={h} className="font-body" style={{
                    textAlign: "left", padding: "12px 14px", fontSize: 11, fontWeight: 600,
                    textTransform: "uppercase", letterSpacing: "0.05em",
                    color: "hsl(var(--admin-text-ghost))",
                    borderBottom: "1px solid hsl(var(--admin-border))",
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pillars.map((p: any) => (
                <tr key={p.id} style={{ borderBottom: "1px solid hsl(var(--admin-border))" }}>
                  <td className="font-body" style={{ padding: "12px 14px", fontSize: 13, fontWeight: 500, color: "hsl(var(--admin-text))" }}>
                    {p.title}
                  </td>
                  <td style={{ padding: "12px 14px" }}>
                    <span className="font-body" style={{
                      fontSize: 11, padding: "2px 8px", borderRadius: 999,
                      backgroundColor: "hsl(var(--admin-accent) / 0.1)",
                      color: "hsl(var(--admin-accent))",
                    }}>
                      {p.niches?.name ?? "—"}
                    </span>
                  </td>
                  <td style={{ padding: "12px 14px" }}>
                    <span className="font-body" style={{
                      fontSize: 10, padding: "2px 8px", borderRadius: 999,
                      backgroundColor: p.status === "published" ? "hsl(var(--admin-sage) / 0.12)" : "hsl(var(--admin-text-ghost) / 0.15)",
                      color: p.status === "published" ? "hsl(var(--admin-sage))" : "hsl(var(--admin-text-ghost))",
                    }}>
                      {p.status}
                    </span>
                  </td>
                  <td className="font-body" style={{ padding: "12px 14px", fontSize: 12, color: "hsl(var(--admin-text-soft))" }}>
                    {p.niche_id ? (linkedCounts?.[p.niche_id] ?? 0) : 0}
                  </td>
                  <td className="font-body" style={{ padding: "12px 14px", fontSize: 12, color: "hsl(var(--admin-text-ghost))" }}>
                    {formatDate(p.published_at)}
                  </td>
                  <td style={{ padding: "12px 14px" }}>
                    <div className="flex items-center gap-1">
                      <button onClick={() => navigate(`/admin/pillars/${p.id}/edit`)} style={iconBtnStyle}>
                        <Pencil size={13} />
                      </button>
                      <button
                        onClick={() => setDeleteTarget({ id: p.id, title: p.title })}
                        style={iconBtnStyle}
                        onMouseEnter={(e) => (e.currentTarget.style.color = "hsl(var(--admin-danger))")}
                        onMouseLeave={(e) => (e.currentTarget.style.color = "hsl(var(--admin-text-ghost))")}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent style={{ backgroundColor: "hsl(var(--admin-surface))", border: "1px solid hsl(var(--admin-border))", color: "hsl(var(--admin-text))" }}>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-body">Delete "{deleteTarget?.title}"?</AlertDialogTitle>
            <AlertDialogDescription className="font-body" style={{ color: "hsl(var(--admin-text-soft))" }}>
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="font-body" style={{ border: "1px solid hsl(var(--admin-border))", background: "none", color: "hsl(var(--admin-text-soft))" }}>Cancel</AlertDialogCancel>
            <AlertDialogAction className="font-body" onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)} style={{ backgroundColor: "hsl(var(--admin-danger))", color: "#fff", border: "none" }}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmAllMissing} onOpenChange={setConfirmAllMissing}>
        <AlertDialogContent style={{ backgroundColor: "hsl(var(--admin-surface))", border: "1px solid hsl(var(--admin-border))", color: "hsl(var(--admin-text))" }}>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-body">Generate {nichesMissingPillar.length} pillar pages?</AlertDialogTitle>
            <AlertDialogDescription className="font-body" style={{ color: "hsl(var(--admin-text-soft))" }}>
              Runs the full research + voice pipeline for every active niche without a pillar. This uses AI credits and takes several minutes.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="font-body" style={{ border: "1px solid hsl(var(--admin-border))", background: "none", color: "hsl(var(--admin-text-soft))" }}>Cancel</AlertDialogCancel>
            <AlertDialogAction className="font-body" onClick={generateAllMissing} style={{ backgroundColor: "hsl(var(--admin-accent))", color: "#fff", border: "none" }}>Generate all</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  );
};

const iconBtnStyle: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", padding: 6, borderRadius: 4,
  border: "none", background: "none", color: "hsl(var(--admin-text-ghost))",
  cursor: "pointer", transition: "color 0.2s",
};

export default PillarPagesManager;
