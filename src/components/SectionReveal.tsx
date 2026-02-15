import { useEffect, useRef, useState, ReactNode } from "react";

interface SectionRevealProps {
  children: ReactNode;
}

const SectionReveal = ({ children }: SectionRevealProps) => {
  const ref = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState({ clipPath: "inset(8% 0 0 0)", opacity: 0.3 });

  useEffect(() => {
    const onScroll = () => {
      if (!ref.current) return;
      const rect = ref.current.getBoundingClientRect();
      const vh = window.innerHeight;
      const progress = Math.max(0, Math.min(1, 1 - (rect.top - vh * 0.8) / (vh * 0.3)));
      setStyle({
        clipPath: `inset(${(1 - progress) * 8}% 0 0 0)`,
        opacity: 0.3 + progress * 0.7,
      });
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div
      ref={ref}
      style={{
        ...style,
        transition: "clip-path 0.05s linear, opacity 0.05s linear",
      }}
    >
      {children}
    </div>
  );
};

export default SectionReveal;
