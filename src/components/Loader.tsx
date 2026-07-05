import { useEffect, useState } from "react";

interface LoaderProps {
  onComplete: () => void;
}

// One quick fade of the B mark. Cap at 1.2s. Skip on repeat visits.
const Loader = ({ onComplete }: LoaderProps) => {
  const [visible, setVisible] = useState(false);
  const [wiping, setWiping] = useState(false);
  const [removed, setRemoved] = useState(false);

  useEffect(() => {
    // Skip loader on repeat visits within the session.
    if (typeof window !== "undefined" && sessionStorage.getItem("bh_seen_loader") === "1") {
      setRemoved(true);
      onComplete();
      return;
    }
    // Respect reduced-motion — skip animation entirely.
    if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      sessionStorage.setItem("bh_seen_loader", "1");
      setRemoved(true);
      onComplete();
      return;
    }

    const tShow = setTimeout(() => setVisible(true), 20);
    const tWipe = setTimeout(() => setWiping(true), 600);
    const tDone = setTimeout(() => {
      sessionStorage.setItem("bh_seen_loader", "1");
      setRemoved(true);
      onComplete();
    }, 1150);
    return () => { clearTimeout(tShow); clearTimeout(tWipe); clearTimeout(tDone); };
  }, [onComplete]);

  if (removed) return null;

  return (
    <div
      className="fixed inset-0 flex items-center justify-center"
      style={{
        zIndex: 200,
        background: "#07070E",
        clipPath: wiping ? "inset(0 0 100% 0)" : "inset(0 0 0 0)",
        transition: "clip-path 0.5s cubic-bezier(0.77, 0, 0.18, 1)",
      }}
    >
      <div
        className="flex items-center justify-center"
        style={{
          width: 56,
          height: 56,
          border: "1.5px solid rgba(212,175,85,0.55)",
          opacity: visible && !wiping ? 1 : 0,
          transform: visible ? "scale(1)" : "scale(0.9)",
          transition: "opacity 0.4s ease, transform 0.4s ease",
        }}
      >
        <span className="font-display italic" style={{ fontSize: 24, color: "#D4AF55", lineHeight: 1 }}>
          B
        </span>
      </div>
    </div>
  );
};

export default Loader;
