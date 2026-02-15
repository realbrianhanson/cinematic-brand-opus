import { useRef, useState, useEffect } from "react";

const Divider = () => {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setVisible(true); obs.disconnect(); } },
      { threshold: 0.12 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return (
    <div ref={ref} className="relative h-32 overflow-hidden" style={{ background: "transparent" }}>
      {/* Horizontal line */}
      <div
        className="absolute inset-x-0 top-1/2"
        style={{
          height: 1,
          background: "linear-gradient(90deg, transparent, rgba(212,175,85,0.2), transparent)",
          transform: visible ? "scaleX(1)" : "scaleX(0)",
          transformOrigin: "center",
          transition: "transform 1.5s cubic-bezier(0.22,1,0.36,1)",
        }}
      />
      {/* Center diamond */}
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-2 h-2"
        style={{
          border: "1px solid rgba(212,175,85,0.3)",
          transform: `translate(-50%, -50%) rotate(45deg) ${visible ? "scale(1)" : "scale(0)"}`,
          opacity: visible ? 1 : 0,
          transition: "all 1s cubic-bezier(0.22,1,0.36,1) 0.3s",
        }}
      />
    </div>
  );
};

export default Divider;
