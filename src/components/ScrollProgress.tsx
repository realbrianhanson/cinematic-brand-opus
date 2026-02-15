import { useEffect, useRef } from "react";

const ScrollProgress = () => {
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onScroll = () => {
      const progress = window.scrollY / (document.documentElement.scrollHeight - window.innerHeight);
      const p = Math.min(Math.max(progress, 0), 1);
      if (barRef.current) {
        barRef.current.style.transform = `scaleX(${p})`;
        barRef.current.style.boxShadow = `0 0 ${8 + p * 20}px rgba(212,175,85,${0.3 + p * 0.3})`;
      }
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div
      ref={barRef}
      className="fixed top-0 left-0 w-full pointer-events-none"
      style={{
        height: 2,
        zIndex: 60,
        background: "linear-gradient(90deg, #D4AF55, #E8C96A)",
        transformOrigin: "left",
        transform: "scaleX(0)",
      }}
    />
  );
};

export default ScrollProgress;
