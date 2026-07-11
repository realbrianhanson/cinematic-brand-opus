import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Send, Trash2 } from "lucide-react";

type Note = { id: string; note: string; topic_hint: string | null; created_at: string; used_in_post_id: string | null };

const LANES = ["", "ai_tools", "smb_marketing", "ai_training", "industry"];

export default function BriansNotesWidget() {
  const { toast } = useToast();
  const [note, setNote] = useState("");
  const [hint, setHint] = useState("");
  const [notes, setNotes] = useState<Note[]>([]);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const { data } = await supabase
      .from("expert_notes")
      .select("id, note, topic_hint, created_at, used_in_post_id")
      .eq("archived", false)
      .order("created_at", { ascending: false })
      .limit(6);
    setNotes((data || []) as Note[]);
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!note.trim()) return;
    setSaving(true);
    const { error } = await supabase.from("expert_notes").insert({
      note: note.trim(), topic_hint: hint || null,
    });
    setSaving(false);
    if (error) { toast({ title: "Save failed", description: error.message, variant: "destructive" }); return; }
    setNote(""); setHint("");
    toast({ title: "Note saved" });
    load();
  };

  const del = async (id: string) => {
    await supabase.from("expert_notes").update({ archived: true }).eq("id", id);
    load();
  };

  return (
    <div style={{
      backgroundColor: "hsl(var(--admin-surface))",
      border: "1px solid hsl(var(--admin-border))",
      borderRadius: 8,
      padding: 20,
    }}>
      <h3 className="font-heading italic" style={{ fontSize: 18, color: "hsl(var(--admin-text))", marginBottom: 4 }}>
        Brian's Notes
      </h3>
      <p className="font-body" style={{ fontSize: 12, color: "hsl(var(--admin-text-ghost))", marginBottom: 12 }}>
        Drop 1-3 sentences. The autonomous engine weaves the freshest matching note into every draft's "From the trenches" callout.
      </p>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Yesterday a plumber I coached went from 4 to 11 leads a week just by putting AI-drafted follow-up texts on a 2-minute delay..."
        rows={3}
        style={{
          width: "100%", padding: 10, fontSize: 13,
          background: "hsl(var(--admin-bg))", border: "1px solid hsl(var(--admin-border))",
          borderRadius: 6, color: "hsl(var(--admin-text))", fontFamily: "inherit", resize: "vertical",
        }}
      />
      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        <select value={hint} onChange={(e) => setHint(e.target.value)}
          style={{ padding: "8px 10px", fontSize: 12, background: "hsl(var(--admin-bg))", border: "1px solid hsl(var(--admin-border))", borderRadius: 6, color: "hsl(var(--admin-text-soft))" }}>
          {LANES.map((l) => <option key={l} value={l}>{l || "any lane"}</option>)}
        </select>
        <button onClick={save} disabled={saving || !note.trim()}
          style={{ padding: "8px 14px", background: "hsl(var(--admin-accent))", border: "none", borderRadius: 6, color: "#1a1208", cursor: "pointer", fontSize: 12, fontWeight: 600, display: "flex", alignItems: "center", gap: 4 }}>
          <Send size={12} /> Save
        </button>
      </div>

      {notes.length > 0 && (
        <div style={{ marginTop: 16, borderTop: "1px solid hsl(var(--admin-border))", paddingTop: 12 }}>
          <div style={{ fontSize: 11, color: "hsl(var(--admin-text-ghost))", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5 }}>
            Active notes
          </div>
          {notes.map((n) => (
            <div key={n.id} style={{ padding: "8px 0", borderBottom: "1px solid hsl(var(--admin-border))", display: "flex", gap: 8, alignItems: "flex-start" }}>
              <div style={{ flex: 1, fontSize: 12, color: "hsl(var(--admin-text-soft))" }}>
                {n.topic_hint && <span style={{ color: "hsl(var(--admin-accent))", marginRight: 6, fontWeight: 600 }}>[{n.topic_hint}]</span>}
                {n.note}
                {n.used_in_post_id && <span style={{ color: "hsl(var(--admin-text-ghost))", marginLeft: 6, fontStyle: "italic" }}>· used</span>}
              </div>
              <button onClick={() => del(n.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "hsl(var(--admin-text-ghost))", padding: 4 }}>
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
