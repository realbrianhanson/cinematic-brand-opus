import { useEffect, useRef, useState } from "react";

const chapters = [
  {
    tag: "Origins",
    era: "Small-Town Iowa",
    title: "Started With Nothing.",
    body: "No money. No connections. No degree. Just necessity and an obsession with figuring out what actually works.",
  },
  {
    tag: "First Bet",
    era: "Mid-20s",
    title: "Built an Engine.",
    body: "Grew one of the largest engine and transmission companies in the country — without knowing how to change my own oil. Systems and selling beat credentials.",
  },
  {
    tag: "The Scale",
    era: "2010s",
    title: "4× Inc. 5000.",
    body: "Earned Inc. 5000 four times, peaking at #80 in the nation. Studied the legends of direct response — Halbert, Schwartz, Kennedy, Cialdini — and applied them to real businesses.",
  },
  {
    tag: "The Fire",
    era: "2020",
    title: "Lost It All.",
    body: "COVID destroyed my live events business. Over $1 million in debt. I could have filed bankruptcy. Instead I chose to rebuild from the ashes.",
  },
  {
    tag: "The Rebuild",
    era: "Now",
    title: "A.I. For Business.",
    body: "Built A.I. For Business — 150,000+ members. Created Revven, a SaaS with 3,000+ users, without writing a single line of code. The playing field has never been more level.",
  },
];

const Chapter = ({ c, i }: { c: typeof chapters[number]; i: number }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [vis, setVis] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setVis(true); obs.disconnect(); } },
      { threshold: 0.15, rootMargin: "0px 0px -10% 0px" }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const left = i % 2 === 0;
  return (
    <div ref={ref} className="relative grid grid-cols-1 lg:grid-cols-2 gap-8 mb-16 lg:mb-24">
      {/* spine node */}
      <div className="hidden lg:block absolute left-1/2 top-6 -translate-x-1/2 z-10">
        <div
          style={{
            width: 14, height: 14,
            background: vis ? "var(--gold)" : "var(--bg-deep)",
            border: "1.5px solid var(--gold)",
            transform: "rotate(45deg)",
            boxShadow: vis ? "0 0 24px rgba(216,180,106,0.45)" : "none",
            transition: "background 400ms ease, box-shadow 400ms ease",
          }}
        />
      </div>

      <div
        className={`${left ? "lg:pr-16 lg:text-right" : "lg:col-start-2 lg:pl-16"} relative`}
        style={{
          opacity: vis ? 1 : 0,
          transform: vis ? "translateY(0)" : "translateY(20px)",
          transition: `opacity 400ms ease-out ${i * 70}ms, transform 400ms ease-out ${i * 70}ms`,
        }}
      >
        <div
          className={`relative p-7 lg:p-9 ${left ? "lg:ml-auto" : ""}`}
          style={{
            background: "var(--bg-section)",
            border: "1px solid var(--hairline)",
            maxWidth: 520,
          }}
        >
          {/* Faint number */}
          <div
            className="absolute font-display select-none pointer-events-none"
            style={{
              top: -10,
              [left ? "right" : "left"]: -8,
              fontSize: 120,
              lineHeight: 1,
              fontWeight: 600,
              color: "transparent",
              WebkitTextStroke: "1px rgba(216,180,106,0.18)",
            } as React.CSSProperties}
          >
            {String(i + 1).padStart(2, "0")}
          </div>
          <span
            className="inline-block font-body font-bold uppercase mb-3"
            style={{
              fontSize: 10,
              letterSpacing: "0.22em",
              color: "var(--gold)",
              background: "rgba(216,180,106,0.1)",
              padding: "4px 10px",
            }}
          >
            {c.tag}
          </span>
          <div
            className="font-body uppercase mb-2"
            style={{ fontSize: 11, letterSpacing: "0.25em", color: "var(--label-muted)" }}
          >
            {c.era}
          </div>
          <h3
            className="font-display mb-3"
            style={{
              fontSize: "clamp(1.5rem, 2.6vw, 2rem)",
              lineHeight: 1.15,
              color: "var(--warm-white)",
              fontWeight: 600,
            }}
          >
            {c.title}
          </h3>
          <p style={{ fontSize: 15.5, lineHeight: 1.75, color: "var(--warm-body)" }}>{c.body}</p>
        </div>
      </div>
    </div>
  );
};

const Story = () => {
  const sectionRef = useRef<HTMLElement>(null);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) { setProgress(1); return; }
    const onScroll = () => {
      const el = sectionRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const vh = window.innerHeight;
      const total = rect.height + vh * 0.4;
      const seen = Math.min(total, Math.max(0, vh - rect.top));
      setProgress(Math.min(1, seen / total));
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <section
      id="story"
      ref={sectionRef}
      className="relative py-28 lg:py-40"
      style={{ background: "var(--bg-deep)" }}
    >
      <div className="mx-auto px-6 lg:px-14" style={{ maxWidth: 1240 }}>
        {/* Header */}
        <div className="text-center mb-20">
          <div className="inline-flex items-center gap-3 mb-6">
            <div style={{ width: 40, height: 1, background: "var(--gold)" }} />
            <span
              className="font-body font-semibold uppercase"
              style={{ fontSize: 10, letterSpacing: "0.3em", color: "var(--gold)" }}
            >
              The Story
            </span>
            <div style={{ width: 40, height: 1, background: "var(--gold)" }} />
          </div>
          <h2
            className="font-display"
            style={{
              fontSize: "clamp(2.25rem, 5vw, 4rem)",
              lineHeight: 1.08,
              fontWeight: 500,
            }}
          >
            From Nothing to <span className="gold-italic" style={{ fontWeight: 600 }}>150,000 Strong</span>
          </h2>
        </div>

        {/* Timeline */}
        <div className="relative">
          {/* Spine */}
          <div
            className="hidden lg:block absolute left-1/2 -translate-x-1/2 top-0 bottom-0 w-px"
            style={{ background: "rgba(216,180,106,0.15)" }}
          />
          {/* Progress fill */}
          <div
            className="hidden lg:block absolute left-1/2 -translate-x-1/2 top-0 w-px origin-top"
            style={{
              height: `${progress * 100}%`,
              background: "linear-gradient(180deg, var(--gold-light), var(--gold), var(--gold-deep))",
              boxShadow: "0 0 12px rgba(216,180,106,0.45)",
              transition: "height 0.1s linear",
            }}
          />
          {chapters.map((c, i) => (
            <Chapter key={i} c={c} i={i} />
          ))}
        </div>

        {/* Pull quote */}
        <div className="text-center mt-16 lg:mt-24 max-w-3xl mx-auto">
          <p
            className="font-display italic"
            style={{
              fontSize: "clamp(1.35rem, 2.5vw, 1.9rem)",
              lineHeight: 1.45,
              color: "var(--warm-white)",
              fontWeight: 400,
            }}
          >
            “I didn't come from money, connections, or a degree.
            I came from necessity and a refusal to stay stuck.”
          </p>
          <div className="mt-6 flex justify-center">
            <div style={{ width: 40, height: 1, background: "var(--gold)" }} />
          </div>
        </div>
      </div>
    </section>
  );
};

export default Story;
