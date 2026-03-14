import { Sparkles, Wand2, Loader2 } from "lucide-react";

interface ScoreCriteria {
  label: string;
  done: boolean;
  points: string;
  category: string;
}

interface PostEditorAiHelperProps {
  aeoScore: number;
  seoScore: number;
  criteria: ScoreCriteria[];
  aiGenerating: boolean;
  enhancing: boolean;
  hasGenerated: boolean;
  canGenerate: boolean;
  onGenerate: () => void;
  onEnhance: () => void;
}

const scoreColor = (score: number, max: number) =>
  score >= max * 0.66 ? "admin-sage" : "admin-accent";

const PostEditorAiHelper = ({
  aeoScore, seoScore,
  criteria,
  aiGenerating, enhancing, hasGenerated, canGenerate,
  onGenerate, onEnhance,
}: PostEditorAiHelperProps) => {
  const overall = Math.round(((aeoScore / 6) * 50) + ((seoScore / 4) * 50));
  const overallColor = overall >= 75 ? "admin-sage" : overall >= 40 ? "admin-accent" : "admin-danger";
  const done = criteria.filter(c => c.done).length;
  const total = criteria.length;

  return (
    <div className="admin-card" style={{ padding: 20 }}>
      <div className="flex items-center gap-2" style={{ marginBottom: 12 }}>
        <Wand2 size={14} style={{ color: "hsl(var(--admin-accent))" }} />
        <span className="admin-label" style={{ marginBottom: 0 }}>AI Helper</span>
      </div>
      <p className="font-body" style={{ fontSize: 11, color: "hsl(var(--admin-text-ghost))", marginBottom: 14, lineHeight: 1.5 }}>
        Generate all AEO/GEO &amp; SEO fields in one click based on your post content.
      </p>

      {/* Overall Score Ring */}
      <div style={{ marginBottom: 16, textAlign: "center" }}>
        <div style={{ position: "relative", width: 100, height: 100, margin: "0 auto 10px" }}>
          <svg viewBox="0 0 36 36" style={{ width: "100%", height: "100%", transform: "rotate(-90deg)" }}>
            <circle cx="18" cy="18" r="15.9" fill="none" stroke="hsl(var(--admin-surface-2))" strokeWidth="2.8" />
            <circle cx="18" cy="18" r="15.9" fill="none"
              stroke={`hsl(var(--${overallColor}))`}
              strokeWidth="2.8"
              strokeDasharray={`${overall} ${100 - overall}`}
              strokeLinecap="round"
              style={{ transition: "stroke-dasharray 0.5s ease" }}
            />
          </svg>
          <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
            <span className="font-heading" style={{ fontSize: 24, color: `hsl(var(--${overallColor}))`, lineHeight: 1 }}>{overall}</span>
            <span className="font-body" style={{ fontSize: 9, color: "hsl(var(--admin-text-ghost))" }}>/ 100</span>
          </div>
        </div>
        <p className="font-body" style={{ fontSize: 10, color: "hsl(var(--admin-text-ghost))", textTransform: "uppercase", letterSpacing: "0.08em" }}>
          Overall Score
        </p>
      </div>

      {/* Score Breakdown */}
      <div className="flex gap-3" style={{ marginBottom: 14 }}>
        <div style={{ flex: 1, backgroundColor: "hsl(var(--admin-surface-2))", borderRadius: 4, padding: "10px 12px", textAlign: "center" }}>
          <p className="font-body" style={{ fontSize: 9, color: "hsl(var(--admin-text-ghost))", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em" }}>AEO/GEO</p>
          <span className="font-heading" style={{ fontSize: 20, color: `hsl(var(--${scoreColor(aeoScore, 6)}))` }}>{aeoScore}</span>
          <span className="font-body" style={{ fontSize: 11, color: "hsl(var(--admin-text-ghost))" }}>/6</span>
        </div>
        <div style={{ flex: 1, backgroundColor: "hsl(var(--admin-surface-2))", borderRadius: 4, padding: "10px 12px", textAlign: "center" }}>
          <p className="font-body" style={{ fontSize: 9, color: "hsl(var(--admin-text-ghost))", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em" }}>SEO</p>
          <span className="font-heading" style={{ fontSize: 20, color: `hsl(var(--${scoreColor(seoScore, 4)}))` }}>{seoScore}</span>
          <span className="font-body" style={{ fontSize: 11, color: "hsl(var(--admin-text-ghost))" }}>/4</span>
        </div>
      </div>

      {/* Checklist */}
      <div style={{ marginBottom: 14 }}>
        <p className="admin-label" style={{ marginBottom: 10, fontSize: 10 }}>📈 Increase Your Score</p>
        <div style={{ backgroundColor: "hsl(var(--admin-surface-2))", borderRadius: 6, padding: "4px", marginBottom: 10 }}>
          <div style={{
            height: 6, borderRadius: 3,
            background: done === total
              ? "hsl(var(--admin-sage))"
              : "linear-gradient(90deg, hsl(var(--admin-accent)), hsl(var(--admin-sage)))",
            width: `${(done / total) * 100}%`,
            transition: "width 0.4s ease",
          }} />
        </div>
        <p className="font-body" style={{ fontSize: 10, color: "hsl(var(--admin-text-ghost))", marginBottom: 10, textAlign: "right" }}>
          {done}/{total} completed
        </p>
        {criteria.map((c, i) => (
          <div key={i} className="flex items-start gap-2" style={{ marginBottom: 6 }}>
            <span style={{ fontSize: 13, lineHeight: "18px", flexShrink: 0, color: c.done ? "hsl(var(--admin-sage))" : "hsl(var(--admin-text-ghost))" }}>
              {c.done ? "✓" : "○"}
            </span>
            <span className="font-body" style={{ fontSize: 11, lineHeight: "18px", flex: 1, color: c.done ? "hsl(var(--admin-text-ghost))" : "hsl(var(--admin-text-soft))", textDecoration: c.done ? "line-through" : "none" }}>
              {c.label}
            </span>
            <span className="font-body" style={{ fontSize: 9, lineHeight: "18px", color: c.done ? "hsl(var(--admin-sage))" : "hsl(var(--admin-accent))", fontWeight: 600 }}>
              {c.done ? "✓" : c.points}
            </span>
          </div>
        ))}
      </div>

      {/* Buttons */}
      <button
        onClick={onGenerate}
        disabled={aiGenerating || !canGenerate}
        className="admin-btn-primary w-full flex items-center justify-center gap-2"
        style={{ fontSize: 13 }}
      >
        {aiGenerating ? (
          <><Loader2 size={14} className="animate-spin" />Generating...</>
        ) : (
          <><Sparkles size={14} />Generate SEO &amp; AEO/GEO</>
        )}
      </button>

      {hasGenerated && (
        <button
          onClick={onEnhance}
          disabled={enhancing}
          className="w-full flex items-center justify-center gap-2 font-body"
          style={{
            marginTop: 8,
            background: enhancing
              ? "hsl(var(--admin-surface-2))"
              : "linear-gradient(135deg, hsl(var(--admin-accent)), hsl(var(--admin-sage)))",
            color: enhancing ? "hsl(var(--admin-text-ghost))" : "#fff",
            border: "none", borderRadius: 6, padding: "10px 16px", fontSize: 13, fontWeight: 600,
            cursor: enhancing ? "not-allowed" : "pointer",
          }}
        >
          {enhancing ? (
            <><Loader2 size={14} className="animate-spin" />Enhancing...</>
          ) : (
            <>📈 Increase Score<span style={{ background: "rgba(255,255,255,0.2)", borderRadius: 12, padding: "2px 8px", fontSize: 11 }}>{overall}%</span></>
          )}
        </button>
      )}
    </div>
  );
};

export default PostEditorAiHelper;
