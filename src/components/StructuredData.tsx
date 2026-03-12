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
  siteSettings: {
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
  siteSettings,
}: StructuredDataProps) => {
  const instanceId = useId().replace(/:/g, "-");

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

    // 1. Person
    if (siteSettings?.author_name) {
      const sameAs = Object.values(siteSettings.author_social_links || {}).filter(Boolean);
      inject("person", {
        "@context": "https://schema.org",
        "@type": "Person",
        name: siteSettings.author_name,
        ...(siteSettings.author_title && { jobTitle: siteSettings.author_title }),
        ...(siteSettings.author_bio && { description: siteSettings.author_bio }),
        ...(siteSettings.site_url && { url: siteSettings.site_url }),
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
        ...(siteSettings?.publisher_url && { url: siteSettings.publisher_url }),
      },
      datePublished: publishedAt,
      dateModified: updatedAt,
      mainEntityOfPage: url,
    });

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
  }, [instanceId, title, description, url, publishedAt, updatedAt, breadcrumbs, faqs, siteSettings]);

  return null;
};

export default StructuredData;
