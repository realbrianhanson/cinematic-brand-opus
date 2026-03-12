import { useState, useMemo } from "react";
import { Search, Copy, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

const diffColors: Record<string, { bg: string; color: string }> = {
  beginner: { bg: "rgba(74,222,128,0.12)", color: "#4ADE80" },
  intermediate: { bg: "rgba(251,191,36,0.12)", color: "#FBBF24" },
  advanced: { bg: "rgba(248,113,113,0.12)", color: "#F87171" },
};

const IdeaListRenderer = ({ contentJson, nicheName, pageId }: { contentJson: any; nicheName: string; pageId: string }) => {
  const items: any[] = contentJson?.sections?.flatMap((s: any) => s.items || []) || contentJson?.items || [];
  const categories = useMemo(() => [...new Set(items.map((i) => i.category).filter(Boolean))], [items]);
  const [catFilter, setCatFilter] = useState("");
  const [diffFilter, setDiffFilter] = useState("");
  const [search, setSearch] = useState("");
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

  const logEvent = (type: string, meta: any = {}) => {
    supabase.from("page_engagement").insert({ page_id: pageId, event_type: type, metadata: meta }).then(() => {});
  };

  const filtered = useMemo(() => {
    return items.filter((item) => {
      if (catFilter && item.category !== catFilter) return false;
      if (diffFilter && item.difficulty?.toLowerCase() !== diffFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        return (item.title?.toLowerCase().includes(q) || item.description?.toLowerCase().includes(q));
      }
      return true;
    });
  }, [items, catFilter, diffFilter, search]);

  const handleCopy = (title: string, idx: number) => {
    navigator.clipboard.writeText(title);
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
          <FilterBtn active={!catFilter} onClick={() => { setCatFilter(""); logEvent("filter_use", { filter: "category", value: "all" }); }}>All</FilterBtn>
          {categories.map((c) => (
            <FilterBtn key={c} active={catFilter === c} onClick={() => { setCatFilter(c); logEvent("filter_use", { filter: "category", value: c }); }}>{c}</FilterBtn>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-3 mb-6 items-center">
        {/* Difficulty */}
        <div className="flex gap-2">
          {["beginner", "intermediate", "advanced"].map((d) => (
            <FilterBtn key={d} active={diffFilter === d} onClick={() => { setDiffFilter(diffFilter === d ? "" : d); logEvent("filter_use", { filter: "difficulty", value: d }); }}>
              {d.charAt(0).toUpperCase() + d.slice(1)}
            </FilterBtn>
          ))}
        </div>

        {/* Search */}
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "rgba(255,255,255,0.25)" }} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search ideas..."
            className="font-body w-full pl-9 pr-4 py-2"
            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "#fff", fontSize: 13, outline: "none" }}
          />
        </div>
      </div>

      <p className="font-body mb-6" style={{ fontSize: 12, color: "rgba(255,255,255,0.3)" }}>
        Showing {filtered.length} of {items.length} ideas
      </p>

      {/* Grid */}
      <div className="grid md:grid-cols-2 gap-5 mb-12">
        {filtered.map((item, i) => {
          const dc = diffColors[item.difficulty?.toLowerCase()] || diffColors.beginner;
          return (
            <div key={i} className="p-6" style={{ border: "1px solid rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.02)" }}>
              <div className="flex items-start justify-between gap-3 mb-2">
                <h3 className="font-body font-semibold" style={{ fontSize: 15, color: "rgba(255,255,255,0.85)", lineHeight: 1.4 }}>{item.title}</h3>
                <button
                  onClick={() => handleCopy(item.title, i)}
                  className="shrink-0 p-1.5 transition-colors"
                  style={{ color: copiedIdx === i ? "#D4AF55" : "rgba(255,255,255,0.2)", background: "none", border: "none", cursor: "pointer" }}
                  aria-label={`Copy title: ${item.title}`}
                >
                  {copiedIdx === i ? <Check size={14} /> : <Copy size={14} />}
                </button>
              </div>
              <p className="font-body mb-3" style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", lineHeight: 1.6, display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                {item.description}
              </p>
              <div className="flex items-center gap-2 flex-wrap">
                {item.difficulty && (
                  <span className="font-body uppercase px-2 py-0.5" style={{ fontSize: 9, letterSpacing: "0.1em", background: dc.bg, color: dc.color }}>
                    {item.difficulty}
                  </span>
                )}
                {item.category && (
                  <span className="font-body uppercase px-2 py-0.5" style={{ fontSize: 9, letterSpacing: "0.1em", background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.35)" }}>
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

const FilterBtn = ({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) => (
  <button
    onClick={onClick}
    className="font-body uppercase px-3 py-1.5 transition-all"
    style={{
      fontSize: 10,
      letterSpacing: "0.1em",
      border: "1px solid",
      borderColor: active ? "#D4AF55" : "rgba(255,255,255,0.08)",
      color: active ? "#D4AF55" : "rgba(255,255,255,0.35)",
      background: active ? "rgba(212,175,85,0.08)" : "transparent",
      cursor: "pointer",
    }}
  >
    {children}
  </button>
);

const ProTips = ({ tips }: { tips?: any[] | string[] }) => {
  if (!tips || !Array.isArray(tips) || tips.length === 0) return null;
  return (
    <div className="p-6 mt-2" style={{ borderLeft: "3px solid #D4AF55", background: "rgba(212,175,85,0.04)" }}>
      <h3 className="font-display italic mb-4" style={{ fontSize: 18, color: "#D4AF55" }}>Pro Tips</h3>
      <ol className="flex flex-col gap-3 list-decimal list-inside">
        {tips.map((tip, i) => (
          <li key={i} className="font-body" style={{ fontSize: 14, color: "rgba(255,255,255,0.55)", lineHeight: 1.6 }}>
            {typeof tip === "string" ? tip : tip.tip || tip.text || JSON.stringify(tip)}
          </li>
        ))}
      </ol>
    </div>
  );
};

export { ProTips };
export default IdeaListRenderer;
