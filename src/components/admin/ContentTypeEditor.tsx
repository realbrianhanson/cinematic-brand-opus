import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Loader2, ArrowLeft } from "lucide-react";
import { Switch } from "@/components/ui/switch";

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

const rendererOptions = [
  "IdeaListRenderer",
  "ChecklistRenderer",
  "GuideRenderer",
  "ToolRoundupRenderer",
  "TemplateRenderer",
  "FAQRenderer",
];

const exampleSchemas: Record<string, object> = {
  IdeaListRenderer: {
    intro: "string (2-3 sentences, directly answers the search query)",
    sections: [{ heading: "string", items: [{ title: "string", description: "string (2-3 sentences, niche-specific)", difficulty: "beginner | intermediate | advanced", category: "string" }] }],
    pro_tips: ["string (5 items, actionable and non-obvious)"],
    frequently_asked_questions: [{ question: "string", answer: "string (2-3 sentences)" }],
  },
  ChecklistRenderer: {
    intro: "string",
    phases: [{ name: "string", description: "string", steps: [{ title: "string", description: "string", priority: "critical | important | nice-to-have", estimated_minutes: "number" }] }],
    pro_tips: ["string (5 items)"],
    frequently_asked_questions: [{ question: "string", answer: "string" }],
  },
  GuideRenderer: {
    intro: "string",
    sections: [{ heading: "string", content: "string (2-3 paragraphs)", key_points: ["string"], tools_mentioned: [{ name: "string", url: "string", description: "string" }] }],
    common_mistakes: ["string (3-5 items)"],
    pro_tips: ["string (5 items)"],
    frequently_asked_questions: [{ question: "string", answer: "string" }],
  },
  ToolRoundupRenderer: {
    intro: "string",
    tools: [{ name: "string", description: "string", url: "string", pricing: "string", best_for: "string", pros: ["string"], cons: ["string"], verdict: "top-pick | great-value | best-for-beginners | honorable-mention" }],
    how_we_evaluated: "string",
    pro_tips: ["string (5 items)"],
    frequently_asked_questions: [{ question: "string", answer: "string" }],
  },
  TemplateRenderer: {
    intro: "string",
    categories: [{ name: "string", templates: [{ name: "string", use_case: "string", template_text: "string (the actual template content to copy)", customization_tips: "string" }] }],
    pro_tips: ["string (5 items)"],
    frequently_asked_questions: [{ question: "string", answer: "string" }],
  },
  FAQRenderer: {
    intro: "string",
    categories: [{ name: "string", questions: [{ question: "string", answer: "string (2-4 sentences, factual and specific)", related_questions: ["string"] }] }],
    pro_tips: ["string (5 items)"],
  },
};

const sampleVars = { count: "100", content_type: "Blog Post Ideas", niche_name: "Real Estate Agents", niche_slug: "real-estate-agents", year: new Date().getFullYear().toString() };

const renderTemplate = (tpl: string) =>
  tpl.replace(/\{\{count\}\}/g, sampleVars.count)
    .replace(/\{\{content_type\}\}/g, sampleVars.content_type)
    .replace(/\{\{niche_name\}\}/g, sampleVars.niche_name)
    .replace(/\{\{niche_slug\}\}/g, sampleVars.niche_slug)
    .replace(/\{\{year\}\}/g, sampleVars.year);

const ContentTypeEditor = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { toast } = useToast();
  const isNew = !id;

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugManual, setSlugManual] = useState(false);
  const [description, setDescription] = useState("");
  const [titleTemplate, setTitleTemplate] = useState("{{count}} {{content_type}} for {{niche_name}} in {{year}}");
  const [descriptionTemplate, setDescriptionTemplate] = useState("");
  const [itemsPerSection, setItemsPerSection] = useState(15);
  const [rendererComponent, setRendererComponent] = useState("IdeaListRenderer");
  const [isActive, setIsActive] = useState(true);
  const [schemaJson, setSchemaJson] = useState(JSON.stringify(exampleSchemas.IdeaListRenderer, null, 2));

  const { data: existing, isLoading } = useQuery({
    queryKey: ["admin-content-schema", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("content_schemas").select("*").eq("id", id!).maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  useEffect(() => {
    if (existing) {
      setName(existing.name);
      setSlug(existing.slug);
      setSlugManual(true);
      setDescription(existing.description ?? "");
      setTitleTemplate(existing.title_template);
      setDescriptionTemplate(existing.description_template ?? "");
      setItemsPerSection(existing.items_per_section ?? 15);
      setRendererComponent(existing.renderer_component);
      setIsActive(existing.is_active ?? true);
      setSchemaJson(JSON.stringify(existing.schema_definition, null, 2));
    }
  }, [existing]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      let parsed: any;
      try {
        parsed = JSON.parse(schemaJson);
      } catch {
        throw new Error("Schema definition is not valid JSON. Please fix and try again.");
      }

      const payload = {
        name,
        slug,
        description: description || null,
        title_template: titleTemplate,
        description_template: descriptionTemplate || null,
        items_per_section: itemsPerSection,
        renderer_component: rendererComponent,
        is_active: isActive,
        schema_definition: parsed,
      };

      if (id) {
        const { error } = await supabase.from("content_schemas").update(payload).eq("id", id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("content_schemas").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-content-schemas"] });
      toast({ title: isNew ? "Content type created" : "Content type updated" });
      navigate("/admin/content-types");
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const formatJson = () => {
    try {
      setSchemaJson(JSON.stringify(JSON.parse(schemaJson), null, 2));
    } catch {
      toast({ title: "Invalid JSON", description: "Cannot format — fix the syntax first.", variant: "destructive" });
    }
  };

  if (!isNew && isLoading) {
    return (
      <div className="flex justify-center" style={{ padding: 60 }}>
        <Loader2 size={24} className="animate-spin" style={{ color: "hsl(var(--admin-text-ghost))" }} />
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 800, margin: "0 auto" }}>
      {/* Header */}
      <div className="flex items-center justify-between" style={{ marginBottom: 24 }}>
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate("/admin/content-types")}
            style={{ background: "none", border: "none", cursor: "pointer", color: "hsl(var(--admin-text-ghost))", display: "flex" }}
          >
            <ArrowLeft size={18} />
          </button>
          <h1 className="font-body" style={{ fontSize: 22, fontWeight: 600, color: "hsl(var(--admin-text))" }}>
            {isNew ? "New Content Type" : "Edit Content Type"}
          </h1>
        </div>
        <button
          className="admin-btn-primary font-body"
          onClick={() => saveMutation.mutate()}
          disabled={!name.trim() || !slug.trim() || saveMutation.isPending}
        >
          {saveMutation.isPending && <Loader2 size={14} className="animate-spin" style={{ marginRight: 6 }} />}
          {isNew ? "Create" : "Save Changes"}
        </button>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        {/* Basic Info */}
        <div className="admin-card" style={{ padding: 24 }}>
          <h2 className="font-body" style={{ fontSize: 14, fontWeight: 600, color: "hsl(var(--admin-text))", marginBottom: 20 }}>
            Basic Info
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <Field label="Name">
              <input className="admin-input font-body" value={name}
                onChange={(e) => { setName(e.target.value); if (!slugManual) setSlug(slugify(e.target.value)); }} />
            </Field>
            <Field label="Slug">
              <input className="admin-input font-body" value={slug}
                onChange={(e) => { setSlugManual(true); setSlug(e.target.value); }} />
            </Field>
            <Field label="Description">
              <textarea className="admin-input font-body" rows={2} value={description}
                onChange={(e) => setDescription(e.target.value)} style={{ resize: "vertical" }} />
            </Field>
            <div className="flex items-center gap-3">
              <Switch checked={isActive} onCheckedChange={setIsActive} />
              <span className="font-body" style={{ fontSize: 13, color: "hsl(var(--admin-text-soft))" }}>Active</span>
            </div>
          </div>
        </div>

        {/* Templates */}
        <div className="admin-card" style={{ padding: 24 }}>
          <h2 className="font-body" style={{ fontSize: 14, fontWeight: 600, color: "hsl(var(--admin-text))", marginBottom: 20 }}>
            Templates
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <Field label="Title Template">
              <input className="admin-input font-body" value={titleTemplate}
                onChange={(e) => setTitleTemplate(e.target.value)} />
              <p className="font-body" style={{ fontSize: 11, color: "hsl(var(--admin-text-ghost))", marginTop: 4 }}>
                Variables: <code>{"{{count}}"}</code>, <code>{"{{content_type}}"}</code>, <code>{"{{niche_name}}"}</code>, <code>{"{{niche_slug}}"}</code>, <code>{"{{year}}"}</code>
              </p>
              {titleTemplate && (
                <p className="font-body" style={{ fontSize: 12, color: "hsl(var(--admin-accent))", marginTop: 6, fontStyle: "italic" }}>
                  Preview: {renderTemplate(titleTemplate)}
                </p>
              )}
            </Field>
            <Field label="Description Template (SEO)">
              <input className="admin-input font-body" value={descriptionTemplate}
                onChange={(e) => setDescriptionTemplate(e.target.value)} />
              {descriptionTemplate && (
                <p className="font-body" style={{ fontSize: 12, color: "hsl(var(--admin-accent))", marginTop: 6, fontStyle: "italic" }}>
                  Preview: {renderTemplate(descriptionTemplate)}
                </p>
              )}
            </Field>
          </div>
        </div>

        {/* Generation Settings */}
        <div className="admin-card" style={{ padding: 24 }}>
          <h2 className="font-body" style={{ fontSize: 14, fontWeight: 600, color: "hsl(var(--admin-text))", marginBottom: 20 }}>
            Generation Settings
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <Field label="Items Per Section">
              <input className="admin-input font-body" type="number" min={1} max={100} value={itemsPerSection}
                onChange={(e) => setItemsPerSection(parseInt(e.target.value) || 15)} style={{ maxWidth: 120 }} />
            </Field>
            <Field label="Renderer Component">
              <select className="admin-input font-body" value={rendererComponent}
                onChange={(e) => setRendererComponent(e.target.value)}>
                {rendererOptions.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </Field>
          </div>
        </div>

        {/* Schema Definition */}
        <div className="admin-card" style={{ padding: 24 }}>
          <div className="flex items-center justify-between" style={{ marginBottom: 16 }}>
            <h2 className="font-body" style={{ fontSize: 14, fontWeight: 600, color: "hsl(var(--admin-text))" }}>
              Schema Definition
            </h2>
            <div className="flex items-center gap-2">
              <select
                className="admin-input font-body"
                style={{ padding: "4px 10px", fontSize: 12, width: "auto" }}
                defaultValue=""
                onChange={(e) => {
                  if (e.target.value && exampleSchemas[e.target.value]) {
                    setSchemaJson(JSON.stringify(exampleSchemas[e.target.value], null, 2));
                  }
                  e.target.value = "";
                }}
              >
                <option value="">Load Example…</option>
                {Object.keys(exampleSchemas).map((k) => <option key={k} value={k}>{k}</option>)}
              </select>
              <button
                onClick={formatJson}
                className="font-body"
                style={{
                  padding: "4px 12px", fontSize: 12, borderRadius: 4,
                  border: "1px solid hsl(var(--admin-border))", background: "none",
                  color: "hsl(var(--admin-text-soft))", cursor: "pointer",
                }}
              >
                Format JSON
              </button>
            </div>
          </div>
          <textarea
            className="admin-input font-body"
            value={schemaJson}
            onChange={(e) => setSchemaJson(e.target.value)}
            style={{
              fontFamily: "monospace",
              fontSize: 12,
              lineHeight: 1.6,
              minHeight: 400,
              resize: "vertical",
              backgroundColor: "hsl(var(--admin-surface-2))",
              width: "100%",
              whiteSpace: "pre",
              overflowWrap: "normal",
              overflowX: "auto",
            }}
          />
        </div>
      </div>
    </div>
  );
};

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div>
    <span className="admin-label">{label}</span>
    <div style={{ marginTop: 6 }}>{children}</div>
  </div>
);

export default ContentTypeEditor;
