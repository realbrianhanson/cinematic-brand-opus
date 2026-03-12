import { useState, useMemo } from "react";
import { Copy, Check, ChevronDown, ChevronUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ProTips } from "./IdeaListRenderer";

const TemplateRenderer = ({ contentJson, nicheName, pageId }: { contentJson: any; nicheName: string; pageId: string }) => {
  const sections: any[] = contentJson?.sections || [];
  const allTemplates = useMemo(() => sections.flatMap((s) => (s.items || s.templates || []).map((t: any) => ({ ...t, category: s.title || s.name }))), [sections]);
  const categories = useMemo(() => [...new Set(allTemplates.map((t) => t.category).filter(Boolean))], [allTemplates]);
  const [catFilter, setCatFilter] = useState("");
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

  const logEvent = (type: string, meta: any = {}) => {
    supabase.from("page_engagement").insert({ page_id: pageId, event_type: type, metadata: meta }).then(() => {});
  };

  const filtered = useMemo(() => {
    if (!catFilter) return allTemplates;
    return allTemplates.filter((t) => t.category === catFilter);
  }, [allTemplates, catFilter]);

  const toggleExpand = (i: number) => {
    const next = new Set(expanded);
    if (next.has(i)) next.delete(i); else next.add(i);
    setExpanded(next);
  };

  const handleCopy = (text: string, idx: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIdx(idx);
    logEvent("copy_click", { template: text.slice(0, 50) });
    setTimeout(() => setCopiedIdx(null), 2000);
  };

  return (
    <div>
      {/* Category tabs */}
      {categories.length > 1 && (
        <div className="flex flex-wrap gap-2 mb-8">
          <FilterBtn active={!catFilter} onClick={() => { setCatFilter(""); logEvent("filter_use", { filter: "category", value: "all" }); }}>All</FilterBtn>
          {categories.map((c) => (
            <FilterBtn key={c} active={catFilter === c} onClick={() => { setCatFilter(c); logEvent("filter_use", { filter: "category", value: c }); }}>{c}</FilterBtn>
          ))}
        </div>
      )}

      {/* Templates */}
      <div className="flex flex-col gap-5 mb-12">
        {filtered.map((tmpl, i) => {
          const isOpen = expanded.has(i);
          const templateText = tmpl.template || tmpl.content || tmpl.text || "";
          return (
            <div key={i} style={{ border: "1px solid rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.02)" }}>
              <div className="p-6">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <h3 className="font-body font-semibold" style={{ fontSize: 15, color: "rgba(255,255,255,0.85)" }}>{tmpl.name || tmpl.title}</h3>
                  <button onClick={() => toggleExpand(i)} className="shrink-0 p-1" style={{ color: "rgba(255,255,255,0.3)", background: "none", border: "none", cursor: "pointer" }}>
                    {isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </button>
                </div>
                {tmpl.use_case && <p className="font-body" style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", lineHeight: 1.5 }}>{tmpl.use_case}</p>}
                {tmpl.description && !tmpl.use_case && <p className="font-body" style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", lineHeight: 1.5 }}>{tmpl.description}</p>}
              </div>

              {isOpen && templateText && (
                <div className="px-6 pb-6">
                  <div className="p-4 relative" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                    <pre className="font-body whitespace-pre-wrap" style={{ fontSize: 13, color: "rgba(255,255,255,0.55)", lineHeight: 1.7 }}>
                      {templateText}
                    </pre>
                    <button
                      onClick={() => handleCopy(templateText, i)}
                      className="absolute top-3 right-3 font-body flex items-center gap-1 px-2 py-1 transition-colors"
                      style={{ fontSize: 10, color: copiedIdx === i ? "#D4AF55" : "rgba(255,255,255,0.3)", background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.08)", cursor: "pointer" }}
                    >
                      {copiedIdx === i ? <><Check size={12} /> Copied!</> : <><Copy size={12} /> Copy</>}
                    </button>
                  </div>
                  {tmpl.customization_tips && (
                    <div className="mt-3">
                      <p className="font-body uppercase mb-1" style={{ fontSize: 9, letterSpacing: "0.12em", color: "#D4AF55" }}>Customization Tips</p>
                      <p className="font-body" style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", lineHeight: 1.5 }}>{typeof tmpl.customization_tips === "string" ? tmpl.customization_tips : JSON.stringify(tmpl.customization_tips)}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <ProTips tips={contentJson?.pro_tips} />
    </div>
  );
};

const FilterBtn = ({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) => (
  <button onClick={onClick} className="font-body uppercase px-3 py-1.5 transition-all" style={{ fontSize: 10, letterSpacing: "0.1em", border: "1px solid", borderColor: active ? "#D4AF55" : "rgba(255,255,255,0.08)", color: active ? "#D4AF55" : "rgba(255,255,255,0.35)", background: active ? "rgba(212,175,85,0.08)" : "transparent", cursor: "pointer" }}>
    {children}
  </button>
);

export default TemplateRenderer;
