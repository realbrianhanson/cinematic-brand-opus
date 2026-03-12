import { useState, useMemo } from "react";
import { Check, X, LayoutGrid, Table } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ProTips } from "./IdeaListRenderer";

const verdictColors: Record<string, { bg: string; color: string }> = {
  "top-pick": { bg: "rgba(251,191,36,0.15)", color: "#FBBF24" },
  "great-value": { bg: "rgba(74,222,128,0.12)", color: "#4ADE80" },
  "best-for-beginners": { bg: "rgba(96,165,250,0.12)", color: "#60A5FA" },
  "honorable-mention": { bg: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.4)" },
};

const ToolRoundupRenderer = ({ contentJson, nicheName, pageId }: { contentJson: any; nicheName: string; pageId: string }) => {
  const tools: any[] = contentJson?.sections?.flatMap((s: any) => s.items || []) || contentJson?.tools || contentJson?.items || [];
  const [verdictFilter, setVerdictFilter] = useState("");
  const [viewMode, setViewMode] = useState<"cards" | "table">("cards");
  const verdicts = useMemo(() => [...new Set(tools.map((t) => t.verdict).filter(Boolean))], [tools]);

  const logEvent = (type: string, meta: any = {}) => {
    supabase.from("page_engagement").insert({ page_id: pageId, event_type: type, metadata: meta }).then(() => {});
  };

  const filtered = useMemo(() => {
    if (!verdictFilter) return tools;
    return tools.filter((t) => t.verdict === verdictFilter);
  }, [tools, verdictFilter]);

  return (
    <div>
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3 mb-8">
        <div className="flex gap-2 flex-wrap">
          <FilterBtn active={!verdictFilter} onClick={() => { setVerdictFilter(""); logEvent("filter_use", { filter: "verdict", value: "all" }); }}>All</FilterBtn>
          {verdicts.map((v) => (
            <FilterBtn key={v} active={verdictFilter === v} onClick={() => { setVerdictFilter(v); logEvent("filter_use", { filter: "verdict", value: v }); }}>{v.replace(/-/g, " ")}</FilterBtn>
          ))}
        </div>
        <div className="flex gap-1 ml-auto">
          <button onClick={() => setViewMode("cards")} className="p-2" style={{ color: viewMode === "cards" ? "#D4AF55" : "rgba(255,255,255,0.2)", background: "none", border: "none", cursor: "pointer" }}><LayoutGrid size={16} /></button>
          <button onClick={() => setViewMode("table")} className="p-2" style={{ color: viewMode === "table" ? "#D4AF55" : "rgba(255,255,255,0.2)", background: "none", border: "none", cursor: "pointer" }}><Table size={16} /></button>
        </div>
      </div>

      {viewMode === "cards" ? (
        <div className="grid md:grid-cols-2 gap-5 mb-12">
          {filtered.map((tool, i) => {
            const vc = verdictColors[tool.verdict] || verdictColors["honorable-mention"];
            return (
              <div key={i} className="p-6 relative" style={{ border: "1px solid rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.02)" }}>
                {tool.verdict && (
                  <span className="font-body uppercase absolute top-4 right-4 px-2 py-0.5" style={{ fontSize: 8, letterSpacing: "0.1em", background: vc.bg, color: vc.color }}>
                    {tool.verdict.replace(/-/g, " ")}
                  </span>
                )}
                <h3 className="font-body font-semibold mb-2" style={{ fontSize: 16, color: "rgba(255,255,255,0.85)" }}>{tool.name || tool.title}</h3>
                <p className="font-body mb-3" style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", lineHeight: 1.5 }}>{tool.description}</p>
                {tool.pricing && <p className="font-body mb-2" style={{ fontSize: 12, color: "#D4AF55" }}>{tool.pricing}</p>}
                {tool.best_for && <p className="font-body mb-3" style={{ fontSize: 12, color: "rgba(255,255,255,0.3)" }}>Best for: {tool.best_for}</p>}
                <div className="grid grid-cols-2 gap-3 mt-3">
                  {tool.pros && (
                    <div>
                      {tool.pros.map((p: string, pi: number) => (
                        <div key={pi} className="font-body flex items-start gap-1.5 mb-1" style={{ fontSize: 12, color: "#4ADE80" }}>
                          <Check size={12} className="shrink-0 mt-0.5" /> <span style={{ color: "rgba(255,255,255,0.45)" }}>{p}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {tool.cons && (
                    <div>
                      {tool.cons.map((c: string, ci: number) => (
                        <div key={ci} className="font-body flex items-start gap-1.5 mb-1" style={{ fontSize: 12, color: "#F87171" }}>
                          <X size={12} className="shrink-0 mt-0.5" /> <span style={{ color: "rgba(255,255,255,0.45)" }}>{c}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="overflow-x-auto mb-12">
          <table className="w-full" style={{ borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                {["Tool", "Pricing", "Best For", "Verdict"].map((h) => (
                  <th key={h} className="font-body uppercase text-left px-4 py-3" style={{ fontSize: 10, letterSpacing: "0.12em", color: "rgba(255,255,255,0.3)" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((tool, i) => (
                <tr key={i} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                  <td className="font-body px-4 py-3" style={{ fontSize: 13, color: "rgba(255,255,255,0.7)" }}>{tool.name || tool.title}</td>
                  <td className="font-body px-4 py-3" style={{ fontSize: 12, color: "#D4AF55" }}>{tool.pricing || "—"}</td>
                  <td className="font-body px-4 py-3" style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>{tool.best_for || "—"}</td>
                  <td className="font-body px-4 py-3"><span className="uppercase" style={{ fontSize: 9, letterSpacing: "0.1em", color: "rgba(255,255,255,0.35)" }}>{tool.verdict?.replace(/-/g, " ") || "—"}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ProTips tips={contentJson?.pro_tips} />
    </div>
  );
};

const FilterBtn = ({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) => (
  <button onClick={onClick} className="font-body uppercase px-3 py-1.5 transition-all capitalize" style={{ fontSize: 10, letterSpacing: "0.1em", border: "1px solid", borderColor: active ? "#D4AF55" : "rgba(255,255,255,0.08)", color: active ? "#D4AF55" : "rgba(255,255,255,0.35)", background: active ? "rgba(212,175,85,0.08)" : "transparent", cursor: "pointer" }}>
    {children}
  </button>
);

export default ToolRoundupRenderer;
