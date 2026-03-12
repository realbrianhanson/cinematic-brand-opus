import { useState, useMemo } from "react";
import { RotateCcw, Printer } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ProTips } from "./IdeaListRenderer";

const priorityColors: Record<string, { bg: string; color: string }> = {
  high: { bg: "rgba(248,113,113,0.12)", color: "#F87171" },
  medium: { bg: "rgba(251,191,36,0.12)", color: "#FBBF24" },
  low: { bg: "rgba(74,222,128,0.12)", color: "#4ADE80" },
};

const ChecklistRenderer = ({ contentJson, nicheName, pageId }: { contentJson: any; nicheName: string; pageId: string }) => {
  const phases: any[] = contentJson?.sections || contentJson?.phases || [];
  const allSteps = useMemo(() => phases.flatMap((p) => p.items || p.steps || []), [phases]);
  const [checked, setChecked] = useState<Set<string>>(new Set());

  const total = allSteps.length;
  const done = checked.size;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  const toggle = (key: string) => {
    const next = new Set(checked);
    if (next.has(key)) next.delete(key); else next.add(key);
    setChecked(next);
    supabase.from("page_engagement").insert({ page_id: pageId, event_type: "checkbox_click", metadata: { step: key, checked: !checked.has(key) } }).then(() => {});
  };

  return (
    <div>
      {/* Progress */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-2">
          <span className="font-body" style={{ fontSize: 13, color: "rgba(255,255,255,0.5)" }}>
            {done} of {total} completed ({pct}%)
          </span>
          <div className="flex gap-2">
            <button onClick={() => setChecked(new Set())} aria-label="Reset checklist" className="font-body flex items-center gap-1 px-3 py-1 transition-colors hover:text-[#D4AF55]" style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", background: "none", border: "1px solid rgba(255,255,255,0.08)", cursor: "pointer" }}>
              <RotateCcw size={12} /> Reset
            </button>
            <button onClick={() => window.print()} aria-label="Print checklist" data-print-hide className="font-body flex items-center gap-1 px-3 py-1 transition-colors hover:text-[#D4AF55]" style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", background: "none", border: "1px solid rgba(255,255,255,0.08)", cursor: "pointer" }}>
              <Printer size={12} /> Print
            </button>
          </div>
        </div>
        <div style={{ height: 4, background: "rgba(255,255,255,0.06)", borderRadius: 2, overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${pct}%`, background: "#D4AF55", transition: "width 0.3s", borderRadius: 2 }} />
        </div>
      </div>

      {/* Phases */}
      {phases.map((phase, pi) => (
        <div key={pi} className="mb-10">
          <h2 className="font-display italic mb-2" style={{ fontSize: 20, color: "#fff" }}>{phase.title || phase.name || `Phase ${pi + 1}`}</h2>
          {phase.description && <p className="font-body mb-5" style={{ fontSize: 13, color: "rgba(255,255,255,0.35)", lineHeight: 1.6 }}>{phase.description}</p>}
          <div className="flex flex-col gap-3">
            {(phase.items || phase.steps || []).map((step: any, si: number) => {
              const key = `${pi}-${si}`;
              const isChecked = checked.has(key);
              const pc = priorityColors[step.priority?.toLowerCase()] || priorityColors.medium;
              return (
                <label
                  key={key}
                  className="flex items-start gap-4 p-4 cursor-pointer transition-all"
                  style={{
                    border: "1px solid",
                    borderColor: isChecked ? "rgba(212,175,85,0.2)" : "rgba(255,255,255,0.06)",
                    background: isChecked ? "rgba(212,175,85,0.03)" : "transparent",
                    opacity: isChecked ? 0.6 : 1,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => toggle(key)}
                    className="mt-1 accent-[#D4AF55]"
                    style={{ width: 16, height: 16 }}
                  />
                  <div className="flex-1">
                    <h3 className="font-body font-semibold mb-1" style={{ fontSize: 14, color: "rgba(255,255,255,0.8)", textDecoration: isChecked ? "line-through" : "none" }}>
                      {step.title || step.name}
                    </h3>
                    {step.description && <p className="font-body" style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", lineHeight: 1.5 }}>{step.description}</p>}
                    <div className="flex items-center gap-2 mt-2">
                      {step.priority && (
                        <span className="font-body uppercase px-2 py-0.5" style={{ fontSize: 9, letterSpacing: "0.1em", background: pc.bg, color: pc.color }}>
                          {step.priority}
                        </span>
                      )}
                      {step.estimated_time && (
                        <span className="font-body" style={{ fontSize: 11, color: "rgba(255,255,255,0.25)" }}>{step.estimated_time}</span>
                      )}
                    </div>
                  </div>
                </label>
              );
            })}
          </div>
        </div>
      ))}

      <ProTips tips={contentJson?.pro_tips} />
    </div>
  );
};

export default ChecklistRenderer;
