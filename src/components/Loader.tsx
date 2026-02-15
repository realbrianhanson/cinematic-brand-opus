import { useState, useEffect, useRef } from "react";

interface LoaderProps {
  onComplete: () => void;
}

const Loader = ({ onComplete }: LoaderProps) => {
  const [phase, setPhase] = useState(0);
  const [progress, setProgress] = useState(0);
  const [phaseOneVisible, setPhaseOneVisible] = useState(false);
  const [wiping, setWiping] = useState(false);
  const [removed, setRemoved] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Phase 0: progress bar fill
  useEffect(() => {
    let step = 0;
    intervalRef.current = setInterval(() => {
      step++;
      setProgress(Math.min(step / 35, 1));
      if (step >= 35) {
        if (intervalRef.current) clearInterval(intervalRef.current);
        setTimeout(() => setPhase(1), 150);
      }
    }, 28);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  // Phase 1: name reveal
  useEffect(() => {
    if (phase !== 1) return;
    const t1 = setTimeout(() => setPhaseOneVisible(true), 50);
    const t2 = setTimeout(() => setPhase(2), 700);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [phase]);

  // Phase 2: wipe reveal
  useEffect(() => {
    if (phase !== 2) return;
    const t1 = setTimeout(() => setWiping(true), 50);
    const t2 = setTimeout(() => {
      setRemoved(true);
      onComplete();
    }, 850);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [phase, onComplete]);

  if (removed) return null;

  return (
    <div
      className="fixed inset-0 flex items-center justify-center"
      style={{
        zIndex: 200,
        background: "#07070E",
        clipPath: wiping ? "inset(0 0 100% 0)" : "inset(0 0 0 0)",
        transition: "clip-path 0.8s cubic-bezier(0.77, 0, 0.18, 1)",
      }}
    >
      {/* Phase 0: Monogram + progress */}
      <div
        className="flex flex-col items-center gap-8"
        style={{
          opacity: phase >= 1 ? 0 : 1,
          transform: phase >= 1 ? "scale(0.8)" : "scale(1)",
          transition: "all 0.4s ease",
          position: "absolute",
        }}
      >
        <div
          className="flex items-center justify-center"
          style={{
            width: 56,
            height: 56,
            border: "1.5px solid rgba(212,175,85,0.5)",
          }}
        >
          <span
            className="font-display italic"
            style={{ fontSize: 24, color: "#D4AF55", lineHeight: 1 }}
          >
            B
          </span>
        </div>
        <div
          style={{
            width: 192,
            height: 1,
            background: "rgba(255,255,255,0.06)",
            position: "relative",
          }}
        >
          <div
            style={{
              width: `${progress * 100}%`,
              height: "100%",
              background: "#D4AF55",
              boxShadow: "0 0 15px rgba(212,175,85,0.4)",
              transition: "width 28ms linear",
            }}
          />
        </div>
      </div>

      {/* Phase 1: Name reveal */}
      <h2
        className="font-display italic absolute"
        style={{
          fontSize: "clamp(2rem, 5vw, 3.5rem)",
          color: "#fff",
          opacity: phase >= 1 && !wiping ? (phaseOneVisible ? 1 : 0) : 0,
          transform: phaseOneVisible && phase >= 1 ? "translateY(0)" : "translateY(20px)",
          transition: "all 0.5s cubic-bezier(0.22,1,0.36,1)",
        }}
      >
        Brian Hanson
      </h2>
    </div>
  );
};

export default Loader;
