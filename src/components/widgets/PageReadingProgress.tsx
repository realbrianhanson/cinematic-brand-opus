import type { WidgetConfig } from "@/lib/widgetConfig";
import { useEffect, useState } from "react";

const COLOR_MAP: Record<string, string> = {
  accent: "hsl(var(--accent))",
  sage: "hsl(140, 30%, 50%)",
  blue: "hsl(210, 60%, 50%)",
  custom: "hsl(var(--accent))",
};

const PageReadingProgress = ({ config }: { config: WidgetConfig }) => {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const handleScroll = () => {
      const h = document.documentElement.scrollHeight - window.innerHeight;
      setProgress(h > 0 ? (window.scrollY / h) * 100 : 0);
    };
    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("resize", handleScroll);
    return () => {
      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("resize", handleScroll);
    };
  }, []);

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100%",
        height: 3,
        zIndex: 9999,
        background: "transparent",
      }}
    >
      <div
        style={{
          height: "100%",
          width: `${progress}%`,
          background: COLOR_MAP[config.color ?? "accent"] || COLOR_MAP.accent,
          transition: "width 0.1s linear",
        }}
      />
    </div>
  );
};

export default PageReadingProgress;
