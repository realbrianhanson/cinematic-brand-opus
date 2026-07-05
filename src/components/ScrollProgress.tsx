import { useEffect, useRef } from "react";

// Thin 2px gold line flush to top edge. Sits above nav (z-60 > nav z-50)
// but is only 2px tall so it never overlaps the logo box.
const ScrollProgress = () => {
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onScroll = () => {
      const denom = document.documentElement.scrollHeight - window.innerHeight;
      const progress = denom > 0 ? window.scrollY / denom : 0;
      const p = Math.min(Math.max(progress, 0), 1);
      if (barRef.current) {
        barRef.current.style.transform = `scaleX(${p})`;
      }
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div
      aria-hidden="true"
      className="fixed left-0 pointer-events-none"
      style={{
        top: 0,
        width: "100%",
        height: 2,
        zIndex: 60,
      }}
    >
      <div
        ref={barRef}
        style={{
          width: "100%",
          height: "100%",
          background: "linear-gradient(90deg, #D4AF55, #E8C96A)",
          transformOrigin: "left center",
          transform: "scaleX(0)",
        }}
      />
    </div>
  );
};

export default ScrollProgress;
