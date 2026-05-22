import { useEffect, useRef, useState } from "react";

const stats = [
  { value: 4, suffix: "×", label: "Inc. 5000", sub: "Highest rank #80 in the nation" },
  { value: 150000, suffix: "+", label: "Community", sub: "Business owners trained" },
  { value: 50, prefix: "$", suffix: "M+", label: "Revenue Influenced", sub: "Across ventures" },
  { value: 3000, suffix: "+", label: "Revven Users", sub: "SaaS built with zero code" },
];

function format(n: number) {
  if (n >= 1000) return n.toLocaleString();
  return String(n);
}

const Counter = ({ to, prefix = "", suffix = "" }: { to: number; prefix?: string; suffix?: string }) => {
  const [value, setValue] = useState(to); // Guarantee non-zero render even if animation never runs
  const ref = useRef<HTMLSpanElement>(null);
  const started = useRef(false);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setValue(to);
      return;
    }
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting || started.current) return;
        started.current = true;
        const duration = 1400;
        const start = performance.now();
        // Start near 30% of target so it never reads as "zero"
        const from = Math.max(1, Math.round(to * 0.3));
        setValue(from);
        const tick = (t: number) => {
          const p = Math.min(1, (t - start) / duration);
          const eased = 1 - Math.pow(1 - p, 3);
          setValue(Math.round(from + (to - from) * eased));
          if (p < 1) requestAnimationFrame(tick);
          else setValue(to);
        };
        requestAnimationFrame(tick);
      },
      { threshold: 0.3 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [to]);

  return (
    <span ref={ref} className="font-display" style={{ color: "var(--warm-white)" }}>
      {prefix}
      {format(value)}
      <span className="gold-italic" style={{ fontStyle: "normal" }}>{suffix}</span>
    </span>
  );
};

const ProofBar = () => {
  return (
    <section
      id="proof"
      className="relative py-16 lg:py-20 border-y"
      style={{
        background: "var(--bg-section)",
        borderColor: "var(--hairline)",
      }}
    >
      <div className="mx-auto px-6 lg:px-14" style={{ maxWidth: 1440 }}>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-10 lg:gap-6">
          {stats.map((s, i) => (
            <div
              key={i}
              className="text-center lg:text-left lg:px-4"
              style={{
                borderLeft: i > 0 ? "1px solid var(--hairline)" : undefined,
              }}
            >
              <div
                className="font-display"
                style={{
                  fontSize: "clamp(2.5rem, 5vw, 4rem)",
                  lineHeight: 1,
                  fontWeight: 500,
                }}
              >
                <Counter to={s.value} prefix={s.prefix} suffix={s.suffix} />
              </div>
              <div
                className="mt-3 font-body font-semibold uppercase"
                style={{ fontSize: 11, letterSpacing: "0.2em", color: "var(--gold)" }}
              >
                {s.label}
              </div>
              <div className="mt-1 font-body" style={{ fontSize: 13, color: "var(--warm-body)" }}>
                {s.sub}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default ProofBar;
