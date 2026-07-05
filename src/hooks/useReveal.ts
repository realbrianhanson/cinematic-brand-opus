import { useEffect, useRef, useState } from "react";

const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

// Reveal on scroll with safety net:
// - triggers early (15% into view)
// - forces visible after 800ms fallback if IO hasn't fired
// - forces visible immediately for reduced motion
// - forces visible if element is already >30% in the viewport at mount time
export const useReveal = (threshold = 0.15) => {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (prefersReducedMotion()) {
      setVisible(true);
      return;
    }

    // If already substantially in view, reveal immediately.
    const rect = el.getBoundingClientRect();
    const vh = window.innerHeight || 800;
    if (rect.top < vh * 0.7 && rect.bottom > 0) {
      setVisible(true);
    }

    const obs = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setVisible(true);
          obs.disconnect();
        }
      },
      { threshold, rootMargin: "0px 0px -10% 0px" }
    );
    obs.observe(el);

    // Safety fallback in case IO never fires (some browsers / conditions).
    const failsafe = window.setTimeout(() => {
      setVisible(true);
      obs.disconnect();
    }, 800);

    return () => {
      obs.disconnect();
      window.clearTimeout(failsafe);
    };
  }, [threshold]);

  return { ref, visible };
};

export const revealStyle = (visible: boolean, delay = 0): React.CSSProperties => ({
  opacity: visible ? 1 : 0,
  transform: visible ? "translateY(0)" : "translateY(20px)",
  transition: `opacity 0.5s cubic-bezier(0.22, 1, 0.36, 1) ${delay}s, transform 0.5s cubic-bezier(0.22, 1, 0.36, 1) ${delay}s`,
});
