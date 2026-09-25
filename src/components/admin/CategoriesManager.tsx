import { useId, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { errorMessage } from "@/lib/errorMessage";
import { Plus, Pencil, Trash2, X, Check } from "lucide-react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type CategoryRow = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  postCount: number;
};
type Draft = { name: string; slug: string; description: string };

const EMPTY_DRAFT: Draft = { name: "", slug: "", description: "" };
const QUERY_KEY = ["admin-categories"];
const ghostText = { color: "hsl(var(--admin-text-ghost))" } as const;
const iconButton: React.CSSProperties = {
  background: "none",
  border: "none",
  cursor: "pointer",
  minWidth: 36,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
};

const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

const toRow = (draft: Draft) => ({
  name: draft.name.trim(),
  slug: draft.slug || slugify(draft.name),
  description: draft.description.trim() || null,
});

const articles = (count: number) =>
  `${count} ${count === 1 ? "article" : "articles"}`;

async function loadCategories(): Promise<CategoryRow[]> {
  const { data, error } = await supabase
    .from("categories")
    .select("*")
    .order("name");
  if (error) throw error;
  const counts = await Promise.all(
    (data ?? []).map(async (cat) => {
      const { count, error: countError } = await supabase
        .from("posts")
        .select("*", { count: "exact", head: true })
        .eq("category_id", cat.id);
      if (countError) throw countError;
      return count ?? 0;
    }),
  );
  return (data ?? []).map((c, i) => ({
    id: c.id,
    name: c.name,
    slug: c.slug,
    description: c.description,
    postCount: counts[i],
  }));
}

const CategoriesManager = () => {
  const qc = useQueryClient();
  const { toast } = useToast();
  const fieldId = useId();
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [editId, setEditId] = useState<string | null>(null);
  const [edit, setEdit] = useState<Draft>(EMPTY_DRAFT);
  const [deleteTarget, setDeleteTarget] = useState<CategoryRow | null>(null);

  const {
    data: categories,
    isLoading,
    error: loadError,
  } = useQuery({ queryKey: QUERY_KEY, queryFn: loadCategories });

  const failed = (title: string) => (error: unknown) =>
    toast({
      title,
      description: errorMessage(error),
      variant: "destructive",
    });

  const addMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("categories").insert(toRow(draft));
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QUERY_KEY });
      setDraft(EMPTY_DRAFT);
    },
    onError: failed("Couldn't add the category"),
  });

  const updateMutation = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase
        .from("categories")
        .update(toRow(edit))
        .eq("id", id)
        .select("id");
      if (error) throw error;
      if (!data?.length)
        throw new Error(
          "The category was not saved. It may have been removed or your access changed. Your edits are still here.",
        );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QUERY_KEY });
      setEditId(null);
    },
    onError: failed("Couldn't save the category"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase
        .from("categories")
        .delete()
        .eq("id", id)
        .select("id");
      if (error) throw error;
      if (!data?.length)
        throw new Error(
          "Nothing was deleted. The category may already be gone, or your access changed.",
        );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QUERY_KEY });
      setDeleteTarget(null);
    },
    onError: failed("Couldn't delete the category"),
  });

  const startEdit = (cat: CategoryRow) => {
    setEditId(cat.id);
    setEdit({
      name: cat.name,
      slug: cat.slug,
      description: cat.description ?? "",
    });
  };

  return (
    <div>
      <div style={{ marginBottom: 32 }}>
        <h1
          className="font-heading italic"
          style={{ fontSize: 28, fontWeight: 400 }}
        >
          Categories
        </h1>
        <p
          className="font-body"
          style={{ fontSize: 13, marginTop: 4, ...ghostText }}
        >
          Organize your blog posts
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <fieldset
          disabled={addMutation.isPending}
          className="admin-card min-w-0 p-5 sm:p-7"
        >
          <h2
            className="font-heading"
            style={{ fontSize: 18, fontWeight: 600, marginBottom: 24 }}
          >
            Add Category
          </h2>
          <DraftField
            id={`${fieldId}-name`}
            label="Name"
            placeholder="Category name"
            value={draft.name}
            onChange={(name) =>
              setDraft({ ...draft, name, slug: slugify(name) })
            }
          />
          <DraftField
            id={`${fieldId}-slug`}
            label="Slug"
            placeholder="category-slug"
            value={draft.slug}
            onChange={(slug) => setDraft({ ...draft, slug })}
          />
          <DraftField
            id={`${fieldId}-description`}
            label="Description (optional)"
            placeholder="Brief description"
            value={draft.description}
            onChange={(description) => setDraft({ ...draft, description })}
          />
          <button
            type="button"
            onClick={() => draft.name.trim() && addMutation.mutate()}
            disabled={!draft.name.trim() || addMutation.isPending}
            className="admin-btn-primary"
          >
            <Plus size={14} aria-hidden="true" /> Add Category
          </button>
        </fieldset>

        <div className="admin-card min-w-0 p-5 sm:p-7">
          <h2
            className="font-heading"
            style={{ fontSize: 18, fontWeight: 600, marginBottom: 24 }}
          >
            All Categories
          </h2>

          {isLoading && (
            <p
              className="font-body"
              style={{ padding: 32, textAlign: "center", ...ghostText }}
            >
              Loading...
            </p>
          )}

          {loadError && (
            <p
              role="alert"
              className="font-body"
              style={{ fontSize: 13, color: "hsl(var(--admin-danger))" }}
            >
              Couldn't load categories: {errorMessage(loadError)}. Refresh the
              page to try again.
            </p>
          )}

          {categories?.length === 0 && (
            <div
              className="font-body"
              style={{ padding: "32px 8px", textAlign: "center", fontSize: 14 }}
            >
              <p style={{ color: "hsl(var(--admin-text))", fontWeight: 600 }}>
                No categories yet.
              </p>
              <p style={{ marginTop: 8, lineHeight: 1.6, ...ghostText }}>
                Categories group articles by topic. Each article can have one,
                it shows as a label on the blog, and readers can filter the blog
                by it. Add your first category with the form.
              </p>
            </div>
          )}

          {categories?.map((cat) =>
            editId === cat.id ? (
              <EditRow
                key={cat.id}
                draft={edit}
                saving={updateMutation.isPending}
                onChange={setEdit}
                onSave={() => updateMutation.mutate(cat.id)}
                onCancel={() => setEditId(null)}
              />
            ) : (
              <CategoryItem
                key={cat.id}
                category={cat}
                onEdit={() => startEdit(cat)}
                onDelete={() => setDeleteTarget(cat)}
                disabled={updateMutation.isPending || deleteMutation.isPending}
              />
            ),
          )}
        </div>
      </div>

      <DeleteCategoryDialog
        target={deleteTarget}
        deleting={deleteMutation.isPending}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={(id) => deleteMutation.mutate(id)}
      />
    </div>
  );
};

const DraftField = ({
  id,
  label,
  placeholder,
  value,
  onChange,
}: {
  id: string;
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
}) => (
  <div style={{ marginBottom: 20 }}>
    <label htmlFor={id} className="admin-label font-body">
      {label}
    </label>
    <input
      id={id}
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="admin-input font-body"
    />
  </div>
);

const CategoryItem = ({
  category,
  onEdit,
  onDelete,
  disabled,
}: {
  category: CategoryRow;
  onEdit: () => void;
  onDelete: () => void;
  disabled: boolean;
}) => (
  <div
    className="flex items-center justify-between gap-3 rounded hover:bg-[hsl(var(--admin-surface-2))]"
    style={{
      padding: "14px 12px",
      borderBottom: "1px solid hsl(var(--admin-border))",
    }}
  >
    <div className="min-w-0 font-body" style={{ overflowWrap: "anywhere" }}>
      <span style={{ fontSize: 14 }}>{category.name}</span>
      {category.description && (
        <span style={{ fontSize: 12, marginLeft: 10, ...ghostText }}>
          — {category.description}
        </span>
      )}
      <span style={{ fontSize: 12, marginLeft: 12, ...ghostText }}>
        {category.postCount} posts
      </span>
    </div>
    <div className="flex shrink-0 items-center gap-1">
      <button
        type="button"
        aria-label={`Edit ${category.name}`}
        title="Edit"
        onClick={onEdit}
        disabled={disabled}
        style={{ ...iconButton, color: "hsl(var(--admin-accent))" }}
      >
        <Pencil size={14} aria-hidden="true" />
      </button>
      <button
        type="button"
        aria-label={`Delete ${category.name}`}
        title="Delete"
        onClick={onDelete}
        disabled={disabled}
        style={{ ...iconButton, color: "hsl(var(--admin-danger))" }}
      >
        <Trash2 size={14} aria-hidden="true" />
      </button>
    </div>
  </div>
);

const EditRow = ({
  draft,
  saving,
  onChange,
  onSave,
  onCancel,
}: {
  draft: Draft;
  saving: boolean;
  onChange: (draft: Draft) => void;
  onSave: () => void;
  onCancel: () => void;
}) => (
  <div
    className="flex flex-col gap-2"
    style={{
      padding: "14px 12px",
      borderBottom: "1px solid hsl(var(--admin-border))",
    }}
  >
    <input
      aria-label="Category name"
      disabled={saving}
      value={draft.name}
      onChange={(e) =>
        onChange({
          ...draft,
          name: e.target.value,
        })
      }
      className="admin-input font-body"
      placeholder="Name"
      autoFocus
    />
    <input
      aria-label="Category slug"
      disabled={saving}
      value={draft.slug}
      onChange={(e) => onChange({ ...draft, slug: e.target.value })}
      className="admin-input font-body"
      placeholder="Slug"
    />
    <input
      aria-label="Category description"
      disabled={saving}
      value={draft.description}
      onChange={(e) => onChange({ ...draft, description: e.target.value })}
      className="admin-input font-body"
      placeholder="Description"
    />
    <div className="flex gap-2" style={{ marginTop: 4 }}>
      <button
        type="button"
        aria-label="Save category"
        title="Save"
        disabled={saving || !draft.name.trim()}
        onClick={onSave}
        style={{ ...iconButton, color: "hsl(var(--admin-sage))" }}
      >
        <Check size={16} aria-hidden="true" />
      </button>
      <button
        type="button"
        aria-label="Cancel edit"
        title="Cancel"
        disabled={saving}
        onClick={onCancel}
        style={{ ...iconButton, ...ghostText }}
      >
        <X size={16} aria-hidden="true" />
      </button>
    </div>
  </div>
);

const DeleteCategoryDialog = ({
  target,
  deleting,
  onCancel,
  onConfirm,
}: {
  target: CategoryRow | null;
  deleting: boolean;
  onCancel: () => void;
  onConfirm: (id: string) => void;
}) => {
  // The dialog portals outside the workspace, so it re-applies admin tokens.
  const light =
    typeof document !== "undefined" &&
    !!document.querySelector("[data-admin-shell].admin-light");
  return (
    <AlertDialog open={!!target} onOpenChange={(open) => !open && onCancel()}>
      <AlertDialogContent
        className={`admin-shell ${light ? "admin-light" : ""}`}
        style={{
          backgroundColor: "hsl(var(--admin-surface))",
          border: "1px solid hsl(var(--admin-border))",
        }}
      >
        <AlertDialogHeader>
          <AlertDialogTitle className="font-body">
            Delete "{target?.name}"?
          </AlertDialogTitle>
          <AlertDialogDescription
            className="font-body"
            style={{ color: "hsl(var(--admin-text-soft))" }}
          >
            {target && target.postCount > 0
              ? `${articles(target.postCount)} in this category will become uncategorized. The articles stay published; only their category label is removed.`
              : "No articles use this category. Deleting a category never deletes articles; they become uncategorized."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="admin-btn-ghost font-body">
            Cancel
          </AlertDialogCancel>
          <button
            type="button"
            className="admin-btn-primary font-body"
            disabled={deleting}
            onClick={() => target && onConfirm(target.id)}
            style={{ background: "hsl(var(--admin-danger))", color: "#fff" }}
          >
            Delete category
          </button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default CategoriesManager;
