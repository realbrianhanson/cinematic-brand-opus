import { useEffect, useRef, useState } from "react";
import { withTimeout } from "@/lib/withTimeout";
import { errorMessage } from "@/lib/errorMessage";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Send, Trash2 } from "lucide-react";

type Note = {
  id: string;
  note: string;
  topic_hint: string | null;
  created_at: string;
  used_in_post_id: string | null;
};

type NoteAttempt = { id: string; note: string; topic_hint: string | null };

const LANES = ["", "ai_tools", "smb_marketing", "ai_training", "industry"];

export default function BriansNotesWidget() {
  const { toast } = useToast();
  const [note, setNote] = useState("");
  const [hint, setHint] = useState("");
  const [notes, setNotes] = useState<Note[]>([]);
  const savingLock = useRef(false);
  const editRevision = useRef(0);
  // Retain uncertain attempts by their submitted content, even if the owner
  // starts a different note and later returns to retry the original one.
  const attempts = useRef(new Map<string, NoteAttempt>());
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState(false);

  const load = async () => {
    const { data, error } = await supabase
      .from("expert_notes")
      .select("id, note, topic_hint, created_at, used_in_post_id")
      .eq("archived", false)
      .order("created_at", { ascending: false })
      .limit(6);
    setLoadError(!!error);
    if (!error) setNotes((data || []) as Note[]);
  };
  useEffect(() => {
    load();
  }, []);

  const save = async () => {
    if (!note.trim() || savingLock.current) return;
    savingLock.current = true;
    const submittedRevision = editRevision.current;
    const snapshot = { note: note.trim(), topic_hint: hint || null };
    const fingerprint = JSON.stringify(snapshot);
    const previous = attempts.current.get(fingerprint);
    const attempt = previous ?? { id: crypto.randomUUID(), ...snapshot };
    attempts.current.set(fingerprint, attempt);
    const controller = new AbortController();
    const reconcile = async () => {
      const { data, error } = await supabase
        .from("expert_notes")
        .select("id,note,topic_hint")
        .eq("id", attempt.id)
        .maybeSingle();
      controller.signal.throwIfAborted();
      if (error) throw error;
      if (!data) return false;
      if (
        data.id !== attempt.id ||
        data.note !== attempt.note ||
        data.topic_hint !== attempt.topic_hint
      ) {
        throw new Error(
          "This note already exists with different content. Refresh your notes before deciding what to save; nothing was overwritten.",
        );
      }
      return true;
    };
    setSaving(true);
    try {
      await withTimeout(
        (async () => {
          if (previous && (await reconcile())) return;
          controller.signal.throwIfAborted();
          const { error } = await supabase.from("expert_notes").insert(attempt);
          controller.signal.throwIfAborted();
          if (error) {
            // The first request can commit between the retry's read and insert.
            // A duplicate ID is success only after verifying the saved content.
            if (error.code === "23505" && (await reconcile())) return;
            throw error;
          }
        })(),
        20000,
      );
      if (attempts.current.get(fingerprint) === attempt)
        attempts.current.delete(fingerprint);
      if (editRevision.current === submittedRevision) {
        setNote("");
        setHint("");
      }
      toast({ title: "Note saved" });
      void load();
    } catch (error) {
      toast({
        title: "Save not confirmed",
        description: errorMessage(error),
        variant: "destructive",
      });
    } finally {
      controller.abort();
      savingLock.current = false;
      setSaving(false);
    }
  };

  const del = async (id: string) => {
    const { error } = await supabase
      .from("expert_notes")
      .update({ archived: true })
      .eq("id", id)
      .select("id")
      .single();
    if (error) {
      toast({
        title: "Could not archive note",
        description: error.message,
        variant: "destructive",
      });
      return;
    }
    load();
  };

  return (
    <div
      style={{
        backgroundColor: "hsl(var(--admin-surface))",
        border: "1px solid hsl(var(--admin-border))",
        borderRadius: 8,
        padding: 20,
      }}
    >
      <h3
        className="font-heading italic"
        style={{
          fontSize: 18,
          color: "hsl(var(--admin-text))",
          marginBottom: 4,
        }}
      >
        Expert Notes
      </h3>
      <p
        className="font-body"
        style={{
          fontSize: 12,
          color: "hsl(var(--admin-text-ghost))",
          marginBottom: 12,
        }}
      >
        Drop 1-3 sentences. The autonomous engine weaves the freshest matching
        note into every draft's "From the trenches" callout.
      </p>
      {loadError && (
        <p role="alert">
          Notes could not be loaded. <button onClick={load}>Try again</button>
        </p>
      )}
      <textarea
        aria-label="Expert note"
        value={note}
        onChange={(e) => {
          editRevision.current += 1;
          setNote(e.target.value);
        }}
        placeholder="Share a real observation, lesson, or result from your work. Include the context and evidence."
        rows={3}
        style={{
          width: "100%",
          padding: 10,
          fontSize: 13,
          background: "hsl(var(--admin-bg))",
          border: "1px solid hsl(var(--admin-border))",
          borderRadius: 6,
          color: "hsl(var(--admin-text))",
          fontFamily: "inherit",
          resize: "vertical",
        }}
      />
      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        <select
          aria-label="Note topic"
          value={hint}
          onChange={(e) => {
            editRevision.current += 1;
            setHint(e.target.value);
          }}
          style={{
            padding: "8px 10px",
            fontSize: 12,
            background: "hsl(var(--admin-bg))",
            border: "1px solid hsl(var(--admin-border))",
            borderRadius: 6,
            color: "hsl(var(--admin-text-soft))",
          }}
        >
          {LANES.map((l) => (
            <option key={l} value={l}>
              {l || "any lane"}
            </option>
          ))}
        </select>
        <button
          onClick={save}
          disabled={saving || !note.trim()}
          style={{
            padding: "8px 14px",
            background: "hsl(var(--admin-accent))",
            border: "none",
            borderRadius: 6,
            color: "#1a1208",
            cursor: "pointer",
            fontSize: 12,
            fontWeight: 600,
            display: "flex",
            alignItems: "center",
            gap: 4,
          }}
        >
          <Send size={12} /> Save
        </button>
      </div>

      {notes.length > 0 && (
        <div
          style={{
            marginTop: 16,
            borderTop: "1px solid hsl(var(--admin-border))",
            paddingTop: 12,
          }}
        >
          <div
            style={{
              fontSize: 11,
              color: "hsl(var(--admin-text-ghost))",
              marginBottom: 6,
              textTransform: "uppercase",
              letterSpacing: 0.5,
            }}
          >
            Active notes
          </div>
          {notes.map((n) => (
            <div
              key={n.id}
              style={{
                padding: "8px 0",
                borderBottom: "1px solid hsl(var(--admin-border))",
                display: "flex",
                gap: 8,
                alignItems: "flex-start",
              }}
            >
              <div
                style={{
                  flex: 1,
                  fontSize: 12,
                  color: "hsl(var(--admin-text-soft))",
                }}
              >
                {n.topic_hint && (
                  <span
                    style={{
                      color: "hsl(var(--admin-accent))",
                      marginRight: 6,
                      fontWeight: 600,
                    }}
                  >
                    [{n.topic_hint}]
                  </span>
                )}
                {n.note}
                {n.used_in_post_id && (
                  <span
                    style={{
                      color: "hsl(var(--admin-text-ghost))",
                      marginLeft: 6,
                      fontStyle: "italic",
                    }}
                  >
                    · used
                  </span>
                )}
              </div>
              <button
                onClick={() => del(n.id)}
                aria-label="Archive note"
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: "hsl(var(--admin-text-ghost))",
                  padding: 4,
                }}
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
