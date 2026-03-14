import { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Loader2, ArrowLeft, ChevronDown, ChevronRight, CheckCircle2, AlertCircle } from "lucide-react";
import { Switch } from "@/components/ui/switch";

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

// ── Renderer options with labels ──
const rendererOptions = [
  { value: "ToolRoundupRenderer", label: "Tool Roundup (grid of tools with pros/cons/pricing)" },
  { value: "ChecklistRenderer", label: "Checklist (step-by-step tasks with priority levels)" },
  { value: "GuideRenderer", label: "Guide (long-form sections with TOC sidebar)" },
  { value: "IdeaListRenderer", label: "Idea List (categorized items with difficulty ratings)" },
  { value: "TemplateRenderer", label: "Templates (copyable templates with usage instructions)" },
  { value: "FAQRenderer", label: "FAQ (grouped questions and answers)" },
];

// ── 6 niche-agnostic prebuilt templates ──
interface SchemaTemplate {
  name: string;
  slug: string;
  description: string;
  renderer_component: string;
  items_per_section: number;
  title_template: string;
  description_template: string;
  schema_definition: object;
}

const TEMPLATES: SchemaTemplate[] = [
  {
    name: "Tool Roundups",
    slug: "tool-roundups",
    description: "Curated collections of the best tools for specific topics, with pricing, pros/cons, and use cases.",
    renderer_component: "ToolRoundupRenderer",
    items_per_section: 10,
    title_template: "{{count}} Best Tools for {{niche_name}} in {{year}}",
    description_template: "Discover the {{count}} best tools for {{niche_name}} in {{year}}. Expert-curated with pricing, pros/cons, and real use cases.",
    schema_definition: {"type":"object","required":["intro","sections","frequently_asked_questions","pro_tips"],"properties":{"intro":{"type":"string","description":"2-3 sentence direct answer to the search query. Include a specific number or stat."},"sections":{"type":"array","description":"Tool categories grouped by function or use case","items":{"type":"object","required":["title","description","tools"],"properties":{"title":{"type":"string"},"description":{"type":"string","description":"1-2 sentences explaining this category"},"tools":{"type":"array","items":{"type":"object","required":["name","description","best_for","pricing","pros","cons"],"properties":{"name":{"type":"string"},"description":{"type":"string","description":"2-3 sentences on what it does"},"best_for":{"type":"string","description":"One sentence on ideal user"},"pricing":{"type":"string","description":"Free tier, starting price, or price range"},"pros":{"type":"array","items":{"type":"string"},"minItems":2,"maxItems":3},"cons":{"type":"array","items":{"type":"string"},"minItems":1,"maxItems":2},"link":{"type":"string","description":"URL to the tool"}}}}}}},"pro_tips":{"type":"array","items":{"type":"object","required":["title","tip"],"properties":{"title":{"type":"string"},"tip":{"type":"string","description":"Non-obvious, actionable advice"}}},"minItems":3,"maxItems":5},"frequently_asked_questions":{"type":"array","items":{"type":"object","required":["question","answer"],"properties":{"question":{"type":"string"},"answer":{"type":"string","description":"2-4 sentence factual answer"}}},"minItems":5,"maxItems":5}}},
  },
  {
    name: "Implementation Checklists",
    slug: "implementation-checklists",
    description: "Step-by-step checklists readers can follow to implement strategies in specific areas.",
    renderer_component: "ChecklistRenderer",
    items_per_section: 12,
    title_template: "The Complete {{niche_name}} Checklist for {{year}} ({{count}}+ Steps)",
    description_template: "Follow this {{niche_name}} checklist with {{count}}+ actionable steps. Updated for {{year}} with expert tips.",
    schema_definition: {"type":"object","required":["intro","sections","frequently_asked_questions","pro_tips"],"properties":{"intro":{"type":"string","description":"2-3 sentence direct answer. Include how long implementation takes or expected ROI."},"sections":{"type":"array","description":"Checklist phases (e.g. Setup, Configuration, Launch, Optimize)","items":{"type":"object","required":["title","description","checklist_items"],"properties":{"title":{"type":"string"},"description":{"type":"string"},"checklist_items":{"type":"array","items":{"type":"object","required":["task","description","priority"],"properties":{"task":{"type":"string","description":"Action item starting with a verb"},"description":{"type":"string","description":"1-2 sentences explaining why and how"},"priority":{"type":"string","enum":["critical","important","nice-to-have"]},"time_estimate":{"type":"string","description":"e.g. 15 min, 1 hour, 1 day"},"pro_tip":{"type":"string","description":"Optional insider advice"}}}}}}},"pro_tips":{"type":"array","items":{"type":"object","required":["title","tip"],"properties":{"title":{"type":"string"},"tip":{"type":"string"}}},"minItems":3,"maxItems":5},"frequently_asked_questions":{"type":"array","items":{"type":"object","required":["question","answer"],"properties":{"question":{"type":"string"},"answer":{"type":"string"}}},"minItems":5,"maxItems":5}}},
  },
  {
    name: "Strategy Guides",
    slug: "strategy-guides",
    description: "In-depth guides teaching readers how to build and execute strategies for specific topics.",
    renderer_component: "GuideRenderer",
    items_per_section: 8,
    title_template: "{{niche_name}}: The Complete Guide for {{year}}",
    description_template: "Master {{niche_name}} with this comprehensive {{year}} guide. Step-by-step strategies, tools, and expert insights.",
    schema_definition: {"type":"object","required":["intro","sections","common_mistakes","frequently_asked_questions","pro_tips"],"properties":{"intro":{"type":"string","description":"2-3 sentence direct answer positioning this as the definitive guide. Include a stat or timeframe."},"sections":{"type":"array","description":"Guide chapters covering the topic comprehensively","items":{"type":"object","required":["title","content","key_points"],"properties":{"title":{"type":"string","description":"Chapter heading, ideally phrased as a question or how-to"},"content":{"type":"string","description":"3-5 sentences of substantive explanation"},"key_points":{"type":"array","items":{"type":"string"},"minItems":3,"maxItems":5,"description":"Actionable takeaways from this section"},"tools":{"type":"array","items":{"type":"object","properties":{"name":{"type":"string"},"description":{"type":"string"},"link":{"type":"string"}}},"description":"Optional: specific tools relevant to this section"}}}},"common_mistakes":{"type":"array","items":{"type":"object","required":["mistake","why"],"properties":{"mistake":{"type":"string"},"why":{"type":"string","description":"Why this is a problem and what to do instead"}}},"minItems":3,"maxItems":5},"pro_tips":{"type":"array","items":{"type":"object","required":["title","tip"],"properties":{"title":{"type":"string"},"tip":{"type":"string"}}},"minItems":3,"maxItems":5},"frequently_asked_questions":{"type":"array","items":{"type":"object","required":["question","answer"],"properties":{"question":{"type":"string"},"answer":{"type":"string"}}},"minItems":5,"maxItems":5}}},
  },
  {
    name: "Ideas & Use Cases",
    slug: "ideas-and-use-cases",
    description: "Curated lists of ideas, use cases, and opportunities organized by topic.",
    renderer_component: "IdeaListRenderer",
    items_per_section: 15,
    title_template: "{{count}} {{niche_name}} Ideas to Try in {{year}}",
    description_template: "Explore {{count}} proven {{niche_name}} ideas for {{year}}. Actionable use cases with difficulty ratings and potential.",
    schema_definition: {"type":"object","required":["intro","categories","frequently_asked_questions","pro_tips"],"properties":{"intro":{"type":"string","description":"2-3 sentences directly answering the implied search query with a specific number or stat."},"categories":{"type":"array","description":"Grouped categories of ideas","items":{"type":"object","required":["title","description","items"],"properties":{"title":{"type":"string"},"description":{"type":"string"},"items":{"type":"array","items":{"type":"object","required":["name","description","difficulty","revenue_potential"],"properties":{"name":{"type":"string"},"description":{"type":"string","description":"2-3 sentences on the idea and how to execute"},"difficulty":{"type":"string","enum":["beginner","intermediate","advanced"]},"revenue_potential":{"type":"string","description":"e.g. $500-2K/mo, $5K+/mo"},"tools_needed":{"type":"string","description":"Key tools or platforms required"},"pro_tip":{"type":"string","description":"Insider advice for this specific idea"}}}}}}},"pro_tips":{"type":"array","items":{"type":"object","required":["title","tip"],"properties":{"title":{"type":"string"},"tip":{"type":"string"}}},"minItems":3,"maxItems":5},"frequently_asked_questions":{"type":"array","items":{"type":"object","required":["question","answer"],"properties":{"question":{"type":"string"},"answer":{"type":"string"}}},"minItems":5,"maxItems":5}}},
  },
  {
    name: "Templates & Frameworks",
    slug: "templates-and-frameworks",
    description: "Ready-to-use templates readers can copy and customize for specific tasks.",
    renderer_component: "TemplateRenderer",
    items_per_section: 10,
    title_template: "{{count}} {{niche_name}} Templates You Can Copy Today ({{year}})",
    description_template: "Grab {{count}} ready-to-use {{niche_name}} templates for {{year}}. Copy, customize, and deploy immediately.",
    schema_definition: {"type":"object","required":["intro","sections","frequently_asked_questions","pro_tips"],"properties":{"intro":{"type":"string","description":"2-3 sentences explaining what these templates do and the time they save."},"sections":{"type":"array","description":"Template categories grouped by use case","items":{"type":"object","required":["title","description","templates"],"properties":{"title":{"type":"string"},"description":{"type":"string"},"templates":{"type":"array","items":{"type":"object","required":["name","description","template_text","how_to_use"],"properties":{"name":{"type":"string"},"description":{"type":"string","description":"What this template accomplishes"},"template_text":{"type":"string","description":"The actual template text with [PLACEHOLDER] variables"},"how_to_use":{"type":"string","description":"1-2 sentences on how to customize and deploy"},"best_for":{"type":"string","description":"Ideal scenario or business type"},"pro_tip":{"type":"string"}}}}}}},"pro_tips":{"type":"array","items":{"type":"object","required":["title","tip"],"properties":{"title":{"type":"string"},"tip":{"type":"string"}}},"minItems":3,"maxItems":5},"frequently_asked_questions":{"type":"array","items":{"type":"object","required":["question","answer"],"properties":{"question":{"type":"string"},"answer":{"type":"string"}}},"minItems":5,"maxItems":5}}},
  },
  {
    name: "FAQ Collections",
    slug: "faq-collections",
    description: "Comprehensive FAQ pages answering the most common questions about specific topics.",
    renderer_component: "FAQRenderer",
    items_per_section: 10,
    title_template: "{{niche_name}}: {{count}} Questions Answered ({{year}} Guide)",
    description_template: "Get answers to {{count}} common questions about {{niche_name}}. Expert answers updated for {{year}}.",
    schema_definition: {"type":"object","required":["intro","sections","frequently_asked_questions","pro_tips"],"properties":{"intro":{"type":"string","description":"2-3 sentences framing why these questions matter and who this is for."},"sections":{"type":"array","description":"FAQ categories (e.g. Getting Started, Costs, Tools, Strategy)","items":{"type":"object","required":["title","description","faqs"],"properties":{"title":{"type":"string"},"description":{"type":"string"},"faqs":{"type":"array","items":{"type":"object","required":["question","answer"],"properties":{"question":{"type":"string","description":"Natural language question people actually search"},"answer":{"type":"string","description":"3-5 sentence authoritative answer with specifics"},"related_tip":{"type":"string","description":"Optional bonus insight"}}}}}}},"pro_tips":{"type":"array","items":{"type":"object","required":["title","tip"],"properties":{"title":{"type":"string"},"tip":{"type":"string"}}},"minItems":3,"maxItems":5},"frequently_asked_questions":{"type":"array","items":{"type":"object","required":["question","answer"],"properties":{"question":{"type":"string"},"answer":{"type":"string"}}},"minItems":5,"maxItems":5}}},
  },
];

const sampleVars = { count: "100", content_type: "Blog Post Ideas", niche_name: "Real Estate Agents", niche_slug: "real-estate-agents", year: new Date().getFullYear().toString() };

const renderTemplate = (tpl: string) =>
  tpl.replace(/\{\{count\}\}/g, sampleVars.count)
    .replace(/\{\{content_type\}\}/g, sampleVars.content_type)
    .replace(/\{\{niche_name\}\}/g, sampleVars.niche_name)
    .replace(/\{\{niche_slug\}\}/g, sampleVars.niche_slug)
    .replace(/\{\{year\}\}/g, sampleVars.year);

const VARIABLE_HINT = "Available variables: {{niche_name}}, {{year}}, {{count}}, {{content_type}}";

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
  const [schemaJson, setSchemaJson] = useState("{}");
  const [schemaOpen, setSchemaOpen] = useState(false);

  const schemaValid = useMemo(() => {
    try {
      JSON.parse(schemaJson);
      return true;
    } catch {
      return false;
    }
  }, [schemaJson]);

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

  const applyTemplate = (tpl: SchemaTemplate) => {
    setName(tpl.name);
    setSlug(tpl.slug);
    setDescription(tpl.description);
    setRendererComponent(tpl.renderer_component);
    setItemsPerSection(tpl.items_per_section);
    setTitleTemplate(tpl.title_template);
    setDescriptionTemplate(tpl.description_template);
    setSchemaJson(JSON.stringify(tpl.schema_definition, null, 2));
    setSlugManual(false);
  };

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
        {/* Start from Template */}
        {isNew && (
          <div className="admin-card" style={{ padding: 24 }}>
            <h2 className="font-body" style={{ fontSize: 14, fontWeight: 600, color: "hsl(var(--admin-text))", marginBottom: 6 }}>
              Start from Template
            </h2>
            <p className="font-body" style={{ fontSize: 12, color: "hsl(var(--admin-text-ghost))", marginBottom: 14 }}>
              Pick a template to auto-fill all fields. You can customize the name and descriptions afterward.
            </p>
            <select
              className="admin-input font-body"
              style={{ width: "100%" }}
              defaultValue=""
              onChange={(e) => {
                const tpl = TEMPLATES.find((t) => t.slug === e.target.value);
                if (tpl) applyTemplate(tpl);
              }}
            >
              <option value="">Choose a template…</option>
              {TEMPLATES.map((t) => (
                <option key={t.slug} value={t.slug}>
                  {t.name} — {t.description.slice(0, 70)}…
                </option>
              ))}
            </select>
          </div>
        )}

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
            Title & Description Templates
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <Field label="Title Template">
              <input className="admin-input font-body" value={titleTemplate}
                onChange={(e) => setTitleTemplate(e.target.value)} />
              <p className="font-body" style={{ fontSize: 11, color: "hsl(var(--admin-text-ghost))", marginTop: 4 }}>
                {VARIABLE_HINT}
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
              <p className="font-body" style={{ fontSize: 11, color: "hsl(var(--admin-text-ghost))", marginTop: 4 }}>
                {VARIABLE_HINT}
              </p>
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
              <select
                className="admin-input font-body"
                value={rendererComponent}
                onChange={(e) => setRendererComponent(e.target.value)}
                style={{ width: "100%" }}
              >
                {rendererOptions.map((r) => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            </Field>
          </div>
        </div>

        {/* Schema Definition — collapsible */}
        <div className="admin-card" style={{ padding: 24 }}>
          <div className="flex items-center justify-between">
            <button
              onClick={() => setSchemaOpen(!schemaOpen)}
              className="flex items-center gap-2 font-body"
              style={{
                background: "none", border: "none", cursor: "pointer", padding: 0,
                fontSize: 14, fontWeight: 600, color: "hsl(var(--admin-text))",
              }}
            >
              {schemaOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
              Advanced: Edit Schema JSON
            </button>
            {schemaValid ? (
              <span className="flex items-center gap-1 font-body" style={{ fontSize: 12, color: "hsl(var(--admin-sage))" }}>
                <CheckCircle2 size={14} /> Valid schema loaded
              </span>
            ) : (
              <span className="flex items-center gap-1 font-body" style={{ fontSize: 12, color: "hsl(var(--admin-danger))" }}>
                <AlertCircle size={14} /> Invalid JSON
              </span>
            )}
          </div>

          {schemaOpen && (
            <div style={{ marginTop: 16 }}>
              <div className="flex items-center justify-end gap-2" style={{ marginBottom: 8 }}>
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
          )}
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
