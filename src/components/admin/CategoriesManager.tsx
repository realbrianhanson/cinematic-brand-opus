import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Plus, Pencil, Trash2, X, Check } from "lucide-react";

const CategoriesManager = () => {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editSlug, setEditSlug] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const slugify = (s: string) =>
    s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

  const handleNameChange = (val: string) => {
    setName(val);
    setSlug(slugify(val));
  };

  const { data: categories, isLoading } = useQuery({
    queryKey: ["admin-categories"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("categories")
        .select("*")
        .order("name");
      if (error) throw error;
      const counts: Record<string, number> = {};
      for (const cat of data ?? []) {
        const { count } = await supabase
          .from("posts")
          .select("*", { count: "exact", head: true })
          .eq("category_id", cat.id);
        counts[cat.id] = count ?? 0;
      }
      return (data ?? []).map((c: any) => ({ ...c, postCount: counts[c.id] ?? 0 }));
    },
  });

  const addMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("categories")
        .insert({ name, slug: slug || slugify(name), description: description || null } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-categories"] });
      setName("");
      setSlug("");
      setDescription("");
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id }: { id: string }) => {
      const { error } = await supabase
        .from("categories")
        .update({ name: editName, slug: editSlug || slugify(editName), description: editDescription || null } as any)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-categories"] });
      setEditId(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("categories").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-categories"] });
      setDeleteId(null);
    },
  });

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <h1 className="font-heading italic" style={{ fontSize: 28, fontWeight: 400 }}>
          Categories
        </h1>
        <p className="font-body" style={{ fontSize: 13, color: "hsl(var(--admin-text-ghost))", marginTop: 4 }}>
          Organize your blog posts
        </p>
      </div>

      {/* Two-column layout */}
      <div className="grid gap-6" style={{ gridTemplateColumns: "1fr 1fr" }}>
        {/* Left: Add Category */}
        <div className="admin-card" style={{ padding: 28 }}>
          <h2 className="font-heading" style={{ fontSize: 18, fontWeight: 600, marginBottom: 24 }}>
            Add Category
          </h2>

          <div style={{ marginBottom: 20 }}>
            <label className="admin-label font-body" style={{ display: "block", marginBottom: 8 }}>
              Name
            </label>
            <input
              placeholder="Category name"
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              className="admin-input font-body"
              style={{ width: "100%" }}
            />
          </div>

          <div style={{ marginBottom: 20 }}>
            <label className="admin-label font-body" style={{ display: "block", marginBottom: 8 }}>
              Slug
            </label>
            <input
              placeholder="category-slug"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              className="admin-input font-body"
              style={{ width: "100%" }}
            />
          </div>

          <div style={{ marginBottom: 24 }}>
            <label className="admin-label font-body" style={{ display: "block", marginBottom: 8 }}>
              Description (optional)
            </label>
            <input
              placeholder="Brief description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="admin-input font-body"
              style={{ width: "100%" }}
            />
          </div>

          <button
            onClick={() => name.trim() && addMutation.mutate()}
            disabled={!name.trim()}
            className="admin-btn-primary"
            style={{ background: "hsl(var(--admin-accent))", color: "hsl(var(--admin-bg))" }}
          >
            <Plus size={14} /> Add Category
          </button>
        </div>

        {/* Right: All Categories */}
        <div className="admin-card" style={{ padding: 28 }}>
          <h2 className="font-heading" style={{ fontSize: 18, fontWeight: 600, marginBottom: 24 }}>
            All Categories
          </h2>

          {isLoading && (
            <div style={{ padding: 32, textAlign: "center" }}>
              <span className="font-body" style={{ color: "hsl(var(--admin-text-ghost))" }}>Loading...</span>
            </div>
          )}

          {categories?.length === 0 && !isLoading && (
            <div style={{ padding: 48, textAlign: "center" }}>
              <p className="font-body" style={{ fontSize: 14, color: "hsl(var(--admin-text-ghost))" }}>
                No categories yet. Create your first one!
              </p>
            </div>
          )}

          {categories?.map((cat: any) => (
            <div
              key={cat.id}
              className="flex items-center justify-between"
              style={{
                padding: "14px 16px",
                borderBottom: "1px solid hsl(var(--admin-border))",
                transition: "background-color 0.15s",
                borderRadius: 4,
              }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "hsl(var(--admin-surface-2))")}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
            >
              {editId === cat.id ? (
                <div className="flex-1" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <input
                    value={editName}
                    onChange={(e) => { setEditName(e.target.value); setEditSlug(slugify(e.target.value)); }}
                    className="admin-input font-body"
                    placeholder="Name"
                    autoFocus
                  />
                  <input
                    value={editSlug}
                    onChange={(e) => setEditSlug(e.target.value)}
                    className="admin-input font-body"
                    placeholder="Slug"
                  />
                  <input
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                    className="admin-input font-body"
                    placeholder="Description"
                  />
                  <div className="flex gap-2" style={{ marginTop: 4 }}>
                    <button
                      onClick={() => updateMutation.mutate({ id: cat.id })}
                      style={{ color: "hsl(var(--admin-sage))", background: "none", border: "none", cursor: "pointer" }}
                    >
                      <Check size={16} />
                    </button>
                    <button
                      onClick={() => setEditId(null)}
                      style={{ color: "hsl(var(--admin-text-ghost))", background: "none", border: "none", cursor: "pointer" }}
                    >
                      <X size={16} />
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div>
                    <span className="font-body" style={{ fontSize: 14 }}>{cat.name}</span>
                    {cat.description && (
                      <span className="font-body" style={{ fontSize: 11, color: "hsl(var(--admin-text-ghost))", marginLeft: 10 }}>
                        — {cat.description}
                      </span>
                    )}
                    <span className="font-body" style={{ fontSize: 11, color: "hsl(var(--admin-text-ghost))", marginLeft: 12 }}>
                      {cat.postCount} posts
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => {
                        setEditId(cat.id);
                        setEditName(cat.name);
                        setEditSlug(cat.slug);
                        setEditDescription(cat.description || "");
                      }}
                      style={{ color: "hsl(var(--admin-accent))", background: "none", border: "none", cursor: "pointer" }}
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      onClick={() => setDeleteId(cat.id)}
                      style={{ color: "hsl(var(--admin-danger))", background: "none", border: "none", cursor: "pointer" }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Delete confirmation */}
      {deleteId && (
        <div className="fixed inset-0 flex items-center justify-center z-50" style={{ backgroundColor: "rgba(0,0,0,0.6)" }}>
          <div className="admin-card" style={{ padding: 32, maxWidth: 380, width: "90%" }}>
            <p className="font-body" style={{ fontSize: 15, marginBottom: 20 }}>Delete this category?</p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setDeleteId(null)} className="admin-btn-ghost">Cancel</button>
              <button
                onClick={() => deleteMutation.mutate(deleteId)}
                className="admin-btn-primary"
                style={{ background: "hsl(var(--admin-danger))" }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CategoriesManager;
