import { useEffect, useState } from "react";

interface Heading { id: string; text: string; level: number; }

const PageTOC = ({ config }: { config: any }) => {
  const [headings, setHeadings] = useState<Heading[]>([]);
  const minHeadings = config.min_headings || 3;

  useEffect(() => {
    const els = document.querySelectorAll("article h2, article h3");
    const items: Heading[] = [];
    els.forEach((el, i) => {
      if (!el.id) el.id = `heading-${i}`;
      items.push({ id: el.id, text: el.textContent || "", level: el.tagName === "H2" ? 2 : 3 });
    });
    setHeadings(items);
  }, []);

  if (headings.length < minHeadings) return null;

  return (
    <nav style={{ padding: 24, border: "1px solid rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.02)", marginBottom: 24 }}>
      <h3 className="font-body uppercase mb-4" style={{ fontSize: 10, letterSpacing: "0.15em", color: "hsl(var(--accent))", fontWeight: 700 }}>
        Table of Contents
      </h3>
      <div className="flex flex-col gap-2">
        {headings.map((h) => (
          <a key={h.id} href={`#${h.id}`} className="font-body transition-colors" style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", textDecoration: "none", paddingLeft: h.level === 3 ? 16 : 0 }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "hsl(var(--accent))")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "rgba(255,255,255,0.5)")}
          >
            {h.text}
          </a>
        ))}
      </div>
    </nav>
  );
};

export default PageTOC;
