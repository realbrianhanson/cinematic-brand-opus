import { toast } from "@/hooks/use-toast";
import {
  parseContentDocument,
  type ContentDocument,
} from "@/lib/contentDocument";
import type { Json } from "@/integrations/supabase/types";
import { renderInlineMarkdown } from "@/lib/inlineMarkdown";
import { getItemTitle } from "@/lib/itemTitle";
import { useState, useMemo } from "react";
import { Copy, Check, ChevronDown, ChevronUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ProTips } from "./IdeaListRenderer";

const TemplateRenderer = ({
  contentJson: rawContent,
  nicheName,
  pageId,
}: {
  contentJson: unknown;
  nicheName: string;
  pageId: string;
}) => {
  const contentJson = useMemo(
    () => parseContentDocument(rawContent),
    [rawContent],
  );
  const sections = contentJson?.sections || [];
  const allTemplates = useMemo(
    () =>
      sections.flatMap((s) =>
        (s.items || s.templates || []).map((t) => ({
          ...t,
          category: s.title || s.name,
        })),
      ),
    [sections],
  );
  const categories = useMemo(
    () => [
      ...new Set(
        allTemplates
          .map((t) => t.category)
          .filter((value): value is string => !!value),
      ),
    ],
    [allTemplates],
  );
  const [catFilter, setCatFilter] = useState("");
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

  const logEvent = (type: string, meta: Json = {}) => {
    supabase
      .from("page_engagement")
      .insert({ page_id: pageId, event_type: type, metadata: meta })
      .then(() => {});
  };

  const filtered = useMemo(() => {
    if (!catFilter) return allTemplates;
    return allTemplates.filter((t) => t.category === catFilter);
  }, [allTemplates, catFilter]);

  const toggleExpand = (i: number) => {
    const next = new Set(expanded);
    if (next.has(i)) next.delete(i);
    else next.add(i);
    setExpanded(next);
  };

  const handleCopy = async (text: string, idx: number) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      toast({
        title: "Could not copy",
        description: "Select the text and copy it manually.",
        variant: "destructive",
      });
      return;
    }
    setCopiedIdx(idx);
    logEvent("copy_click", { template: text.slice(0, 50) });
    setTimeout(() => setCopiedIdx(null), 2000);
  };

  return (
    <div>
      {/* Category tabs */}
      {categories.length > 1 && (
        <div className="flex flex-wrap gap-2 mb-8">
          <FilterBtn
            active={!catFilter}
            onClick={() => {
              setCatFilter("");
              logEvent("filter_use", { filter: "category", value: "all" });
            }}
          >
            All
          </FilterBtn>
          {categories.map((c) => (
            <FilterBtn
              key={c}
              active={catFilter === c}
              onClick={() => {
                setCatFilter(c);
                logEvent("filter_use", { filter: "category", value: c });
              }}
            >
              {c}
            </FilterBtn>
          ))}
        </div>
      )}

      {/* Templates */}
      <div className="flex flex-col gap-5 mb-12">
        {filtered.map((tmpl, i) => {
          const isOpen = expanded.has(i);
          const templateText = tmpl.template || tmpl.content || tmpl.text || "";
          return (
            <div
              key={i}
              style={{
                border: "1px solid rgba(255,255,255,0.06)",
                background: "rgba(255,255,255,0.02)",
              }}
            >
              <div className="p-6">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <h3
                    className="font-body font-semibold"
                    style={{
                      fontSize: 19,
                      color: "rgba(255,255,255,0.95)",
                      lineHeight: 1.35,
                    }}
                  >
                    {getItemTitle(tmpl)}
                  </h3>
                  <button
                    aria-label={`Toggle ${getItemTitle(tmpl)}`}
                    aria-expanded={isOpen}
                    onClick={() => toggleExpand(i)}
                    className="shrink-0 p-1"
                    style={{
                      color: "rgba(255,255,255,0.7)",
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                    }}
                  >
                    {isOpen ? (
                      <ChevronUp size={16} />
                    ) : (
                      <ChevronDown size={16} />
                    )}
                  </button>
                </div>
                {tmpl.use_case && (
                  <p
                    className="font-body"
                    style={{
                      fontSize: 14,
                      color: "rgba(255,255,255,0.7)",
                      lineHeight: 1.6,
                    }}
                  >
                    {tmpl.use_case}
                  </p>
                )}
                {tmpl.description && !tmpl.use_case && (
                  <p
                    className="font-body"
                    style={{
                      fontSize: 14,
                      color: "rgba(255,255,255,0.7)",
                      lineHeight: 1.6,
                    }}
                  >
                    {renderInlineMarkdown(tmpl.description)}
                  </p>
                )}
              </div>

              {isOpen && templateText && (
                <div className="px-6 pb-6">
                  <div
                    className="p-4 relative"
                    style={{
                      background: "rgba(255,255,255,0.03)",
                      border: "1px solid rgba(255,255,255,0.06)",
                    }}
                  >
                    <pre
                      className="font-body whitespace-pre-wrap"
                      style={{
                        fontSize: 13,
                        color: "rgba(255,255,255,0.7)",
                        lineHeight: 1.7,
                      }}
                    >
                      {templateText}
                    </pre>
                    <button
                      onClick={() => handleCopy(templateText, i)}
                      className="absolute top-3 right-3 font-body flex items-center gap-1 px-2 py-1 transition-colors"
                      style={{
                        fontSize: 12,
                        color:
                          copiedIdx === i
                            ? "var(--brand-accent)"
                            : "rgba(255,255,255,0.3)",
                        background: "rgba(0,0,0,0.3)",
                        border: "1px solid rgba(255,255,255,0.08)",
                        cursor: "pointer",
                      }}
                    >
                      {copiedIdx === i ? (
                        <>
                          <Check size={12} /> Copied!
                        </>
                      ) : (
                        <>
                          <Copy size={12} /> Copy
                        </>
                      )}
                    </button>
                  </div>
                  {tmpl.customization_tips && (
                    <div className="mt-3">
                      <p
                        className="font-body uppercase mb-1"
                        style={{
                          fontSize: 12,
                          letterSpacing: "0.12em",
                          color: "var(--brand-accent)",
                        }}
                      >
                        Customization Tips
                      </p>
                      <p
                        className="font-body"
                        style={{
                          fontSize: 12,
                          color: "rgba(255,255,255,0.7)",
                          lineHeight: 1.5,
                        }}
                      >
                        {typeof tmpl.customization_tips === "string"
                          ? tmpl.customization_tips
                          : JSON.stringify(tmpl.customization_tips)}
                      </p>
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

const FilterBtn = ({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) => (
  <button
    onClick={onClick}
    className="font-body uppercase px-3 py-1.5 transition-all"
    style={{
      fontSize: 12,
      letterSpacing: "0.1em",
      border: "1px solid",
      borderColor: active ? "var(--brand-accent)" : "rgba(255,255,255,0.08)",
      color: active ? "var(--brand-accent)" : "rgba(255,255,255,0.35)",
      background: active ? "rgba(var(--brand-accent-rgb),0.08)" : "transparent",
      cursor: "pointer",
    }}
  >
    {children}
  </button>
);

export default TemplateRenderer;
