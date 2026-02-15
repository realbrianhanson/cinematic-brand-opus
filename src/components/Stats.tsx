import { useEffect, useRef, useState } from "react";

const stats = [
  { end: 4, prefix: "", suffix: "×", label: "Inc. 5000", sub: "Highest: #80 in the nation", duration: 1000 },
  { end: 150, prefix: "", suffix: "K+", label: "Community", sub: "Business owners trained", duration: 2000 },
  { end: 50, prefix: "$", suffix: "M+", label: "Revenue", sub: "Influenced across ventures", duration: 2000 },
  { end: 3000, prefix: "", suffix: "+", label: "Revven Users", sub: "Built with zero code", duration: 2200, locale: true },
];

const useCounter = (end: number, duration: number, start: boolean) => {
  const [val, setVal] = useState(0);
  useEffect(() => {
    if (!start) return;
    let raf: number;
    const t0 = performance.now();
    const tick = (now: number) => {
      const p = Math.min((now - t0) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 4);
      setVal(Math.round(eased * end));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [start, end, duration]);
  return val;
};

const StatItem = ({ stat, index }: { stat: (typeof stats)[0]; index: number }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setVisible(true); obs.disconnect(); } },
      { threshold: 0.3 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const count = useCounter(stat.end, stat.duration, visible);
  const display = stat.locale ? count.toLocaleString() : String(count);

  return (
    <div
      ref={ref}
      className="text-center lg:text-left"
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(30px)",
        transition: `all 0.6s cubic-bezier(0.22,1,0.36,1) ${index * 0.12}s`,
      }}
    >
      <div
        className="font-display italic"
        style={{
          fontSize: "clamp(2.8rem, 5vw, 4.2rem)",
          lineHeight: 1,
          background: "linear-gradient(135deg, #D4AF55, #E8C96A)",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
        }}
      >
        {stat.prefix}{display}{stat.suffix}
      </div>
      <div
        className="font-body font-semibold uppercase mt-3"
        style={{ fontSize: 14, letterSpacing: "0.1em", color: "#fff" }}
      >
        {stat.label}
      </div>
      <div
        className="font-body mt-1"
        style={{ fontSize: 11, color: "rgba(255,255,255,0.3)" }}
      >
        {stat.sub}
      </div>
    </div>
  );
};

const Stats = () => (
  <section id="results" className="relative py-28" style={{ background: "#09090F" }}>
    <div className="absolute top-0 left-0 w-full h-px" style={{
      background: "linear-gradient(90deg, transparent 10%, rgba(212,175,85,0.25) 50%, transparent 90%)",
    }} />
    <div className="absolute bottom-0 left-0 w-full h-px" style={{
      background: "linear-gradient(90deg, transparent 10%, rgba(212,175,85,0.25) 50%, transparent 90%)",
    }} />
    <div className="relative mx-auto px-6 lg:px-14 grid grid-cols-2 lg:grid-cols-4 gap-8 lg:gap-4" style={{ maxWidth: 1440 }}>
      {stats.map((s, i) => <StatItem key={i} stat={s} index={i} />)}
    </div>
  </section>
);

export default Stats;
