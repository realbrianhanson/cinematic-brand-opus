import { useEffect, useId } from "react";

interface StructuredDataProps {
  pageType: "generated" | "pillar" | "blog";
  title: string;
  description: string;
  url: string;
  publishedAt: string;
  updatedAt: string;
  breadcrumbs: Array<{ name: string; url: string }>;
  faqs?: Array<{ question: string; answer: string }>;
  /** Flat item names for ItemList (used on generated pages so client HTML matches render-page). */
  itemListNames?: string[];
  siteSettings?: {
    site_name?: string;
    author_name?: string;
    author_title?: string;
    author_bio?: string;
    author_social_links?: any;
    author_credentials?: string[];
    publisher_name?: string;
    publisher_url?: string;
    site_url?: string;
  } | null;
}

const StructuredData = ({
  pageType,
  title,
  description,
  url,
  publishedAt,
  updatedAt,
  breadcrumbs,
  faqs,
  itemListNames,
  siteSettings,
}: StructuredDataProps) => {
  const instanceId = useId().replace(/:/g, "-");

  // Ensure structured data URLs use the canonical domain, not the preview domain
  const canonicalUrl =
    url && !url.includes("example.com")
      ? url
      : `${typeof window !== "undefined" ? window.location.origin : ""}${typeof window !== "undefined" ? window.location.pathname : ""}`;

  useEffect(() => {
    const scripts: HTMLScriptElement[] = [];

    const inject = (id: string, data: object) => {
      const el = document.createElement("script");
      el.type = "application/ld+json";
      el.id = `sd-${instanceId}-${id}`;
      el.textContent = JSON.stringify(data);
      document.head.appendChild(el);
      scripts.push(el);
    };

    // 0. WebSite (sitewide identity) — matches what render-page serves to crawlers.
    if (siteSettings?.site_url) {
      inject("website", {
        "@context": "https://schema.org",
        "@type": "WebSite",
        name: siteSettings.site_name || siteSettings.publisher_name || "",
        url: siteSettings.site_url,
      });
    }

    // 1. Person
    if (siteSettings?.author_name) {
      const sameAs = Object.values(siteSettings.author_social_links || {}).filter(Boolean);
      inject("person", {
        "@context": "https://schema.org",
        "@type": "Person",
        name: siteSettings.author_name,
        ...(siteSettings.author_title && { jobTitle: siteSettings.author_title }),
        ...(siteSettings.author_bio && { description: siteSettings.author_bio }),
        ...(siteSettings.site_url && !siteSettings.site_url.includes("example.com") && { url: siteSettings.site_url }),
        ...(sameAs.length > 0 && { sameAs }),
        ...(siteSettings.author_credentials?.length && { knowsAbout: siteSettings.author_credentials }),
      });
    }

    // 2. Article
    inject("article", {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: title,
      description,
      author: { "@type": "Person", name: siteSettings?.author_name || "Author" },
      publisher: {
        "@type": "Organization",
        name: siteSettings?.publisher_name || "Publisher",
        ...(siteSettings?.publisher_url && !siteSettings.publisher_url.includes("example.com") && { url: siteSettings.publisher_url }),
      },
      datePublished: publishedAt,
      dateModified: updatedAt,
      mainEntityOfPage: canonicalUrl,
    });

    // 2b. ItemList — parity with render-page for generated pages.
    if (pageType === "generated" && itemListNames && itemListNames.length > 0) {
      inject("itemlist", {
        "@context": "https://schema.org",
        "@type": "ItemList",
        numberOfItems: itemListNames.length,
        itemListElement: itemListNames.map((n, i) => ({
          "@type": "ListItem",
          position: i + 1,
          name: n,
        })),
      });
    }

    // 3. FAQPage
    if (faqs && faqs.length > 0) {
      inject("faq", {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: faqs.map((faq) => ({
          "@type": "Question",
          name: faq.question,
          acceptedAnswer: { "@type": "Answer", text: faq.answer },
        })),
      });
    }

    // 4. BreadcrumbList
    if (breadcrumbs.length > 0) {
      inject("breadcrumbs", {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: breadcrumbs.map((item, i) => ({
          "@type": "ListItem",
          position: i + 1,
          name: item.name,
          item: item.url,
        })),
      });
    }

    // 5. Speakable
    inject("speakable", {
      "@context": "https://schema.org",
      "@type": "WebPage",
      speakable: {
        "@type": "SpeakableSpecification",
        cssSelector: [".answer-block", ".faq-answer"],
      },
    });

    return () => {
      scripts.forEach((s) => s.remove());
    };
  }, [instanceId, pageType, title, description, canonicalUrl, publishedAt, updatedAt, breadcrumbs, faqs, itemListNames, siteSettings]);

  return null;
};

export default StructuredData;

