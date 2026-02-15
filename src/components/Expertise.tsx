import { useEffect, useRef, useState, useCallback } from "react";
import { Brain, Target, Code2, Users } from "lucide-react";
import { useReveal, revealStyle } from "@/hooks/useReveal";

const cards = [
  {
    icon: Brain,
    num: "01",
    title: "AI Implementation",
    text: "Practical AI workflows, automation stacks, and custom tools that replace entire departments. No PhD — just results.",
  },
  {
    icon: Target,
    num: "02",
    title: "Direct Response Marketing",
    text: "20+ years of frameworks that convert strangers into customers. The psychology behind $50M+ in revenue influenced.",
  },
  {
    icon: Code2,
    num: "03",
    title: "No-Code Building",
    text: "I built Revven — a full SaaS platform with 3,000+ users — without writing a single line of code. I teach others to do the same.",
  },
  {
    icon: Users,
    num: "04",
    title: "Community & Education",
    text: "150,000+ business owners trained through live events, workshops, and virtual summits. Real education that creates immediate ROI.",
  },
];

const TiltCard = ({
  card,
  index,
}: {
  card: (typeof cards)[0];
  index: number;
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [glow, setGlow] = useState({ x: 50, y: 50 });
  const [hovered, setHovered] = useState(false);
  const [tilt, setTilt] = useState({ rx: 0, ry: 0 });

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
      { threshold: 0.12 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const onMove = useCallback((e: React.MouseEvent) => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setGlow({ x, y });
    const rx = ((y - 50) / 50) * -8;
    const ry = ((x - 50) / 50) * 8;
    setTilt({ rx, ry });
  }, []);

  const onLeave = useCallback(() => {
    setHovered(false);
    setTilt({ rx: 0, ry: 0 });
  }, []);

  const Icon = card.icon;

  return (
    <div
      ref={ref}
      className="relative overflow-hidden"
      style={{
        padding: 0,
        border: `1px solid ${hovered ? "rgba(212,175,85,0.25)" : "rgba(255,255,255,0.06)"}`,
        opacity: visible ? 1 : 0,
        transform: visible
          ? `perspective(800px) rotateX(${tilt.rx}deg) rotateY(${tilt.ry}deg)`
          : "translateY(50px)",
        transition: hovered
          ? "border-color 0.5s, transform 0.1s"
          : `border-color 0.5s, opacity 1s cubic-bezier(0.22,1,0.36,1) ${index * 0.1}s, transform 1s cubic-bezier(0.22,1,0.36,1) ${index * 0.1}s`,
        willChange: "transform",
      }}
      onMouseMove={onMove}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={onLeave}
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
          style={{ fontSize: 70, color: "rgba(212,175,85,0.04)", lineHeight: 1 }}
        >
          {card.num}
        </span>

        <Icon
          size={24}
          strokeWidth={1.5}
          color="#D4AF55"
          className="mb-6"
        />

        <h3
          className="font-display text-foreground mb-3"
          style={{ fontSize: "1.35rem", fontWeight: 500 }}
        >
          {card.title}
        </h3>

        <p
          className="font-body"
          style={{
            fontSize: "0.9rem",
            lineHeight: 1.75,
            color: "rgba(255,255,255,0.45)",
          }}
        >
          {card.text}
        </p>
      </div>
    </div>
  );
};

const Expertise = () => {
  const { ref: headerRef, visible: headerVisible } = useReveal();

  return (
    <section
      id="expertise"
      className="relative py-36 lg:py-44"
      style={{ background: "#0A0B12" }}
    >
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage:
            "linear-gradient(rgba(212,175,85,0.02) 1px, transparent 1px), linear-gradient(90deg, rgba(212,175,85,0.02) 1px, transparent 1px)",
          backgroundSize: "80px 80px",
        }}
      />

      <div className="relative mx-auto px-6 lg:px-14" style={{ maxWidth: 1440 }}>
        {/* Header */}
        <div ref={headerRef} className="flex flex-col lg:flex-row lg:items-end lg:justify-between mb-20 gap-8">
          <div>
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
                style={{ fontSize: 10, letterSpacing: "0.3em", color: "#D4AF55" }}
              >
                Core Expertise
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
              Where AI Meets{" "}
              <em
                style={{
                  fontStyle: "italic",
                  background: "linear-gradient(135deg, #D4AF55, #E8C96A)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                }}
              >
                Real Results
              </em>
            </h2>
          </div>

          <p
            className="font-body lg:text-right"
            style={{
              fontSize: "0.95rem",
              lineHeight: 1.7,
              color: "rgba(255,255,255,0.4)",
              maxWidth: 380,
              ...revealStyle(headerVisible, 0.2),
            }}
          >
            Four disciplines. One unfair advantage. The intersection most
            &lsquo;experts&rsquo; can&rsquo;t touch.
          </p>
        </div>

        {/* Card grid */}
        <div className="grid md:grid-cols-2 gap-5">
          {cards.map((card, i) => (
            <TiltCard key={i} card={card} index={i} />
          ))}
        </div>
      </div>
    </section>
  );
};

export default Expertise;
