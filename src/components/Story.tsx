import { useEffect, useRef, useState } from "react";
import { Flame, Zap, Award, Sparkles, Quote } from "lucide-react";
import { useReveal, revealStyle } from "@/hooks/useReveal";
import DrawLine from "./DrawLine";
import { siteConfig } from "@/config/site";
import type { StoryEntry } from "@/config/types";

const ICONS = {
  flame: Flame,
  zap: Zap,
  award: Award,
  sparkles: Sparkles,
} as const;

const TimelineEntry = ({
  entry,
  index,
}: {
  entry: StoryEntry;
  index: number;
}) => {
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
      { threshold: 0.15 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const Icon = ICONS[entry.icon];

  return (
    <div
      ref={ref}
      className="relative pl-10 md:pl-20 pb-16 last:pb-0 cursor-default"
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(50px)",
        transition: `all 1s cubic-bezier(0.22,1,0.36,1) ${index * 0.1}s`,
        background: entry.accent
          ? "rgba(var(--brand-accent-rgb),0.025)"
          : "transparent",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = visible
          ? "translateX(2px)"
          : "translateY(50px)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = visible
          ? "translateX(0)"
          : "translateY(50px)";
      }}
    >
      <div
        className="absolute left-0 md:left-8 top-1 flex items-center justify-center group transition-shadow duration-300 hover:shadow-[0_0_20px_rgba(var(--brand-accent-rgb),0.2)]"
        style={{
          width: 32,
          height: 32,
          border: "1px solid rgba(var(--brand-accent-rgb),0.3)",
          background: "var(--brand-backdrop)",
        }}
      >
        <Icon size={14} color="var(--brand-accent)" />
      </div>

      <div className="grid lg:grid-cols-12 gap-4 lg:gap-8">
        <div className="lg:col-span-3 flex flex-col gap-2">
          <span
            className="inline-block self-start font-body font-bold uppercase"
            style={{
              fontSize: 11,
              letterSpacing: "0.12em",
              color: "var(--brand-accent)",
              background: "rgba(var(--brand-accent-rgb),0.1)",
              padding: "4px 10px",
            }}
          >
            {entry.tag}
          </span>
          <span
            className="font-body uppercase"
            style={{
              fontSize: 12,
              letterSpacing: "0.22em",
              color: "rgba(255,255,255,0.7)",
            }}
          >
            {entry.time}
          </span>
        </div>

        <div
          className="lg:col-span-9"
          style={{
            borderLeft: entry.accent
              ? "1px solid rgba(var(--brand-accent-rgb),0.35)"
              : "none",
            paddingLeft: entry.accent ? 20 : 0,
          }}
        >
          <p
            className="font-body"
            style={{
              fontSize: "1.1rem",
              lineHeight: 1.75,
              maxWidth: 640,
              color: entry.accent
                ? "rgba(255,255,255,0.92)"
                : "rgba(255,255,255,0.85)",
            }}
          >
            {entry.text}
          </p>
        </div>
      </div>
    </div>
  );
};

const Story = () => {
  const { ref: headerRef, visible: headerVisible } = useReveal();
  const { ref: quoteRef, visible: quoteVisible } = useReveal();
  const story = siteConfig.story;

  return (
    <section
      id="story"
      className="relative py-36 lg:py-44"
      style={{ background: "var(--brand-backdrop)" }}
    >
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 50% 50% at 85% 10%, rgba(var(--brand-accent-rgb),0.04), transparent)",
        }}
      />

      {/* Decorative S-curve */}
      <DrawLine
        visible={headerVisible}
        d="M200,0 Q250,200 200,400"
        className="absolute top-0 right-[10%] w-[200px] h-full pointer-events-none opacity-30"
      />

      <div
        className="relative mx-auto px-6 lg:px-14"
        style={{ maxWidth: 1440 }}
      >
        {/* Header */}
        <div ref={headerRef} className="grid lg:grid-cols-12 gap-8 mb-24">
          <div className="lg:col-span-7">
            <div
              className="flex items-center gap-4 mb-6"
              style={revealStyle(headerVisible, 0)}
            >
              <div
                style={{
                  width: 60,
                  height: 2,
                  background:
                    "linear-gradient(90deg, var(--brand-accent), var(--brand-accent-light))",
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
                {story.overline}
              </span>
            </div>
            <h2
              className="font-display"
              style={{
                fontSize: "clamp(2.5rem, 5vw, 4.2rem)",
                lineHeight: 1.05,
                color: "#fff",
                ...revealStyle(headerVisible, 0.1),
              }}
            >
              {story.headingLead}{" "}
              <em
                style={{
                  fontStyle: "italic",
                  background:
                    "linear-gradient(135deg, var(--brand-accent), var(--brand-accent-light))",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                }}
              >
                {story.headingAccent}
              </em>
            </h2>
          </div>

          {story.intro && (
            <div
              className="lg:col-span-5 flex items-end"
              style={revealStyle(headerVisible, 0.2)}
            >
              <p
                className="font-body"
                style={{
                  fontSize: "1rem",
                  lineHeight: 1.7,
                  color: "rgba(255,255,255,0.85)",
                }}
              >
                {story.intro}
              </p>
            </div>
          )}
        </div>

        {/* Timeline */}
        <div className="relative pl-6 md:pl-16">
          <div
            className="absolute top-0 left-3.5 md:left-[2.35rem] w-px"
            style={{
              height: "100%",
              background:
                "linear-gradient(180deg, rgba(var(--brand-accent-rgb),0.25), rgba(var(--brand-accent-rgb),0.05))",
            }}
          />

          {story.timeline.map((entry, i) => (
            <TimelineEntry key={i} entry={entry} index={i} />
          ))}
        </div>

        {/* Pull quote */}
        {story.pullQuote && (
          <div
            ref={quoteRef}
            className="mt-24 flex flex-col items-center text-center max-w-2xl mx-auto"
          >
            <div
              style={{
                width: 48,
                height: 1,
                background:
                  "linear-gradient(90deg, transparent, var(--brand-accent), transparent)",
                marginBottom: 24,
                ...revealStyle(quoteVisible, 0),
              }}
            />
            <Quote
              size={28}
              color="rgba(var(--brand-accent-rgb),0.4)"
              className="mb-5"
              style={revealStyle(quoteVisible, 0.1)}
            />
            <blockquote
              className="font-display italic"
              style={{
                fontSize: "clamp(1.3rem, 2.5vw, 1.8rem)",
                lineHeight: 1.5,
                color: "rgba(255,255,255,0.92)",
                ...revealStyle(quoteVisible, 0.2),
              }}
            >
              "{story.pullQuote}"
            </blockquote>
          </div>
        )}
      </div>
    </section>
  );
};

export default Story;
