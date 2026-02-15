import { useEffect, useRef, useState } from "react";

interface GiantTextProps {
  text: string;
  align: "left" | "right";
}

const GiantText = ({ text, align }: GiantTextProps) => {
  const ref = useRef<HTMLDivElement>(null);
  const [fill, setFill] = useState(0);

  useEffect(() => {
    const onScroll = () => {
      if (!ref.current) return;
      const rect = ref.current.getBoundingClientRect();
      const vh = window.innerHeight;
      setFill(Math.max(0, Math.min(1, 1 - rect.top / (vh * 0.7))));
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const textStyle: React.CSSProperties = {
    fontFamily: "'Instrument Serif', serif",
    fontSize: "clamp(4rem, 13vw, 13rem)",
    fontStyle: "italic",
    fontWeight: 400,
    lineHeight: 0.82,
    letterSpacing: "-0.06em",
    userSelect: "none",
    whiteSpace: "nowrap",
  };

  return (
    <div ref={ref} className="relative overflow-hidden py-6 lg:py-10">
      <div
        className="mx-auto px-6 lg:px-14"
        style={{ maxWidth: 1440, textAlign: align }}
      >
        <span className="relative inline-block">
          {/* Outline layer */}
          <span
            style={{
              ...textStyle,
              WebkitTextStroke: "1px rgba(212,175,85,0.08)",
              color: "transparent",
            }}
          >
            {text}
          </span>
          {/* Gold fill layer */}
          <span
            aria-hidden
            className="absolute inset-0"
            style={{
              ...textStyle,
              background: "linear-gradient(135deg, #D4AF55, #E8C96A)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              clipPath: `inset(0 ${(1 - fill) * 100}% 0 0)`,
              transition: "clip-path 0.05s linear",
            }}
          >
            {text}
          </span>
        </span>
      </div>
    </div>
  );
};

export default GiantText;
