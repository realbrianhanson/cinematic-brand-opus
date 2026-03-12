import { useState, useRef, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Plus, Search, Loader2, Pencil, Trash2, Upload, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Switch } from "@/components/ui/switch";

const slugify = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

interface NicheContext {
  audience?: string;
  pain_points?: string;
  monetization?: string;
  content_that_works?: string;
  subtopics?: string[];
  ai_opportunities?: string;
  keywords_seed?: string[];
}

interface NicheForm {
  name: string;
  slug: string;
  parent_niche_id: string;
  is_active: boolean;
  context: NicheContext;
}

const emptyForm: NicheForm = {
  name: "",
  slug: "",
  parent_niche_id: "",
  is_active: true,
  context: {
    audience: "",
    pain_points: "",
    monetization: "",
    content_that_works: "",
    subtopics: [],
    ai_opportunities: "",
    keywords_seed: [],
  },
};

const NichesManager = () => {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<NicheForm>({ ...emptyForm });
  const [subtopicInput, setSubtopicInput] = useState("");
  const [keywordInput, setKeywordInput] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string; pageCount: number } | null>(null);
  const [slugManual, setSlugManual] = useState(false);

  // CSV import state
  const [csvModalOpen, setCsvModalOpen] = useState(false);
  const [csvRows, setCsvRows] = useState<Record<string, string>[]>([]);
  const [csvImporting, setCsvImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const { data: niches, isLoading } = useQuery({
    queryKey: ["admin-niches"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("niches")
        .select("*")
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: pageCounts } = useQuery({
    queryKey: ["admin-niche-page-counts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("generated_pages")
        .select("niche_id");
      if (error) throw error;
      const counts: Record<string, number> = {};
      (data ?? []).forEach((p) => {
        if (p.niche_id) counts[p.niche_id] = (counts[p.niche_id] || 0) + 1;
      });
      return counts;
    },
  });

  const filtered = useMemo(() => {
    if (!niches) return [];
    if (!search.trim()) return niches;
    const q = search.toLowerCase();
    return niches.filter(
      (n) => n.name.toLowerCase().includes(q) || n.slug.toLowerCase().includes(q)
    );
  }, [niches, search]);

  const activeCount = niches?.filter((n) => n.is_active).length ?? 0;
  const inactiveCount = (niches?.length ?? 0) - activeCount;

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        name: form.name,
        slug: form.slug,
        parent_niche_id: form.parent_niche_id || null,
        is_active: form.is_active,
        context: form.context as any,
      };
      if (editingId) {
        const { error } = await supabase.from("niches").update(payload).eq("id", editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("niches").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-niches"] });
      toast({ title: editingId ? "Niche updated" : "Niche created" });
      closeModal();
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("niches").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-niches"] });
      toast({ title: "Niche deleted" });
      setDeleteTarget(null);
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const openNew = () => {
    setEditingId(null);
    setForm({ ...emptyForm, context: { ...emptyForm.context, subtopics: [], keywords_seed: [] } });
    setSlugManual(false);
    setSubtopicInput("");
    setKeywordInput("");
    setModalOpen(true);
  };

  const openEdit = (niche: any) => {
    const ctx = (niche.context ?? {}) as NicheContext;
    setEditingId(niche.id);
    setForm({
      name: niche.name,
      slug: niche.slug,
      parent_niche_id: niche.parent_niche_id ?? "",
      is_active: niche.is_active ?? true,
      context: {
        audience: ctx.audience ?? "",
        pain_points: ctx.pain_points ?? "",
        monetization: ctx.monetization ?? "",
        content_that_works: ctx.content_that_works ?? "",
        subtopics: ctx.subtopics ?? [],
        ai_opportunities: ctx.ai_opportunities ?? "",
        keywords_seed: ctx.keywords_seed ?? [],
      },
    });
    setSlugManual(true);
    setSubtopicInput("");
    setKeywordInput("");
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditingId(null);
  };

  const updateName = (val: string) => {
    setForm((p) => ({ ...p, name: val, slug: slugManual ? p.slug : slugify(val) }));
  };

  const addTag = (type: "subtopics" | "keywords_seed", value: string, setter: (v: string) => void) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    const list = form.context[type] ?? [];
    if (!list.includes(trimmed)) {
      setForm((p) => ({
        ...p,
        context: { ...p.context, [type]: [...(p.context[type] ?? []), trimmed] },
      }));
    }
    setter("");
  };

  const removeTag = (type: "subtopics" | "keywords_seed", idx: number) => {
    setForm((p) => ({
      ...p,
      context: { ...p.context, [type]: (p.context[type] ?? []).filter((_, i) => i !== idx) },
    }));
  };

  // CSV handling
  const handleCsvFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
      if (lines.length < 2) return;
      const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
      const rows = lines.slice(1).map((line) => {
        const vals = line.split(",").map((v) => v.trim());
        const row: Record<string, string> = {};
        headers.forEach((h, i) => (row[h] = vals[i] ?? ""));
        return row;
      });
      setCsvRows(rows);
      setCsvModalOpen(true);
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const importCsv = async () => {
    setCsvImporting(true);
    try {
      const payload = csvRows.map((r) => ({
        name: r.name || "Untitled",
        slug: slugify(r.name || "untitled"),
        is_active: true,
        context: {
          audience: r.audience || "",
          pain_points: r.pain_points || "",
          monetization: r.monetization || "",
          content_that_works: r.content_that_works || "",
          subtopics: r.subtopics ? r.subtopics.split("|").map((s) => s.trim()).filter(Boolean) : [],
          ai_opportunities: "",
          keywords_seed: [],
        },
      }));
      const { error } = await supabase.from("niches").insert(payload);
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ["admin-niches"] });
      toast({ title: `Imported ${payload.length} niches` });
      setCsvModalOpen(false);
      setCsvRows([]);
    } catch (err: any) {
      toast({ title: "Import failed", description: err.message, variant: "destructive" });
    } finally {
      setCsvImporting(false);
    }
  };

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3" style={{ marginBottom: 20 }}>
        <h1 className="font-body" style={{ fontSize: 22, fontWeight: 600, color: "hsl(var(--admin-text))" }}>
          Niche Taxonomy
        </h1>
        <div className="flex items-center gap-2">
          <input type="file" ref={fileRef} accept=".csv" onChange={handleCsvFile} className="hidden" />
          <button
            onClick={() => fileRef.current?.click()}
            className="font-body"
            style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              padding: "8px 14px", fontSize: 12, borderRadius: 6,
              border: "1px solid hsl(var(--admin-border))", background: "none",
              color: "hsl(var(--admin-text-soft))", cursor: "pointer",
            }}
          >
            <Upload size={14} /> Import CSV
          </button>
          <button className="admin-btn-primary font-body" onClick={openNew}>
            <Plus size={14} style={{ marginRight: 6 }} /> Add Niche
          </button>
        </div>
      </div>

      {/* Search */}
      <div style={{ position: "relative", maxWidth: 340, marginBottom: 20 }}>
        <Search size={14} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "hsl(var(--admin-text-ghost))" }} />
        <input
          className="admin-input font-body"
          style={{ paddingLeft: 34, width: "100%" }}
          placeholder="Search niches..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Stats */}
      <div className="flex gap-4 flex-wrap" style={{ marginBottom: 24 }}>
        {[
          { label: "Total Niches", value: niches?.length ?? 0 },
          { label: "Active", value: activeCount },
          { label: "Inactive", value: inactiveCount },
        ].map((s) => (
          <div
            key={s.label}
            className="admin-card font-body"
            style={{ padding: "12px 20px", display: "flex", alignItems: "center", gap: 10 }}
          >
            <span style={{ fontSize: 20, fontWeight: 700, color: "hsl(var(--admin-text))" }}>{s.value}</span>
            <span style={{ fontSize: 12, color: "hsl(var(--admin-text-ghost))" }}>{s.label}</span>
          </div>
        ))}
      </div>

      {/* Grid */}
      {isLoading ? (
        <div className="flex justify-center" style={{ padding: 60 }}>
          <Loader2 size={24} className="animate-spin" style={{ color: "hsl(var(--admin-text-ghost))" }} />
        </div>
      ) : filtered.length === 0 ? (
        <div className="admin-card font-body" style={{ padding: 40, textAlign: "center", color: "hsl(var(--admin-text-ghost))", fontSize: 13 }}>
          {search ? "No niches match your search." : "No niches yet. Create your first niche to get started."}
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 16 }}>
          {filtered.map((niche) => {
            const ctx = (niche.context ?? {}) as NicheContext;
            const count = pageCounts?.[niche.id] ?? 0;
            return (
              <div key={niche.id} className="admin-card" style={{ padding: 20, display: "flex", flexDirection: "column", gap: 10 }}>
                <div className="flex items-start justify-between gap-2">
                  <div style={{ minWidth: 0 }}>
                    <span className="font-body" style={{ fontSize: 16, fontWeight: 600, color: "hsl(var(--admin-text))" }}>
                      {niche.name}
                    </span>
                    <span
                      className="admin-badge font-body"
                      style={{
                        marginLeft: 8, fontSize: 10, padding: "2px 8px", borderRadius: 999,
                        backgroundColor: niche.is_active
                          ? "hsl(var(--admin-sage) / 0.12)"
                          : "hsl(var(--admin-text-ghost) / 0.15)",
                        color: niche.is_active ? "hsl(var(--admin-sage))" : "hsl(var(--admin-text-ghost))",
                      }}
                    >
                      {niche.is_active ? "Active" : "Inactive"}
                    </span>
                  </div>
                </div>
                <span className="font-body" style={{ fontSize: 12, color: "hsl(var(--admin-text-ghost))" }}>
                  /{niche.slug}
                </span>
                {ctx.audience && (
                  <p className="font-body" style={{ fontSize: 12, color: "hsl(var(--admin-text-soft))", lineHeight: 1.4 }}>
                    {ctx.audience.length > 80 ? ctx.audience.slice(0, 80) + "…" : ctx.audience}
                  </p>
                )}
                <div className="flex items-center justify-between" style={{ marginTop: "auto", paddingTop: 8, borderTop: "1px solid hsl(var(--admin-border))" }}>
                  <span className="font-body" style={{ fontSize: 11, color: "hsl(var(--admin-text-ghost))" }}>
                    {count} page{count !== 1 ? "s" : ""} generated
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => openEdit(niche)}
                      className="font-body"
                      style={{
                        display: "inline-flex", alignItems: "center", gap: 4,
                        fontSize: 12, padding: "5px 10px", borderRadius: 4,
                        border: "1px solid hsl(var(--admin-border))", background: "none",
                        color: "hsl(var(--admin-text-soft))", cursor: "pointer",
                      }}
                    >
                      <Pencil size={12} /> Edit
                    </button>
                    <button
                      onClick={() => setDeleteTarget({ id: niche.id, name: niche.name, pageCount: count })}
                      style={{
                        display: "inline-flex", alignItems: "center",
                        padding: 5, borderRadius: 4, border: "none", background: "none",
                        color: "hsl(var(--admin-text-ghost))", cursor: "pointer", transition: "color 0.2s",
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.color = "hsl(var(--admin-danger))")}
                      onMouseLeave={(e) => (e.currentTarget.style.color = "hsl(var(--admin-text-ghost))")}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add/Edit Modal */}
      <Dialog open={modalOpen} onOpenChange={(o) => !o && closeModal()}>
        <DialogContent
          className="admin-card"
          style={{
            maxWidth: 560, maxHeight: "85vh", overflowY: "auto",
            backgroundColor: "hsl(var(--admin-surface))",
            border: "1px solid hsl(var(--admin-border))",
            color: "hsl(var(--admin-text))",
          }}
        >
          <DialogHeader>
            <DialogTitle className="font-body" style={{ fontSize: 16, fontWeight: 600, color: "hsl(var(--admin-text))" }}>
              {editingId ? "Edit Niche" : "Add Niche"}
            </DialogTitle>
          </DialogHeader>

          <div style={{ display: "flex", flexDirection: "column", gap: 14, padding: "8px 0" }}>
            <ModalField label="Name">
              <input className="admin-input font-body" value={form.name} onChange={(e) => updateName(e.target.value)} />
            </ModalField>
            <ModalField label="Slug">
              <input
                className="admin-input font-body"
                value={form.slug}
                onChange={(e) => { setSlugManual(true); setForm((p) => ({ ...p, slug: e.target.value })); }}
              />
            </ModalField>
            <ModalField label="Parent Niche (optional)">
              <select
                className="admin-input font-body"
                value={form.parent_niche_id}
                onChange={(e) => setForm((p) => ({ ...p, parent_niche_id: e.target.value }))}
              >
                <option value="">None</option>
                {(niches ?? []).filter((n) => n.id !== editingId).map((n) => (
                  <option key={n.id} value={n.id}>{n.name}</option>
                ))}
              </select>
            </ModalField>
            <div className="flex items-center gap-3">
              <Switch checked={form.is_active} onCheckedChange={(v) => setForm((p) => ({ ...p, is_active: v }))} />
              <span className="font-body" style={{ fontSize: 13, color: "hsl(var(--admin-text-soft))" }}>Active</span>
            </div>

            <div style={{ borderTop: "1px solid hsl(var(--admin-border))", margin: "6px 0" }} />
            <span className="admin-label" style={{ fontSize: 12 }}>Niche Context</span>

            <ModalField label="Audience">
              <textarea className="admin-input font-body" rows={3} placeholder="Who is the target audience in this niche?"
                value={form.context.audience ?? ""} onChange={(e) => setForm((p) => ({ ...p, context: { ...p.context, audience: e.target.value } }))} style={{ resize: "vertical" }} />
            </ModalField>
            <ModalField label="Pain Points">
              <textarea className="admin-input font-body" rows={3} placeholder="What are their biggest frustrations?"
                value={form.context.pain_points ?? ""} onChange={(e) => setForm((p) => ({ ...p, context: { ...p.context, pain_points: e.target.value } }))} style={{ resize: "vertical" }} />
            </ModalField>
            <ModalField label="Monetization">
              <textarea className="admin-input font-body" rows={3} placeholder="How do they make money?"
                value={form.context.monetization ?? ""} onChange={(e) => setForm((p) => ({ ...p, context: { ...p.context, monetization: e.target.value } }))} style={{ resize: "vertical" }} />
            </ModalField>
            <ModalField label="Content That Works">
              <textarea className="admin-input font-body" rows={3} placeholder="What content formats resonate?"
                value={form.context.content_that_works ?? ""} onChange={(e) => setForm((p) => ({ ...p, context: { ...p.context, content_that_works: e.target.value } }))} style={{ resize: "vertical" }} />
            </ModalField>
            <ModalField label="Subtopics">
              <TagInput
                tags={form.context.subtopics ?? []}
                inputValue={subtopicInput}
                onInputChange={setSubtopicInput}
                onAdd={() => addTag("subtopics", subtopicInput, setSubtopicInput)}
                onRemove={(i) => removeTag("subtopics", i)}
                placeholder="budget, luxury, commercial..."
              />
            </ModalField>
            <ModalField label="AI Opportunities">
              <textarea className="admin-input font-body" rows={3} placeholder="How can AI specifically help this niche?"
                value={form.context.ai_opportunities ?? ""} onChange={(e) => setForm((p) => ({ ...p, context: { ...p.context, ai_opportunities: e.target.value } }))} style={{ resize: "vertical" }} />
            </ModalField>
            <ModalField label="Seed Keywords">
              <TagInput
                tags={form.context.keywords_seed ?? []}
                inputValue={keywordInput}
                onInputChange={setKeywordInput}
                onAdd={() => addTag("keywords_seed", keywordInput, setKeywordInput)}
                onRemove={(i) => removeTag("keywords_seed", i)}
                placeholder="keyword1, keyword2..."
              />
            </ModalField>
          </div>

          <DialogFooter className="flex gap-2 justify-end" style={{ paddingTop: 12 }}>
            <button
              onClick={closeModal}
              className="font-body"
              style={{
                padding: "8px 16px", fontSize: 13, borderRadius: 6,
                border: "1px solid hsl(var(--admin-border))", background: "none",
                color: "hsl(var(--admin-text-soft))", cursor: "pointer",
              }}
            >
              Cancel
            </button>
            <button
              className="admin-btn-primary font-body"
              onClick={() => saveMutation.mutate()}
              disabled={!form.name.trim() || saveMutation.isPending}
            >
              {saveMutation.isPending && <Loader2 size={14} className="animate-spin" style={{ marginRight: 6 }} />}
              Save Niche
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent style={{ backgroundColor: "hsl(var(--admin-surface))", border: "1px solid hsl(var(--admin-border))", color: "hsl(var(--admin-text))" }}>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-body">Delete "{deleteTarget?.name}"?</AlertDialogTitle>
            <AlertDialogDescription className="font-body" style={{ color: "hsl(var(--admin-text-soft))" }}>
              {(deleteTarget?.pageCount ?? 0) > 0
                ? `Warning: This niche has ${deleteTarget?.pageCount} generated page(s). Deleting it may orphan those pages.`
                : "This action cannot be undone."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="font-body" style={{ border: "1px solid hsl(var(--admin-border))", background: "none", color: "hsl(var(--admin-text-soft))" }}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="font-body"
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
              style={{ backgroundColor: "hsl(var(--admin-danger))", color: "#fff", border: "none" }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* CSV Preview Modal */}
      <Dialog open={csvModalOpen} onOpenChange={(o) => !o && setCsvModalOpen(false)}>
        <DialogContent
          className="admin-card"
          style={{
            maxWidth: 700, maxHeight: "80vh", overflowY: "auto",
            backgroundColor: "hsl(var(--admin-surface))",
            border: "1px solid hsl(var(--admin-border))",
            color: "hsl(var(--admin-text))",
          }}
        >
          <DialogHeader>
            <DialogTitle className="font-body" style={{ fontSize: 16, fontWeight: 600, color: "hsl(var(--admin-text))" }}>
              Import Preview — {csvRows.length} row(s)
            </DialogTitle>
          </DialogHeader>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  {csvRows[0] && Object.keys(csvRows[0]).map((h) => (
                    <th key={h} className="font-body" style={{ textAlign: "left", padding: "6px 10px", borderBottom: "1px solid hsl(var(--admin-border))", color: "hsl(var(--admin-text-ghost))", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {csvRows.slice(0, 20).map((row, i) => (
                  <tr key={i}>
                    {Object.values(row).map((v, j) => (
                      <td key={j} className="font-body" style={{ padding: "6px 10px", borderBottom: "1px solid hsl(var(--admin-border))", color: "hsl(var(--admin-text-soft))", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {v}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {csvRows.length > 20 && (
              <p className="font-body" style={{ fontSize: 11, color: "hsl(var(--admin-text-ghost))", padding: "8px 10px" }}>
                Showing first 20 of {csvRows.length} rows
              </p>
            )}
          </div>
          <DialogFooter className="flex gap-2 justify-end" style={{ paddingTop: 12 }}>
            <button
              onClick={() => { setCsvModalOpen(false); setCsvRows([]); }}
              className="font-body"
              style={{ padding: "8px 16px", fontSize: 13, borderRadius: 6, border: "1px solid hsl(var(--admin-border))", background: "none", color: "hsl(var(--admin-text-soft))", cursor: "pointer" }}
            >
              Cancel
            </button>
            <button className="admin-btn-primary font-body" onClick={importCsv} disabled={csvImporting}>
              {csvImporting && <Loader2 size={14} className="animate-spin" style={{ marginRight: 6 }} />}
              Import {csvRows.length} Niches
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

const ModalField = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div>
    <span className="admin-label">{label}</span>
    <div style={{ marginTop: 5 }}>{children}</div>
  </div>
);

const TagInput = ({
  tags, inputValue, onInputChange, onAdd, onRemove, placeholder,
}: {
  tags: string[]; inputValue: string; onInputChange: (v: string) => void;
  onAdd: () => void; onRemove: (i: number) => void; placeholder: string;
}) => (
  <div>
    {tags.length > 0 && (
      <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 8 }}>
        {tags.map((t, i) => (
          <span
            key={i}
            className="font-body"
            style={{
              display: "inline-flex", alignItems: "center", gap: 4,
              fontSize: 11, padding: "3px 8px", borderRadius: 999,
              backgroundColor: "hsl(var(--admin-surface-2))",
              color: "hsl(var(--admin-text-soft))",
              border: "1px solid hsl(var(--admin-border))",
            }}
          >
            {t}
            <button onClick={() => onRemove(i)} style={{ background: "none", border: "none", cursor: "pointer", padding: 0, display: "flex" }}>
              <X size={10} style={{ color: "hsl(var(--admin-text-ghost))" }} />
            </button>
          </span>
        ))}
      </div>
    )}
    <input
      className="admin-input font-body"
      value={inputValue}
      onChange={(e) => onInputChange(e.target.value)}
      onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), onAdd())}
      placeholder={placeholder}
      style={{ width: "100%" }}
    />
  </div>
);

export default NichesManager;
