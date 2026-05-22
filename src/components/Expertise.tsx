import { useRef, useState } from "react";
import { Cpu, Megaphone, Wrench, Users } from "lucide-react";

const cards = [
  {
    icon: Cpu,
    title: "A.I. Implementation",
    body: "Practical A.I. that fits real businesses — operations, marketing, content, and customer experience that compound week over week.",
  },
  {
    icon: Megaphone,
    title: "Direct Response Marketing",
    body: "Twenty years of campaigns that move money. Hooks, offers, and funnels grounded in the original direct response legends.",
  },
  {
    icon: Wrench,
    title: "No-Code Building",
    body: "Ship SaaS, internal tools, and automations without a dev team. Built Revven with 3,000+ users and zero lines of code.",
  },
  {
    icon: Users,
    title: "Community & Education",
    body: "Built a 150,000+ community of operators who learn by doing. Teach the system that works, not the trend of the week.",
  },
];

const Card = ({ c, i }: { c: typeof cards[number]; i: number }) => {
  const [hover, setHover] = useState(false);
  const Icon = c.icon;
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className="relative p-8 lg:p-10 overflow-hidden group"
      style={{
        background: "var(--bg-section)",
        border: `1px solid ${hover ? "var(--card-border-hover)" : "var(--hairline)"}`,
        transform: hover ? "translateY(-6px)" : "translateY(0)",
        boxShadow: hover
          ? "0 30px 60px -30px rgba(216,180,106,0.35), 0 0 0 1px rgba(216,180,106,0.15) inset"
          : "0 0 0 transparent",
        transition: "all 300ms cubic-bezier(0.22,1,0.36,1)",
      }}
      data-hover
    >
      {/* faint corner number */}
      <div
        className="absolute font-display select-none pointer-events-none"
        style={{
          top: -12, right: -8,
          fontSize: 110, lineHeight: 1, fontWeight: 600,
          color: "transparent",
          WebkitTextStroke: hover ? "1px rgba(216,180,106,0.55)" : "1px rgba(216,180,106,0.18)",
          transition: "all 300ms ease",
        }}
      >
        {String(i + 1).padStart(2, "0")}
      </div>

      <div
        className="inline-flex items-center justify-center mb-7"
        style={{
          width: 48, height: 48,
          border: "1px solid var(--hairline)",
          background: hover ? "rgba(216,180,106,0.08)" : "transparent",
          transition: "background 300ms",
        }}
      >
        <Icon size={20} color="var(--gold)" strokeWidth={1.5} />
      </div>

      <h3
        className="font-display relative inline-block pb-1.5"
        style={{
          fontSize: "clamp(1.4rem, 2vw, 1.65rem)",
          color: "var(--warm-white)",
          fontWeight: 600,
          lineHeight: 1.2,
        }}
      >
        {c.title}
        <span
          className="absolute left-0 bottom-0 h-px"
          style={{
            width: hover ? "100%" : "0%",
            background: "var(--gold)",
            transition: "width 400ms cubic-bezier(0.22,1,0.36,1)",
          }}
        />
      </h3>
      <p className="mt-4" style={{ fontSize: 15.5, lineHeight: 1.7, color: "var(--warm-body)" }}>
        {c.body}
      </p>
    </div>
  );
};

const Expertise = () => {
  return (
    <section
      id="expertise"
      className="relative py-28 lg:py-36"
      style={{ background: "var(--bg-section)" }}
    >
      <div className="mx-auto px-6 lg:px-14" style={{ maxWidth: 1240 }}>
        <div className="max-w-3xl mb-16">
          <div className="flex items-center gap-3 mb-6">
            <div style={{ width: 40, height: 1, background: "var(--gold)" }} />
            <span
              className="font-body font-semibold uppercase"
              style={{ fontSize: 10, letterSpacing: "0.3em", color: "var(--gold)" }}
            >
              Expertise
            </span>
          </div>
          <h2
            className="font-display"
            style={{
              fontSize: "clamp(2.25rem, 5vw, 3.75rem)",
              lineHeight: 1.08,
              fontWeight: 500,
            }}
          >
            Where A.I. Meets <span className="gold-italic" style={{ fontWeight: 600 }}>Real Results</span>
          </h2>
        </div>

        <div className="grid md:grid-cols-2 gap-6 lg:gap-7">
          {cards.map((c, i) => <Card key={i} c={c} i={i} />)}
        </div>
      </div>
    </section>
  );
};

export default Expertise;
