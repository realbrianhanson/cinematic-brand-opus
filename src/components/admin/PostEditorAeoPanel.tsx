import { Plus, Trash2 } from "lucide-react";

interface FaqItem { question: string; answer: string; }

interface PostEditorAeoPanelProps {
  tldr: string;
  setTldr: (v: string) => void;
  keyTakeaways: string[];
  faqItems: FaqItem[];
  addTakeaway: () => void;
  removeTakeaway: (i: number) => void;
  updateTakeaway: (i: number, val: string) => void;
  addFaq: () => void;
  removeFaq: (i: number) => void;
  updateFaq: (i: number, field: keyof FaqItem, val: string) => void;
  aeoTips: string[];
}

const PostEditorAeoPanel = ({
  tldr, setTldr,
  keyTakeaways, faqItems,
  addTakeaway, removeTakeaway, updateTakeaway,
  addFaq, removeFaq, updateFaq,
  aeoTips,
}: PostEditorAeoPanelProps) => (
  <div className="flex flex-col gap-5" style={{ padding: "0 20px 20px" }}>
    {aeoTips.length > 0 && (
      <div style={{ backgroundColor: "hsl(var(--admin-accent-soft))", borderRadius: 4, padding: 14 }}>
        <p className="admin-label" style={{ color: "hsl(var(--admin-accent))", marginBottom: 8 }}>Optimization Tips</p>
        {aeoTips.map((tip, i) => (
          <p key={i} className="font-body" style={{ fontSize: 11, color: "hsl(var(--admin-text-soft))", lineHeight: 1.6, marginBottom: 4 }}>• {tip}</p>
        ))}
      </div>
    )}

    <div>
      <label className="font-body block" style={{ fontSize: 11, color: "hsl(var(--admin-text-soft))", marginBottom: 4 }}>
        TL;DR Summary
        <span style={{ fontSize: 9, color: "hsl(var(--admin-text-ghost))", marginLeft: 6 }}>Shown at top · LLMs cite this</span>
      </label>
      <textarea
        value={tldr}
        onChange={(e) => setTldr(e.target.value)}
        rows={3}
        className="admin-input font-body w-full"
        style={{ resize: "vertical" as const }}
        placeholder="In 1-2 sentences, what's the core answer?"
      />
    </div>

    <div>
      <label className="font-body block" style={{ fontSize: 11, color: "hsl(var(--admin-text-soft))", marginBottom: 8 }}>
        Key Takeaways
        <span style={{ fontSize: 9, color: "hsl(var(--admin-text-ghost))", marginLeft: 6 }}>Bullet points for AI overviews</span>
      </label>
      {keyTakeaways.map((t, i) => (
        <div key={i} className="flex items-center gap-2" style={{ marginBottom: 6 }}>
          <span className="font-body" style={{ fontSize: 11, color: "hsl(var(--admin-accent))", minWidth: 16 }}>{i + 1}.</span>
          <input
            value={t}
            onChange={(e) => updateTakeaway(i, e.target.value)}
            className="admin-input font-body flex-1"
            placeholder="Key insight or actionable point"
          />
          {keyTakeaways.length > 1 && (
            <button
              onClick={() => removeTakeaway(i)}
              style={{ border: "none", background: "none", cursor: "pointer", color: "hsl(var(--admin-text-ghost))", padding: 4 }}
            >
              <Trash2 size={12} />
            </button>
          )}
        </div>
      ))}
      <button
        onClick={addTakeaway}
        className="font-body flex items-center gap-1"
        style={{ fontSize: 11, color: "hsl(var(--admin-accent))", background: "none", border: "none", cursor: "pointer", marginTop: 4 }}
      >
        <Plus size={12} /> Add takeaway
      </button>
    </div>

    <div>
      <label className="font-body block" style={{ fontSize: 11, color: "hsl(var(--admin-text-soft))", marginBottom: 8 }}>
        FAQ Schema
        <span style={{ fontSize: 9, color: "hsl(var(--admin-text-ghost))", marginLeft: 6 }}>Generates FAQPage JSON-LD</span>
      </label>
      {faqItems.map((faq, i) => (
        <div key={i} style={{ backgroundColor: "hsl(var(--admin-surface-2))", borderRadius: 4, padding: 12, marginBottom: 8 }}>
          <div className="flex items-center justify-between" style={{ marginBottom: 6 }}>
            <span className="admin-label" style={{ marginBottom: 0 }}>Q{i + 1}</span>
            {faqItems.length > 1 && (
              <button
                onClick={() => removeFaq(i)}
                style={{ border: "none", background: "none", cursor: "pointer", color: "hsl(var(--admin-text-ghost))", padding: 2 }}
              >
                <Trash2 size={11} />
              </button>
            )}
          </div>
          <input
            value={faq.question}
            onChange={(e) => updateFaq(i, "question", e.target.value)}
            className="admin-input font-body w-full"
            style={{ marginBottom: 6 }}
            placeholder="What question does this answer?"
          />
          <textarea
            value={faq.answer}
            onChange={(e) => updateFaq(i, "answer", e.target.value)}
            rows={2}
            className="admin-input font-body w-full"
            style={{ resize: "vertical" as const }}
            placeholder="Concise, direct answer (2-3 sentences)"
          />
        </div>
      ))}
      <button
        onClick={addFaq}
        className="font-body flex items-center gap-1"
        style={{ fontSize: 11, color: "hsl(var(--admin-accent))", background: "none", border: "none", cursor: "pointer", marginTop: 4 }}
      >
        <Plus size={12} /> Add FAQ
      </button>
    </div>
  </div>
);

export default PostEditorAeoPanel;
