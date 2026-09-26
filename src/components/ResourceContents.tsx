import { useEffect, useState } from "react";

/** One contents list for every resource renderer; links preserve shareable locations. */
export default function ResourceContents({ revision }: { revision: unknown }) {
  const [items, setItems] = useState<Array<{ id: string; label: string }>>([]);
  useEffect(() => {
    const headings = Array.from(
      document.querySelectorAll<HTMLElement>(
        "#resource-reading-body h2, #resource-reading-body h3",
      ),
    );
    const next = headings
      .filter((heading) => heading.textContent?.trim())
      .map((heading, index) => {
        if (!heading.id) {
          const base = `resource-section-${index + 1}`;
          let id = base;
          let suffix = 1;
          while (document.getElementById(id)) id = `${base}-${suffix++}`;
          heading.id = id;
        }
        return { id: heading.id, label: heading.textContent!.trim() };
      });
    setItems(next);
    // A direct URL may arrive before these generated anchors are hydrated.
    try {
      const id = decodeURIComponent(window.location.hash.slice(1));
      if (id && next.some((item) => item.id === id))
        document.getElementById(id)?.scrollIntoView?.({ block: "start" });
    } catch {
      /* An invalid incoming hash must not interrupt reading. */
    }
  }, [revision]);
  if (items.length < 2) return null;
  return (
    <details
      className="mb-8 rounded-lg border border-white/20 bg-white/[0.025] p-5"
      data-print-hide
    >
      <summary className="cursor-pointer text-base font-medium text-[var(--brand-accent)]">
        On this page
      </summary>
      <nav aria-label="On this page" className="mt-4">
        <ol className="grid gap-3 sm:grid-cols-2">
          {items.map((item) => (
            <li key={item.id}>
              <a
                href={`#${encodeURIComponent(item.id)}`}
                className="text-base leading-relaxed text-white/85 underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--brand-accent)]"
              >
                {item.label}
              </a>
            </li>
          ))}
        </ol>
      </nav>
    </details>
  );
}
