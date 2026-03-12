import { useState, useMemo } from "react";
import { Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ProTips } from "./IdeaListRenderer";

const FAQRenderer = ({ contentJson, nicheName, pageId }: { contentJson: any; nicheName: string; pageId: string }) => {
  const sections: any[] = contentJson?.sections || [];
  const allFaqs = useMemo(() => sections.flatMap((s) => (s.items || s.questions || []).map((q: any) => ({ ...q, category: s.title || s.name }))), [sections]);
  const categories = useMemo(() => [...new Set(allFaqs.map((f) => f.category).filter(Boolean))], [allFaqs]);
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("");
  const [openIdx, setOpenIdx] = useState<number | null>(null);

  const logEvent = (type: string, meta: any = {}) => {
    supabase.from("page_engagement").insert({ page_id: pageId, event_type: type, metadata: meta }).then(() => {});
  };

  const filtered = useMemo(() => {
    return allFaqs.filter((faq) => {
      if (catFilter && faq.category !== catFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        return (faq.question?.toLowerCase().includes(q) || faq.answer?.toLowerCase().includes(q));
      }
      return true;
    });
  }, [allFaqs, catFilter, search]);

  return (
    <div>
      {/* Search */}
      <div className="relative mb-6">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "rgba(255,255,255,0.25)" }} />
        <input
          value={search}
          onChange={(e) => { setSearch(e.target.value); logEvent("filter_use", { filter: "search", value: e.target.value }); }}
          placeholder="Search questions..."
          className="font-body w-full pl-9 pr-4 py-3"
          style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "#fff", fontSize: 14, outline: "none" }}
        />
      </div>

      {/* Category filter */}
      {categories.length > 1 && (
        <div className="flex flex-wrap gap-2 mb-8">
          <FilterBtn active={!catFilter} onClick={() => { setCatFilter(""); logEvent("filter_use", { filter: "category", value: "all" }); }}>All</FilterBtn>
          {categories.map((c) => (
            <FilterBtn key={c} active={catFilter === c} onClick={() => { setCatFilter(c); logEvent("filter_use", { filter: "category", value: c }); }}>{c}</FilterBtn>
          ))}
        </div>
      )}

      {/* FAQ items */}
      <div className="flex flex-col mb-12">
        {filtered.map((faq, i) => {
          const isOpen = openIdx === i;
          return (
            <div key={i} style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
              <button
                onClick={() => { setOpenIdx(isOpen ? null : i); logEvent("faq_click", { question: faq.question }); }}
                className="w-full text-left py-5 font-body flex items-center justify-between"
                style={{ background: "none", border: "none", cursor: "pointer", color: isOpen ? "#D4AF55" : "rgba(255,255,255,0.7)", fontSize: 15, fontWeight: 500 }}
              >
                <span className="pr-4">{faq.question}</span>
                <span style={{ fontSize: 18, flexShrink: 0 }}>{isOpen ? "−" : "+"}</span>
              </button>
              {isOpen && (
                <div className="pb-5">
                  <p className="font-body" style={{ fontSize: 14, color: "rgba(255,255,255,0.45)", lineHeight: 1.7 }}>
                    {faq.answer}
                  </p>
                  {faq.related_questions && Array.isArray(faq.related_questions) && (
                    <div className="mt-3">
                      <p className="font-body uppercase mb-1" style={{ fontSize: 9, letterSpacing: "0.12em", color: "rgba(255,255,255,0.25)" }}>Related</p>
                      {faq.related_questions.map((rq: string, ri: number) => (
                        <button
                          key={ri}
                          onClick={() => {
                            const idx = filtered.findIndex((f) => f.question === rq);
                            if (idx >= 0) setOpenIdx(idx);
                          }}
                          className="block font-body transition-colors hover:text-[#D4AF55]"
                          style={{ fontSize: 12, color: "rgba(255,255,255,0.3)", background: "none", border: "none", cursor: "pointer", textAlign: "left", padding: "2px 0" }}
                        >
                          → {rq}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <p className="font-body mb-8" style={{ fontSize: 13, color: "rgba(255,255,255,0.3)" }}>No questions match your search.</p>
      )}

      <ProTips tips={contentJson?.pro_tips} />
    </div>
  );
};

const FilterBtn = ({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) => (
  <button onClick={onClick} className="font-body uppercase px-3 py-1.5 transition-all" style={{ fontSize: 10, letterSpacing: "0.1em", border: "1px solid", borderColor: active ? "#D4AF55" : "rgba(255,255,255,0.08)", color: active ? "#D4AF55" : "rgba(255,255,255,0.35)", background: active ? "rgba(212,175,85,0.08)" : "transparent", cursor: "pointer" }}>
    {children}
  </button>
);

export default FAQRenderer;
