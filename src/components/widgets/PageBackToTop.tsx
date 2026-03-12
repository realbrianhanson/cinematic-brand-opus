import { useEffect, useState } from "react";
import { ArrowUp } from "lucide-react";

const PageBackToTop = ({ config }: { config: any }) => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const handleScroll = () => setVisible(window.scrollY > 300);
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  if (!visible) return null;

  return (
    <button
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      style={{
        position: "fixed",
        bottom: 32,
        right: 32,
        width: 44,
        height: 44,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "hsl(var(--accent))",
        color: "hsl(var(--accent-foreground))",
        border: "none",
        cursor: "pointer",
        zIndex: 9998,
        borderRadius: 4,
        boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
      }}
      aria-label="Back to top"
    >
      <ArrowUp size={18} />
    </button>
  );
};

export default PageBackToTop;
