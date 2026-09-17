import { useEffect, useRef, useState } from "react";
import { siteConfig } from "@/config/site";
import type { ResultStat } from "@/config/types";

/** Longer counts get a longer run so the animation reads at a similar speed. */
const durationFor = (end: number) =>
  end >= 1000 ? 2200 : end >= 50 ? 2000 : 1000;

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

const StatItem = ({ stat, index }: { stat: ResultStat; index: number }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setVisible(true);
          obs.disconnect();
        }
      },
      { threshold: 0.3 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const count = useCounter(stat.end, durationFor(stat.end), visible);
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
          background:
            "linear-gradient(135deg, var(--brand-accent), var(--brand-accent-light))",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
        }}
      >
        {stat.prefix ?? ""}
        {display}
        {stat.suffix ?? ""}
      </div>
      <div
        className="font-body font-semibold uppercase mt-3"
        style={{ fontSize: 14, letterSpacing: "0.1em", color: "#fff" }}
      >
        {stat.label}
      </div>
      <div
        className="font-body mt-1"
        style={{ fontSize: 13, color: "rgba(255,255,255,0.7)" }}
      >
        {stat.sub}
      </div>
    </div>
  );
};

const Stats = () => {
  const stats = siteConfig.results;
  if (stats.length === 0) return null;

  return (
    <section
      id="results"
      className="relative py-28"
      style={{ background: "#09090F" }}
    >
      <div
        className="absolute top-0 left-0 w-full h-px"
        style={{
          background:
            "linear-gradient(90deg, transparent 10%, rgba(var(--brand-accent-rgb),0.25) 50%, transparent 90%)",
        }}
      />
      <div
        className="absolute bottom-0 left-0 w-full h-px"
        style={{
          background:
            "linear-gradient(90deg, transparent 10%, rgba(var(--brand-accent-rgb),0.25) 50%, transparent 90%)",
        }}
      />
      <div
        className="relative mx-auto px-6 lg:px-14 grid grid-cols-2 lg:grid-cols-4 gap-8 lg:gap-4"
        style={{ maxWidth: 1440 }}
      >
        {stats.map((s, i) => (
          <StatItem key={i} stat={s} index={i} />
        ))}
      </div>
    </section>
  );
};

export default Stats;
