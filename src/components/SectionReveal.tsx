import { useEffect, useRef, useState, ReactNode } from "react";

interface SectionRevealProps {
  children: ReactNode;
}

const prefersReduced = () =>
  typeof window !== "undefined" &&
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

const SectionReveal = ({ children }: SectionRevealProps) => {
  const ref = useRef<HTMLDivElement>(null);
  const [forceVisible, setForceVisible] = useState(false);
  const [style, setStyle] = useState<React.CSSProperties>(() =>
    prefersReduced()
      ? { clipPath: "inset(0)", opacity: 1 }
      : { clipPath: "inset(4% 0 0 0)", opacity: 0.6 }
  );

  useEffect(() => {
    if (prefersReduced()) {
      setForceVisible(true);
      setStyle({ clipPath: "inset(0)", opacity: 1 });
      return;
    }

    // Safety net: reveal fully within 800ms regardless.
    const t = window.setTimeout(() => {
      setForceVisible(true);
      setStyle({ clipPath: "inset(0)", opacity: 1 });
    }, 800);

    const onScroll = () => {
      if (!ref.current) return;
      const rect = ref.current.getBoundingClientRect();
      const vh = window.innerHeight;
      // Start revealing when 15% into view.
      const progress = Math.max(0, Math.min(1, 1 - (rect.top - vh * 0.85) / (vh * 0.2)));
      // If more than 30% in viewport, force fully visible.
      const inView =
        rect.top < vh * 0.7 && rect.bottom > vh * 0.3;
      if (inView || progress > 0.98) {
        setStyle({ clipPath: "inset(0)", opacity: 1 });
        return;
      }
      setStyle({
        clipPath: `inset(${(1 - progress) * 4}% 0 0 0)`,
        opacity: 0.6 + progress * 0.4,
      });
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.clearTimeout(t);
    };
  }, []);

  return (
    <div
      ref={ref}
      style={
        forceVisible
          ? { clipPath: "inset(0)", opacity: 1 }
          : { ...style, transition: "clip-path 0.15s linear, opacity 0.15s linear" }
      }
    >
      {children}
    </div>
  );
};

export default SectionReveal;
