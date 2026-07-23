import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { safeMutation } from "@/lib/withTimeout";
import { Loader2, Mail, RefreshCw, X } from "lucide-react";

// Returns the current ISO week key (e.g. "2026-W30") in UTC, matching the
// server-side helper in _shared/newsletterCompose.ts.
function currentIsoWeekKey(): string {
  const d = new Date();
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((t.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

interface Blurb { slug: string; blurb: string; }

interface PreviewRow {
  id: string;
  week_key: string;
  status: "preview" | "sent" | "cancelled";
  subject: string | null;
  intro: string | null;
  post_blurbs: Blurb[] | null;
  post_ids: string[] | null;
}

const NewsletterPreviewCard = () => {
  const { toast } = useToast();
  const qc = useQueryClient();
  const weekKey = currentIsoWeekKey();

  const { data: row, isLoading } = useQuery({
    queryKey: ["newsletter-preview", weekKey],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("newsletter_sends")
        .select("id, week_key, status, subject, intro, post_blurbs, post_ids")
        .eq("week_key", weekKey)
        .maybeSingle();
      if (error) throw error;
      return (data as unknown) as PreviewRow | null;
    },
    refetchOnWindowFocus: false,
  });

  const cancelMutation = useMutation({
    mutationFn: () => safeMutation(async () => {
      if (!row?.id) throw new Error("No preview to cancel");
      const { error } = await supabase
        .from("newsletter_sends")
        .update({ status: "cancelled" })
        .eq("id", row.id);
      if (error) throw error;
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["newsletter-preview", weekKey] });
      toast({ title: "Cancelled", description: "This week's newsletter will not send." });
    },
    onError: (e: Error) =>
      toast({ title: "Cancel failed", description: e.message, variant: "destructive" }),
  });

  const regenerateMutation = useMutation({
    mutationFn: () => safeMutation(async () => {
      const { data, error } = await supabase.functions.invoke(
        "compose-weekly-newsletter-preview",
        { body: {} },
      );
      if (error) throw error;
      return data;
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["newsletter-preview", weekKey] });
      toast({ title: "Regenerated", description: "A fresh preview was composed and emailed." });
    },
    onError: (e: Error) =>
      toast({ title: "Regenerate failed", description: e.message, variant: "destructive" }),
  });

  const shell = (children: React.ReactNode) => (
    <div className="admin-card" style={{ padding: 20, marginBottom: 32 }}>
      <div className="flex items-center gap-2" style={{ marginBottom: 12 }}>
        <Mail size={16} style={{ color: "hsl(var(--admin-accent))" }} />
        <span className="font-body" style={{ fontSize: 15, fontWeight: 700, color: "hsl(var(--admin-text))" }}>
          Weekly newsletter — {weekKey}
        </span>
      </div>
      {children}
    </div>
  );

  if (isLoading) {
    return shell(
      <div className="flex items-center gap-2" style={{ color: "hsl(var(--admin-muted))", fontSize: 14 }}>
        <Loader2 size={14} className="animate-spin" /> Loading preview…
      </div>,
    );
  }

  if (!row) {
    return shell(
      <div style={{ fontSize: 14, color: "hsl(var(--admin-muted))" }}>
        No preview yet for this week. Composition runs Monday 14:00 UTC. You can generate one now:
        <div style={{ marginTop: 10 }}>
          <button
            className="admin-btn"
            onClick={() => regenerateMutation.mutate()}
            disabled={regenerateMutation.isPending}
          >
            {regenerateMutation.isPending ? (
              <><Loader2 size={14} className="animate-spin" /> Composing…</>
            ) : (
              <><RefreshCw size={14} /> Compose preview</>
            )}
          </button>
        </div>
      </div>,
    );
  }

  const statusStyles: Record<PreviewRow["status"], { bg: string; fg: string; label: string }> = {
    preview:   { bg: "#3a2f14", fg: "#f5d987", label: "PREVIEW · sends Tuesday" },
    sent:      { bg: "#173a24", fg: "#a5f5c1", label: "SENT" },
    cancelled: { bg: "#3a1717", fg: "#f5a5a5", label: "CANCELLED" },
  };
  const s = statusStyles[row.status];

  return shell(
    <div>
      <div style={{ display: "inline-block", padding: "3px 10px", borderRadius: 4, background: s.bg, color: s.fg, fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", marginBottom: 12 }}>
        {s.label}
      </div>
      <div style={{ fontSize: 17, fontWeight: 700, color: "hsl(var(--admin-text))", marginBottom: 6 }}>
        {row.subject || <em style={{ color: "hsl(var(--admin-muted))" }}>(no subject)</em>}
      </div>
      {row.intro ? (
        <p style={{ fontSize: 14, lineHeight: 1.55, color: "hsl(var(--admin-muted))", margin: "0 0 14px" }}>
          {row.intro}
        </p>
      ) : null}
      {Array.isArray(row.post_blurbs) && row.post_blurbs.length > 0 ? (
        <ol style={{ margin: "0 0 16px", padding: "0 0 0 20px", fontSize: 13, lineHeight: 1.5, color: "hsl(var(--admin-text))" }}>
          {row.post_blurbs.map((b) => (
            <li key={b.slug} style={{ marginBottom: 8 }}>
              <div style={{ fontFamily: "monospace", fontSize: 11, color: "hsl(var(--admin-muted))" }}>{b.slug}</div>
              <div>{b.blurb}</div>
            </li>
          ))}
        </ol>
      ) : null}

      {row.status === "preview" ? (
        <div className="flex gap-2" style={{ marginTop: 8 }}>
          <button
            className="admin-btn"
            onClick={() => {
              if (confirm("Cancel this week's newsletter send?")) cancelMutation.mutate();
            }}
            disabled={cancelMutation.isPending}
          >
            {cancelMutation.isPending ? (
              <><Loader2 size={14} className="animate-spin" /> Cancelling…</>
            ) : (
              <><X size={14} /> Cancel this week's send</>
            )}
          </button>
          <button
            className="admin-btn"
            onClick={() => regenerateMutation.mutate()}
            disabled={regenerateMutation.isPending}
          >
            {regenerateMutation.isPending ? (
              <><Loader2 size={14} className="animate-spin" /> Regenerating…</>
            ) : (
              <><RefreshCw size={14} /> Regenerate</>
            )}
          </button>
        </div>
      ) : null}
    </div>,
  );
};

export default NewsletterPreviewCard;
