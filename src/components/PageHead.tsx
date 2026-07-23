import { useEffect } from "react";

interface PageHeadProps {
  title: string;
  description: string;
  url: string;
  image?: string;
  type?: string;
  publishedAt?: string;
  updatedAt?: string;
  authorName?: string;
  /** e.g. "noindex, follow". Omit to leave robots at the site default (indexable). */
  robots?: string;
}

/**
 * Direct DOM head manager. react-helmet-async v3 silently no-ops with React 18 in
 * production builds, so we manage <title>, meta, and canonical ourselves — same
 * useEffect pattern StructuredData uses.
 *
 * - Meta tags are matched by name/property and their `content` is UPDATED in place
 *   (never duplicated), falling back to creation only if the tag is missing.
 * - Canonical is a single <link rel="canonical"> element created on demand.
 * - Everything except sitewide tags in index.html reverts on unmount / prop change.
 */
const PageHead = ({
  title,
  description,
  url,
  image,
  type = "article",
  publishedAt,
  updatedAt,
  authorName,
  robots,
}: PageHeadProps) => {
  useEffect(() => {
    const canonicalUrl =
      url && !url.includes("example.com")
        ? url
        : `${window.location.origin}${window.location.pathname}`;

    // --- title
    const prevTitle = document.title;
    document.title = title;

    // --- meta helpers: track which nodes we CREATED so unmount removes exactly those,
    // and remember original `content` for ones we UPDATED so unmount restores them.
    const createdMetas: HTMLMetaElement[] = [];
    const originalMetaContent = new Map<HTMLMetaElement, string | null>();

    const setMeta = (
      selector: string,
      attr: "name" | "property",
      key: string,
      value: string,
    ) => {
      let el = document.head.querySelector<HTMLMetaElement>(selector);
      if (el) {
        if (!originalMetaContent.has(el)) {
          originalMetaContent.set(el, el.getAttribute("content"));
        }
        el.setAttribute("content", value);
      } else {
        el = document.createElement("meta");
        el.setAttribute(attr, key);
        el.setAttribute("content", value);
        document.head.appendChild(el);
        createdMetas.push(el);
      }
    };

    const removeMeta = (selector: string) => {
      const el = document.head.querySelector<HTMLMetaElement>(selector);
      if (el) el.remove();
    };

    setMeta('meta[name="description"]', "name", "description", description);
    setMeta('meta[property="og:title"]', "property", "og:title", title);
    setMeta('meta[property="og:description"]', "property", "og:description", description);
    setMeta('meta[property="og:url"]', "property", "og:url", canonicalUrl);
    setMeta('meta[property="og:type"]', "property", "og:type", type);
    setMeta('meta[name="twitter:card"]', "name", "twitter:card", "summary_large_image");
    setMeta('meta[name="twitter:title"]', "name", "twitter:title", title);
    setMeta('meta[name="twitter:description"]', "name", "twitter:description", description);

    if (image) {
      setMeta('meta[property="og:image"]', "property", "og:image", image);
      setMeta('meta[name="twitter:image"]', "name", "twitter:image", image);
    }
    if (publishedAt) {
      setMeta(
        'meta[property="article:published_time"]',
        "property",
        "article:published_time",
        publishedAt,
      );
    }
    if (updatedAt) {
      setMeta(
        'meta[property="article:modified_time"]',
        "property",
        "article:modified_time",
        updatedAt,
      );
    }
    if (authorName) {
      setMeta('meta[property="article:author"]', "property", "article:author", authorName);
    }
    if (robots) {
      setMeta('meta[name="robots"]', "name", "robots", robots);
    }

    // --- canonical: single link element
    let canonicalEl = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    const canonicalCreated = !canonicalEl;
    const canonicalPrevHref = canonicalEl?.getAttribute("href") ?? null;
    if (!canonicalEl) {
      canonicalEl = document.createElement("link");
      canonicalEl.setAttribute("rel", "canonical");
      document.head.appendChild(canonicalEl);
    }
    canonicalEl.setAttribute("href", canonicalUrl);

    return () => {
      document.title = prevTitle;
      // Remove tags we created; restore prior content for ones we merely updated.
      for (const el of createdMetas) el.remove();
      for (const [el, prev] of originalMetaContent) {
        if (prev === null) el.removeAttribute("content");
        else el.setAttribute("content", prev);
      }
      // Robots is prop-driven — always drop if we set it, even if it existed.
      if (robots) removeMeta('meta[name="robots"]');

      if (canonicalCreated) {
        canonicalEl?.remove();
      } else if (canonicalEl && canonicalPrevHref !== null) {
        canonicalEl.setAttribute("href", canonicalPrevHref);
      }
    };
  }, [title, description, url, image, type, publishedAt, updatedAt, authorName, robots]);

  return null;
};

export default PageHead;
