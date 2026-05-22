import { useEffect, useRef, useState, ReactNode } from "react";

interface SectionRevealProps {
  children: ReactNode;
}

// Fast, lightweight reveal: fade + slight rise, 400ms, triggers at 15% in view.
const SectionReveal = ({ children }: SectionRevealProps) => {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setVisible(true);
      return;
    }
    const obs = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setVisible(true);
          obs.disconnect();
        }
      },
      { threshold: 0.15, rootMargin: "0px 0px -10% 0px" }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(20px)",
        transition: "opacity 400ms ease-out, transform 400ms ease-out",
      }}
    >
      {children}
    </div>
  );
};

export default SectionReveal;
