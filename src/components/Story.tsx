import { useEffect, useRef, useState } from "react";
import { Flame, Zap, Award, Sparkles, Quote } from "lucide-react";
import { useReveal, revealStyle } from "@/hooks/useReveal";

const timelineData = [
  {
    icon: Flame,
    tag: "The Beginning",
    time: "Small-Town Iowa",
    accent: false,
    text: "No money. No connections. No degree. Just necessity and an obsession with figuring out what actually works.",
  },
  {
    icon: Zap,
    tag: "First Bet",
    time: "Mid-20s",
    accent: false,
    text: "Built one of the largest engine and transmission companies in the US — without knowing how to change my own oil. Systems and selling beat credentials every time.",
  },
  {
    icon: Award,
    tag: "The Scale",
    time: "Real Advisors",
    accent: true,
    text: "Earned 4× Inc. 5000 recognition, highest ranking #80 in the nation. Mastered direct response marketing from the legends: Halbert, Schwartz, Kennedy, Cialdini.",
  },
  {
    icon: Flame,
    tag: "The Fire",
    time: "2020",
    accent: false,
    text: "COVID destroyed my live events business. Over $1 million in debt. Could have filed bankruptcy. Chose to rebuild. Let it burn — then build something better from the ashes.",
  },
  {
    icon: Sparkles,
    tag: "The Rebuild",
    time: "Now · Age 46",
    accent: true,
    text: "Built AI For Business — 150,000+ members. Created Revven, a SaaS with 3,000+ users, without writing a single line of code. The playing field has never been more level.",
  },
];

const TimelineEntry = ({
  entry,
  index,
}: {
  entry: (typeof timelineData)[0];
  index: number;
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

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

  const Icon = entry.icon;

  return (
    <div
      ref={ref}
      className="relative pl-10 md:pl-20 pb-16 last:pb-0"
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(50px)",
        transition: `all 1s cubic-bezier(0.22,1,0.36,1) ${index * 0.1}s`,
      }}
    >
      <div
        className="absolute left-0 md:left-8 top-1 flex items-center justify-center group transition-shadow duration-300 hover:shadow-[0_0_20px_rgba(212,175,85,0.2)]"
        style={{
          width: 32,
          height: 32,
          border: "1px solid rgba(212,175,85,0.3)",
          background: "#07070E",
        }}
      >
        <Icon size={14} color="#D4AF55" />
      </div>

      <div className="grid lg:grid-cols-12 gap-4 lg:gap-8">
        <div className="lg:col-span-3 flex flex-col gap-2">
          <span
            className="inline-block self-start font-body font-bold uppercase"
            style={{
              fontSize: 10,
              letterSpacing: "0.12em",
              color: "#D4AF55",
              background: "rgba(212,175,85,0.08)",
              padding: "4px 10px",
            }}
          >
            {entry.tag}
          </span>
          <span
            className="font-body uppercase"
            style={{
              fontSize: 11,
              letterSpacing: "0.25em",
              color: "rgba(255,255,255,0.2)",
            }}
          >
            {entry.time}
          </span>
        </div>

        <div
          className="lg:col-span-9"
          style={{
            borderLeft: entry.accent ? "1px solid rgba(212,175,85,0.25)" : "none",
            paddingLeft: entry.accent ? 20 : 0,
          }}
        >
          <p
            className="font-body"
            style={{
              fontSize: "1.15rem",
              lineHeight: 1.8,
              maxWidth: 600,
              color: entry.accent
                ? "rgba(255,255,255,0.55)"
                : "rgba(255,255,255,0.45)",
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

  return (
    <section
      id="story"
      className="relative py-36 lg:py-44"
      style={{ background: "#07070E" }}
    >
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 50% 50% at 85% 10%, rgba(212,175,85,0.04), transparent)",
        }}
      />

      <div
        className="relative mx-auto px-6 lg:px-14"
        style={{ maxWidth: 1440 }}
      >
        {/* Header */}
        <div ref={headerRef} className="grid lg:grid-cols-12 gap-8 mb-24">
          <div className="lg:col-span-7">
            <div className="flex items-center gap-4 mb-6" style={revealStyle(headerVisible, 0)}>
              <div
                style={{
                  width: 60,
                  height: 2,
                  background: "linear-gradient(90deg, #D4AF55, #E8C96A)",
                }}
              />
              <span
                className="font-body font-bold uppercase"
                style={{
                  fontSize: 10,
                  letterSpacing: "0.3em",
                  color: "#D4AF55",
                }}
              >
                The Story
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
              From Nothing to{" "}
              <em
                style={{
                  fontStyle: "italic",
                  background: "linear-gradient(135deg, #D4AF55, #E8C96A)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                }}
              >
                150,000 Strong
              </em>
            </h2>
          </div>

          <div className="lg:col-span-5 flex items-end" style={revealStyle(headerVisible, 0.2)}>
            <p
              className="font-body"
              style={{
                fontSize: "0.95rem",
                lineHeight: 1.7,
                color: "rgba(255,255,255,0.35)",
              }}
            >
              Every chapter taught me one thing: the rules only apply if you
              accept them. I never did.
            </p>
          </div>
        </div>

        {/* Timeline */}
        <div className="relative pl-6 md:pl-16">
          <div
            className="absolute top-0 left-3.5 md:left-[2.35rem] w-px"
            style={{
              height: "100%",
              background:
                "linear-gradient(180deg, rgba(212,175,85,0.25), rgba(212,175,85,0.05))",
            }}
          />

          {timelineData.map((entry, i) => (
            <TimelineEntry key={i} entry={entry} index={i} />
          ))}
        </div>

        {/* Pull quote */}
        <div ref={quoteRef} className="mt-24 flex flex-col items-center text-center max-w-2xl mx-auto">
          <div
            style={{
              width: 48,
              height: 1,
              background: "linear-gradient(90deg, transparent, #D4AF55, transparent)",
              marginBottom: 24,
              ...revealStyle(quoteVisible, 0),
            }}
          />
          <Quote size={28} color="rgba(212,175,85,0.4)" className="mb-5" style={revealStyle(quoteVisible, 0.1)} />
          <blockquote
            className="font-display italic"
            style={{
              fontSize: "clamp(1.3rem, 2.5vw, 1.8rem)",
              lineHeight: 1.5,
              color: "rgba(255,255,255,0.75)",
              ...revealStyle(quoteVisible, 0.2),
            }}
          >
            "I didn't come from money, connections, or a degree. I came from
            necessity and a refusal to stay stuck."
          </blockquote>
        </div>
      </div>
    </section>
  );
};

export default Story;
