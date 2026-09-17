import { useEffect, useRef, useState, useCallback } from "react";
import { Sparkles, ArrowRight } from "lucide-react";
import MagneticButton from "./MagneticButton";
import { useReveal, revealStyle } from "@/hooks/useReveal";
import { siteConfig } from "@/config/site";
import type { EventDay } from "@/config/types";

const DayCard = ({ card, index }: { card: EventDay; index: number }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [glow, setGlow] = useState({ x: 50, y: 50 });

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
      { threshold: 0.12 },
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
      className="relative overflow-hidden"
      style={{
        border: `1px solid ${hovered ? "rgba(var(--brand-accent-rgb),0.25)" : "rgba(255,255,255,0.06)"}`,
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(50px)",
        transition: `border-color 0.5s, opacity 1s cubic-bezier(0.22,1,0.36,1) ${index * 0.1}s, transform 1s cubic-bezier(0.22,1,0.36,1) ${index * 0.1}s`,
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
            background: `radial-gradient(400px circle at ${glow.x}% ${glow.y}%, rgba(var(--brand-accent-rgb),0.1), transparent 60%)`,
          }}
        />
      )}
      <div className="relative p-8 lg:p-10">
        <span
          className="absolute top-4 right-6 font-display italic select-none"
          style={{
            fontSize: 60,
            lineHeight: 1,
            background:
              "linear-gradient(135deg, rgba(var(--brand-accent-rgb),0.06), rgba(232,201,106,0.03))",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
          }}
        >
          {String(index + 1).padStart(2, "0")}
        </span>

        <span
          className="font-body font-bold uppercase"
          style={{
            fontSize: 10,
            letterSpacing: "0.2em",
            color: "var(--brand-accent)",
          }}
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
                style={{
                  width: 3,
                  height: 3,
                  background: "var(--brand-accent)",
                }}
              />
              <span
                className="font-body"
                style={{
                  fontSize: "0.9rem",
                  lineHeight: 1.6,
                  color: "rgba(255,255,255,0.5)",
                }}
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

const EventCTA = () => {
  const { ref: headerRef, visible: headerVisible } = useReveal();
  const { ref: ctaRef, visible: ctaVisible } = useReveal();
  const event = siteConfig.event;

  return (
    <section
      className="relative py-36 lg:py-44"
      style={{ background: "var(--brand-backdrop)" }}
    >
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse at center, rgba(var(--brand-accent-rgb),0.05), transparent 70%)",
        }}
      />

      <div
        className="relative mx-auto px-6 lg:px-14"
        style={{ maxWidth: 1440 }}
      >
        {/* Header */}
        <div ref={headerRef} className="max-w-3xl mx-auto text-center mb-20">
          <div
            className="flex items-center justify-center gap-4 mb-6"
            style={revealStyle(headerVisible, 0)}
          >
            <div
              style={{
                width: 40,
                height: 1,
                background:
                  "linear-gradient(90deg, transparent, var(--brand-accent))",
              }}
            />
            <span
              className="font-body font-bold uppercase"
              style={{
                fontSize: 10,
                letterSpacing: "0.3em",
                color: "var(--brand-accent)",
              }}
            >
              {event.overline}
            </span>
            <div
              style={{
                width: 40,
                height: 1,
                background:
                  "linear-gradient(90deg, var(--brand-accent), transparent)",
              }}
            />
          </div>

          <h2
            className="font-display"
            style={{
              fontSize: "clamp(2.2rem, 5vw, 4rem)",
              lineHeight: 1.08,
              color: "#fff",
              ...revealStyle(headerVisible, 0.1),
            }}
          >
            <em
              style={{
                fontStyle: "italic",
                background:
                  "linear-gradient(135deg, var(--brand-accent), var(--brand-accent-light))",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}
            >
              {event.headingAccent}
            </em>{" "}
            {event.headingRest}
          </h2>

          <p
            className="font-body mt-6 mx-auto"
            style={{
              fontSize: "1.05rem",
              lineHeight: 1.7,
              color: "rgba(255,255,255,0.45)",
              maxWidth: 560,
              ...revealStyle(headerVisible, 0.2),
            }}
          >
            {event.intro}
          </p>
        </div>

        {/* Event photo */}
        {event.imageSrc && (
          <div
            className="relative w-full overflow-hidden mb-16 rounded"
            style={{ maxHeight: 420 }}
          >
            <img
              src={event.imageSrc}
              alt={event.imageAlt}
              className="w-full h-full object-cover object-center"
              loading="lazy"
            />
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                background:
                  "linear-gradient(to top, var(--brand-backdrop), transparent 40%)",
              }}
            />
          </div>
        )}

        {/* Day cards */}
        <div className="grid lg:grid-cols-3 gap-5 mb-16">
          {event.days.map((d, i) => (
            <DayCard key={i} card={d} index={i} />
          ))}
        </div>

        {/* CTA */}
        <div
          ref={ctaRef}
          className="text-center"
          style={revealStyle(ctaVisible, 0)}
        >
          {event.cta && (
            <MagneticButton
              href={event.cta.href}
              target={event.cta.external ? "_blank" : undefined}
              className="hero-cta-primary relative overflow-hidden inline-flex items-center gap-2 font-body font-bold uppercase"
              style={{
                fontSize: 14,
                letterSpacing: "0.08em",
                background:
                  "linear-gradient(135deg, var(--brand-accent), var(--brand-accent-dark))",
                color: "var(--brand-backdrop)",
                padding: "24px 48px",
              }}
            >
              <Sparkles size={16} strokeWidth={2.5} />
              {event.cta.label}
              <ArrowRight size={16} strokeWidth={2.5} />
              <div className="hero-cta-shine" />
            </MagneticButton>
          )}

          {event.ctaNote && (
            <p
              className="font-body mt-5"
              style={{ fontSize: 11, color: "rgba(255,255,255,0.25)" }}
            >
              {event.ctaNote}
            </p>
          )}
        </div>
      </div>
    </section>
  );
};

export default EventCTA;
