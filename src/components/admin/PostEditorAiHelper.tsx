import { Loader2, Sparkles } from "lucide-react";
interface Props {
  criteria: {
    label: string;
    done: boolean;
    points: string;
    category: string;
  }[];
  aiGenerating: boolean;
  enhancing: boolean;
  hasGenerated: boolean;
  canGenerate: boolean;
  onGenerate: () => void;
  onEnhance: () => void;
}
export default function PostEditorAiHelper({
  criteria,
  aiGenerating,
  enhancing,
  canGenerate,
  onGenerate,
  onEnhance,
}: Props) {
  return (
    <div className="admin-card" style={{ padding: 20 }}>
      <h2 className="admin-label">Article assistant</h2>
      <p className="text-sm mb-4">
        Draft accurate metadata from the article. FAQs, summaries, and lists are
        optional; add them only when they help. There is no ranking score or
        required word count.
      </p>
      <ul className="space-y-2 mb-4 text-sm">
        {criteria.map((c) => (
          <li key={c.label}>
            {c.done ? "✓" : "○"} {c.label}
            {c.category === "Review" ? " (manual review)" : ""}
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        <button
          className="admin-btn-primary"
          disabled={!canGenerate || aiGenerating || enhancing}
          onClick={onGenerate}
        >
          {aiGenerating ? (
            <Loader2 className="animate-spin" size={14} />
          ) : (
            <Sparkles size={14} />
          )}{" "}
          Draft metadata
        </button>
        <button
          className="admin-btn-secondary"
          disabled={!canGenerate || aiGenerating || enhancing}
          onClick={onEnhance}
        >
          {enhancing ? "Reviewing…" : "Review missing metadata"}
        </button>
      </div>
      <p className="text-xs mt-3">
        AI suggestions still need an editor to check claims, sources, and
        promises.
      </p>
    </div>
  );
}
