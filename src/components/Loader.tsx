import { useEffect, useState } from "react";
import { siteConfig } from "@/config/site";

interface LoaderProps {
  onComplete: () => void;
}

const STORAGE_KEY = "bh_seen_loader";

/** sessionStorage throws in private modes and sandboxed frames; never let it break the page. */
const seenThisSession = (): boolean => {
  try {
    return window.sessionStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
};

const markSeen = () => {
  try {
    window.sessionStorage.setItem(STORAGE_KEY, "1");
  } catch {
    /* storage unavailable — the intro simply plays again next time */
  }
};

const prefersReducedMotion = (): boolean => {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
};

const prefersLessData = (): boolean => {
  try {
    const connection = (
      navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }
    ).connection;
    if (!connection) return false;
    return (
      connection.saveData === true ||
      connection.effectiveType === "slow-2g" ||
      connection.effectiveType === "2g"
    );
  } catch {
    return false;
  }
};

/**
 * One quick fade of the logo mark, capped at 1.2s.
 *
 * This is a decorative overlay on top of already-visible content, so a storage
 * failure, a reduced-motion preference or a data-saver connection just removes
 * the overlay instead of leaving a blank page.
 */
const Loader = ({ onComplete }: LoaderProps) => {
  const [visible, setVisible] = useState(false);
  const [wiping, setWiping] = useState(false);
  const [removed, setRemoved] = useState(true);

  useEffect(() => {
    if (seenThisSession() || prefersReducedMotion() || prefersLessData()) {
      markSeen();
      setRemoved(true);
      onComplete();
      return;
    }

    setRemoved(false);
    const timers = [
      window.setTimeout(() => setVisible(true), 20),
      window.setTimeout(() => setWiping(true), 600),
      window.setTimeout(() => {
        markSeen();
        setRemoved(true);
        onComplete();
      }, 1150),
    ];

    return () => {
      for (const t of timers) window.clearTimeout(t);
    };
  }, [onComplete]);

  if (removed) return null;

  return (
    <div
      className="fixed inset-0 flex items-center justify-center"
      aria-hidden="true"
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
          {siteConfig.identity.logoInitials}
        </span>
      </div>
    </div>
  );
};

export default Loader;
