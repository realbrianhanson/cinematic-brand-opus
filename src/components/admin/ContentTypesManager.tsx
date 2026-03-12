import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Copy, Trash2, Loader2 } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

const ContentTypesManager = () => {
  const { toast } = useToast();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);

  const { data: schemas, isLoading } = useQuery({
    queryKey: ["admin-content-schemas"],
    queryFn: async () => {
      const { data, error } = await supabase.from("content_schemas").select("*").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: pageCounts } = useQuery({
    queryKey: ["admin-schema-page-counts"],
    queryFn: async () => {
      const { data, error } = await supabase.from("generated_pages").select("content_schema_id");
      if (error) throw error;
      const counts: Record<string, number> = {};
      (data ?? []).forEach((p) => {
        if (p.content_schema_id) counts[p.content_schema_id] = (counts[p.content_schema_id] || 0) + 1;
      });
      return counts;
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("content_schemas").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-content-schemas"] });
      toast({ title: "Content type deleted" });
      setDeleteTarget(null);
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const duplicateMutation = useMutation({
    mutationFn: async (schema: any) => {
      const { id, created_at, ...rest } = schema;
      const { error } = await supabase.from("content_schemas").insert({
        ...rest,
        name: rest.name + " (Copy)",
        slug: rest.slug + "-copy",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-content-schemas"] });
      toast({ title: "Content type duplicated" });
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  return (
    <div>
      <div className="flex items-center justify-between" style={{ marginBottom: 24 }}>
        <h1 className="font-body" style={{ fontSize: 22, fontWeight: 600, color: "hsl(var(--admin-text))" }}>
          Content Types
        </h1>
        <Link to="/admin/content-types/new" className="admin-btn-primary font-body" style={{ textDecoration: "none" }}>
          <Plus size={14} style={{ marginRight: 6 }} /> Add Content Type
        </Link>
      </div>

      {isLoading ? (
        <div className="flex justify-center" style={{ padding: 60 }}>
          <Loader2 size={24} className="animate-spin" style={{ color: "hsl(var(--admin-text-ghost))" }} />
        </div>
      ) : !schemas?.length ? (
        <div className="admin-card font-body" style={{ padding: 40, textAlign: "center", color: "hsl(var(--admin-text-ghost))", fontSize: 13 }}>
          No content types yet. Create one to start generating pages.
        </div>
      ) : (
        <div className="admin-card" style={{ overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                {["Name", "Slug", "Title Template", "Renderer", "Items/Sec", "Status", "Pages", "Actions"].map((h) => (
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
              {schemas.map((s) => (
                <tr key={s.id} style={{ borderBottom: "1px solid hsl(var(--admin-border))" }}>
                  <td className="font-body" style={{ padding: "12px 14px", fontSize: 13, fontWeight: 500, color: "hsl(var(--admin-text))" }}>
                    {s.name}
                  </td>
                  <td className="font-body" style={{ padding: "12px 14px", fontSize: 12, color: "hsl(var(--admin-text-ghost))" }}>
                    {s.slug}
                  </td>
                  <td className="font-body" style={{ padding: "12px 14px", fontSize: 12, color: "hsl(var(--admin-text-soft))", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {s.title_template?.length > 40 ? s.title_template.slice(0, 40) + "…" : s.title_template}
                  </td>
                  <td className="font-body" style={{ padding: "12px 14px", fontSize: 12, color: "hsl(var(--admin-text-soft))" }}>
                    {s.renderer_component}
                  </td>
                  <td className="font-body" style={{ padding: "12px 14px", fontSize: 12, color: "hsl(var(--admin-text-soft))", textAlign: "center" }}>
                    {s.items_per_section ?? 15}
                  </td>
                  <td style={{ padding: "12px 14px" }}>
                    <span className="font-body" style={{
                      fontSize: 10, padding: "2px 8px", borderRadius: 999,
                      backgroundColor: s.is_active ? "hsl(var(--admin-sage) / 0.12)" : "hsl(var(--admin-text-ghost) / 0.15)",
                      color: s.is_active ? "hsl(var(--admin-sage))" : "hsl(var(--admin-text-ghost))",
                    }}>
                      {s.is_active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="font-body" style={{ padding: "12px 14px", fontSize: 12, color: "hsl(var(--admin-text-soft))", textAlign: "center" }}>
                    {pageCounts?.[s.id] ?? 0}
                  </td>
                  <td style={{ padding: "12px 14px" }}>
                    <div className="flex items-center gap-1">
                      <button onClick={() => navigate(`/admin/content-types/${s.id}/edit`)} style={iconBtnStyle}>
                        <Pencil size={13} />
                      </button>
                      <button onClick={() => duplicateMutation.mutate(s)} style={iconBtnStyle}>
                        <Copy size={13} />
                      </button>
                      <button
                        onClick={() => setDeleteTarget({ id: s.id, name: s.name })}
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
            <AlertDialogTitle className="font-body">Delete "{deleteTarget?.name}"?</AlertDialogTitle>
            <AlertDialogDescription className="font-body" style={{ color: "hsl(var(--admin-text-soft))" }}>
              This will remove the content type definition. Existing generated pages will not be deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="font-body" style={{ border: "1px solid hsl(var(--admin-border))", background: "none", color: "hsl(var(--admin-text-soft))" }}>Cancel</AlertDialogCancel>
            <AlertDialogAction className="font-body" onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)} style={{ backgroundColor: "hsl(var(--admin-danger))", color: "#fff", border: "none" }}>Delete</AlertDialogAction>
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

export default ContentTypesManager;
