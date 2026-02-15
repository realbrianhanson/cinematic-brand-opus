import { useEffect, useRef, useState, useCallback } from "react";
import { Sparkles, ArrowRight } from "lucide-react";
import MagneticButton from "./MagneticButton";

const days = [
  {
    num: "01",
    day: "Day 1",
    title: "AI Foundations",
    bullets: [
      "What AI can actually do for YOUR business",
      "The tools that matter (skip the noise)",
      "Your first AI workflow — live",
    ],
  },
  {
    num: "02",
    day: "Day 2",
    title: "Implementation",
    bullets: [
      "Hands-on building with push-button tools",
      "Automate content, marketing, and ops",
      "Real results before the day ends",
    ],
  },
  {
    num: "03",
    day: "Day 3",
    title: "Scale & Automate",
    bullets: [
      "Systems that run while you live",
      "The AI stack that replaces busywork",
      "Your 90-day implementation roadmap",
    ],
  },
];

const DayCard = ({ card, index }: { card: (typeof days)[0]; index: number }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [glow, setGlow] = useState({ x: 50, y: 50 });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setVisible(true); obs.disconnect(); } },
      { threshold: 0.15 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const onMove = useCallback((e: React.MouseEvent) => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    setGlow({
      x: ((e.clientX - rect.left) / rect.width) * 100,
      y: ((e.clientY - rect.top) / rect.height) * 100,
    });
  }, []);

  return (
    <div
      ref={ref}
      className="relative overflow-hidden transition-all duration-500"
      style={{
        border: `1px solid ${hovered ? "rgba(212,175,85,0.25)" : "rgba(255,255,255,0.06)"}`,
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(40px)",
        transition: `border-color 0.5s, opacity 0.7s cubic-bezier(0.22,1,0.36,1) ${index * 0.1}s, transform 0.7s cubic-bezier(0.22,1,0.36,1) ${index * 0.1}s`,
      }}
      onMouseMove={onMove}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      data-hover
    >
      {hovered && (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: `radial-gradient(400px circle at ${glow.x}% ${glow.y}%, rgba(212,175,85,0.1), transparent 60%)`,
          }}
        />
      )}
      <div className="relative p-8 lg:p-10">
        <span
          className="absolute top-4 right-6 font-display italic select-none"
          style={{
            fontSize: 60,
            lineHeight: 1,
            background: "linear-gradient(135deg, rgba(212,175,85,0.06), rgba(232,201,106,0.03))",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
          }}
        >
          {card.num}
        </span>

        <span
          className="font-body font-bold uppercase"
          style={{ fontSize: 10, letterSpacing: "0.2em", color: "#D4AF55" }}
        >
          {card.day}
        </span>

        <h3
          className="font-display text-foreground mt-2 mb-6"
          style={{ fontSize: "1.4rem" }}
        >
          {card.title}
        </h3>

        <ul className="flex flex-col gap-3">
          {card.bullets.map((b, i) => (
            <li key={i} className="flex items-start gap-3">
              <div
                className="shrink-0 mt-2 rounded-full"
                style={{ width: 3, height: 3, background: "#D4AF55" }}
              />
              <span
                className="font-body"
                style={{ fontSize: "0.9rem", lineHeight: 1.6, color: "rgba(255,255,255,0.5)" }}
              >
                {b}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};

const EventCTA = () => (
  <section className="relative py-36 lg:py-44" style={{ background: "#07070E" }}>
    <div
      className="absolute inset-0 pointer-events-none"
      style={{ background: "radial-gradient(ellipse at center, rgba(212,175,85,0.05), transparent 70%)" }}
    />

    <div className="relative mx-auto px-6 lg:px-14" style={{ maxWidth: 1440 }}>
      {/* Header */}
      <div className="max-w-3xl mx-auto text-center mb-20">
        <div className="flex items-center justify-center gap-4 mb-6">
          <div style={{ width: 40, height: 1, background: "linear-gradient(90deg, transparent, #D4AF55)" }} />
          <span className="font-body font-bold uppercase" style={{ fontSize: 10, letterSpacing: "0.3em", color: "#D4AF55" }}>
            Free Virtual Event
          </span>
          <div style={{ width: 40, height: 1, background: "linear-gradient(90deg, #D4AF55, transparent)" }} />
        </div>

        <h2 className="font-display" style={{ fontSize: "clamp(2.2rem, 5vw, 4rem)", lineHeight: 1.08, color: "#fff" }}>
          <em style={{
            fontStyle: "italic",
            background: "linear-gradient(135deg, #D4AF55, #E8C96A)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
          }}>
            3 Days
          </em>{" "}
          That Will Change How You Do Business
        </h2>

        <p className="font-body mt-6 mx-auto" style={{ fontSize: "1.05rem", lineHeight: 1.7, color: "rgba(255,255,255,0.45)", maxWidth: 560 }}>
          Simple, push-button AI solutions with high impact. No tech background needed...
        </p>
      </div>

      {/* Day cards */}
      <div className="grid lg:grid-cols-3 gap-5 mb-16">
        {days.map((d, i) => <DayCard key={i} card={d} index={i} />)}
      </div>

      {/* CTA */}
      <div className="text-center">
        <MagneticButton
          href="https://aiforbeginners.com"
          target="_blank"
          className="hero-cta-primary relative overflow-hidden inline-flex items-center gap-2 font-body font-bold uppercase"
          style={{
            fontSize: 14,
            letterSpacing: "0.08em",
            background: "linear-gradient(135deg, #D4AF55, #B8962E)",
            color: "#07070E",
            padding: "24px 48px",
          }}
        >
          <Sparkles size={16} strokeWidth={2.5} />
          Register Free — AIForBeginners.com
          <ArrowRight size={16} strokeWidth={2.5} />
          <div className="hero-cta-shine" />
        </MagneticButton>

        <p className="font-body mt-5" style={{ fontSize: 11, color: "rgba(255,255,255,0.25)" }}>
          100% free. No credit card. Just show up ready to learn.
        </p>
      </div>
    </div>
  </section>
);

export default EventCTA;
