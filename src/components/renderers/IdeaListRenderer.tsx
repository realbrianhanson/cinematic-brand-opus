import { toast } from "@/hooks/use-toast";
import {
  parseContentDocument,
  type ContentDocument,
} from "@/lib/contentDocument";
import type { Json } from "@/integrations/supabase/types";
import { renderInlineMarkdown } from "@/lib/inlineMarkdown";
import { getItemTitle } from "@/lib/itemTitle";
import { useState, useMemo } from "react";
import { Search, Copy, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

const diffColors: Record<
  string,
  { bg: string; color: string; border: string }
> = {
  beginner: {
    bg: "rgba(232,201,106,0.10)",
    color: "var(--site-accent-ink, var(--brand-accent-light))",
    border: "rgba(232,201,106,0.35)",
  },
  intermediate: {
    bg: "rgba(var(--brand-accent-rgb),0.14)",
    color: "var(--site-accent-ink, var(--brand-accent))",
    border: "rgba(var(--brand-accent-rgb),0.4)",
  },
  advanced: {
    bg: "rgba(184,150,46,0.18)",
    color: "var(--site-accent-ink, var(--brand-accent-dark))",
    border: "rgba(184,150,46,0.45)",
  },
};

const IdeaListRenderer = ({
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
  const items =
    contentJson?.sections?.flatMap((s) => s.items || []) ||
    contentJson?.items ||
    [];
  const categories = useMemo(
    () => [
      ...new Set(
        items
          .map((i) => i.category)
          .filter((value): value is string => !!value),
      ),
    ],
    [items],
  );
  const [catFilter, setCatFilter] = useState("");
  const [diffFilter, setDiffFilter] = useState("");
  const [search, setSearch] = useState("");
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

  const logEvent = (type: string, meta: Json = {}) => {
    supabase
      .from("page_engagement")
      .insert({ page_id: pageId, event_type: type, metadata: meta })
      .then(() => {});
  };

  const filtered = useMemo(() => {
    return items.filter((item) => {
      if (catFilter && item.category !== catFilter) return false;
      if (diffFilter && item.difficulty?.toLowerCase() !== diffFilter)
        return false;
      if (search) {
        const q = search.toLowerCase();
        const t = getItemTitle(item);
        return (
          t.toLowerCase().includes(q) ||
          item.description?.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [items, catFilter, diffFilter, search]);

  const handleCopy = async (title: string, idx: number) => {
    try {
      await navigator.clipboard.writeText(title);
    } catch {
      toast({
        title: "Could not copy",
        description: "Select the text and copy it manually.",
        variant: "destructive",
      });
      return;
    }
    setCopiedIdx(idx);
    logEvent("copy_click", { item: title });
    setTimeout(() => setCopiedIdx(null), 2000);
  };

  return (
    <div>
      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-6">
        {/* Category tabs */}
        <div className="flex flex-wrap gap-2">
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
      </div>

      <div className="flex flex-wrap gap-3 mb-6 items-center">
        {/* Difficulty */}
        <div className="flex gap-2">
          {["beginner", "intermediate", "advanced"].map((d) => (
            <FilterBtn
              key={d}
              active={diffFilter === d}
              onClick={() => {
                setDiffFilter(diffFilter === d ? "" : d);
                logEvent("filter_use", { filter: "difficulty", value: d });
              }}
            >
              {d.charAt(0).toUpperCase() + d.slice(1)}
            </FilterBtn>
          ))}
        </div>

        {/* Search */}
        <div className="relative flex-1 min-w-[200px]">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2"
            style={{ color: "var(--site-text-70, rgba(255,255,255,0.7))" }}
          />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search ideas..."
            className="font-body w-full pl-9 pr-4 py-2"
            style={{
              background: "rgba(var(--site-ink-rgb,255,255,255),0.04)",
              border: "1px solid rgba(var(--site-ink-rgb,255,255,255),0.08)",
              color: "var(--site-ink, #fff)",
              fontSize: 13,
              outline: "none",
            }}
          />
        </div>
      </div>

      <p
        className="font-body mb-6"
        style={{
          fontSize: 12,
          color: "var(--site-text-70, rgba(255,255,255,0.7))",
        }}
      >
        Showing {filtered.length} of {items.length} ideas
      </p>

      {/* Grid */}
      <div className="grid md:grid-cols-2 gap-5 mb-12">
        {filtered.map((item, i) => {
          const dc =
            diffColors[item.difficulty?.toLowerCase() || "beginner"] ||
            diffColors.beginner;
          const itemTitle = getItemTitle(item);
          return (
            <div
              key={i}
              className="p-6"
              style={{
                border: "1px solid rgba(var(--site-ink-rgb,255,255,255),0.08)",
                background: "var(--site-surface, #181820)",
              }}
            >
              <div className="flex items-start justify-between gap-3 mb-2">
                <h3
                  className="font-body font-semibold"
                  style={{
                    fontSize: 19,
                    color: "var(--site-text-95, rgba(255,255,255,0.95))",
                    lineHeight: 1.35,
                  }}
                >
                  {itemTitle}
                </h3>
                <button
                  onClick={() => handleCopy(itemTitle, i)}
                  className="shrink-0 p-1.5 transition-colors"
                  style={{
                    color:
                      copiedIdx === i
                        ? "var(--site-accent-ink, var(--brand-accent))"
                        : "var(--site-text-70, rgba(255,255,255,0.7))",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                  }}
                  aria-label={`Copy title: ${itemTitle}`}
                >
                  {copiedIdx === i ? <Check size={14} /> : <Copy size={14} />}
                </button>
              </div>
              <p
                className="font-body mb-3"
                style={{
                  fontSize: 16,
                  color: "var(--site-text-85, rgba(255,255,255,0.85))",
                  lineHeight: 1.6,
                  display: "-webkit-box",
                  WebkitLineClamp: 3,
                  WebkitBoxOrient: "vertical",
                  overflow: "hidden",
                }}
              >
                {renderInlineMarkdown(item.description)}
              </p>
              <div className="flex items-center gap-2 flex-wrap">
                {item.difficulty && (
                  <span
                    className="font-body uppercase px-2 py-0.5"
                    style={{
                      fontSize: 12,
                      letterSpacing: "0.1em",
                      background: dc.bg,
                      color: dc.color,
                      border: `1px solid ${dc.border}`,
                    }}
                  >
                    {item.difficulty}
                  </span>
                )}
                {item.category && (
                  <span
                    className="font-body uppercase px-2 py-0.5"
                    style={{
                      fontSize: 12,
                      letterSpacing: "0.1em",
                      background: "rgba(var(--brand-accent-rgb),0.08)",
                      color: "var(--site-text-75, rgba(255,255,255,0.75))",
                      border:
                        "1px solid rgba(var(--site-ink-rgb,255,255,255),0.1)",
                    }}
                  >
                    {item.category}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Pro Tips */}
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
      borderColor: active
        ? "var(--brand-accent)"
        : "rgba(var(--site-ink-rgb,255,255,255),0.08)",
      color: active
        ? "var(--site-accent-ink, var(--brand-accent))"
        : "var(--site-text-35, rgba(255,255,255,0.35))",
      background: active ? "rgba(var(--brand-accent-rgb),0.08)" : "transparent",
      cursor: "pointer",
    }}
  >
    {children}
  </button>
);

const ProTips = ({ tips }: { tips?: ContentDocument["pro_tips"] }) => {
  if (!tips || !Array.isArray(tips) || tips.length === 0) return null;
  return (
    <div
      className="p-6 mt-2"
      style={{
        borderLeft: "3px solid var(--brand-accent)",
        background: "rgba(var(--brand-accent-rgb),0.08)",
        border: "1px solid rgba(var(--brand-accent-rgb),0.2)",
        borderLeftWidth: 3,
      }}
    >
      <h3
        className="font-display mb-4"
        style={{
          fontSize: 20,
          color: "var(--site-accent-ink, var(--brand-accent-light))",
        }}
      >
        Pro Tips
      </h3>
      <ol className="flex flex-col gap-3 list-decimal list-inside">
        {tips.map((tip, i) => (
          <li
            key={i}
            className="font-body"
            style={{
              fontSize: 16,
              color: "var(--site-text-90, rgba(255,255,255,0.9))",
              lineHeight: 1.65,
            }}
          >
            {typeof tip === "string"
              ? tip
              : tip.tip || tip.text || JSON.stringify(tip)}
          </li>
        ))}
      </ol>
    </div>
  );
};

export { ProTips };
export default IdeaListRenderer;
