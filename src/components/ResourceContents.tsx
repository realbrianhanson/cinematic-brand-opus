import { useEffect, useState } from "react";

/** One contents list for every resource renderer; links preserve shareable locations. */
export default function ResourceContents({ revision }: { revision: unknown }) {
  const [items, setItems] = useState<Array<{ id: string; label: string }>>([]);
  useEffect(() => {
    const body = document.getElementById("resource-reading-body");
    if (!body) return;
    let restoredLocation = false;
    const refresh = () => {
      const headings = Array.from(body.querySelectorAll<HTMLElement>("h2, h3"));
      for (const heading of headings) {
        if (heading.dataset.resourceAnchor === heading.id) heading.id = "";
      }
      const next = headings
        .filter((heading) => heading.textContent?.trim())
        .map((heading) => {
          const label = heading.textContent!.trim();
          // React may reuse a heading node when a renderer filters its cards.
          // Rebuild generated anchors from the label, preserving authored IDs.
          if (!heading.id || heading.dataset.resourceAnchor === heading.id) {
            const base = `resource-section-${
              label
                .toLowerCase()
                .replace(/[^\p{L}\p{N}]+/gu, "-")
                .replace(/^-|-$/g, "")
                .slice(0, 100) || "heading"
            }`;
            let id = base;
            let suffix = 2;
            while (
              document.getElementById(id) &&
              document.getElementById(id) !== heading
            )
              id = `${base}-${suffix++}`;
            heading.id = id;
            heading.dataset.resourceAnchor = id;
          }
          return { id: heading.id, label };
        });
      setItems((previous) =>
        previous.length === next.length &&
        previous.every(
          (item, index) =>
            item.id === next[index].id && item.label === next[index].label,
        )
          ? previous
          : next,
      );
      // A direct URL may arrive before generated anchors are hydrated.
      if (!restoredLocation) {
        try {
          const id = decodeURIComponent(window.location.hash.slice(1));
          if (id && next.some((item) => item.id === id)) {
            document.getElementById(id)?.scrollIntoView?.({ block: "start" });
            restoredLocation = true;
          }
        } catch {
          /* An invalid incoming hash must not interrupt reading. */
        }
      }
    };
    refresh();
    const observer = new MutationObserver(refresh);
    observer.observe(body, {
      childList: true,
      subtree: true,
      characterData: true,
    });
    return () => observer.disconnect();
  }, [revision]);
  if (items.length < 2) return null;
  return (
    <details
      className="mb-8 rounded-lg border border-white/20 bg-white/[0.025] p-5"
      data-print-hide
    >
      <summary className="cursor-pointer text-base font-medium text-[var(--site-accent-ink,var(--brand-accent))]">
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
