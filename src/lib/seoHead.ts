/**
 * Head/JSON-LD builders for server-rendered public routes.
 *
 * These feed the TanStack `head()` route option, so titles, descriptions,
 * canonical links and JSON-LD are in the initial HTML rather than applied by a
 * client effect. Values mirror what the `render-page` crawler renderer emits so
 * the two stay in parity.
 */

export type HeadMetaTag =
  | { title: string }
  | { name: string; content: string }
  | { property: string; content: string };

export type HeadLinkTag = { rel: string; href: string };

export type HeadScriptTag = { type: string; children: string };

export interface PageHeadInput {
  title: string;
  description: string;
  /** Absolute canonical URL for this page. */
  url: string;
  /** Absolute https image URL. Relative or non-https values are ignored. */
  image?: string | null;
  type?: string;
  publishedAt?: string | null;
  updatedAt?: string | null;
  authorName?: string | null;
  /** e.g. "noindex, follow". Omit to stay indexable. */
  robots?: string | null;
  jsonLd?: object[];
}

const isAbsoluteHttps = (value?: string | null): value is string =>
  typeof value === "string" && value.startsWith("https://");

const clean = (value: string) => value.replace(/\s+/g, " ").trim();

export function buildPageHead(input: PageHeadInput): {
  meta: HeadMetaTag[];
  links: HeadLinkTag[];
  scripts: HeadScriptTag[];
} {
  const title = clean(input.title);
  const description = clean(input.description);
  const type = input.type ?? "article";

  const meta: HeadMetaTag[] = [
    { title },
    { name: "description", content: description },
    { property: "og:title", content: title },
    { property: "og:description", content: description },
    { property: "og:type", content: type },
    { name: "twitter:card", content: "summary_large_image" },
    { name: "twitter:title", content: title },
    { name: "twitter:description", content: description },
  ];

  if (isAbsoluteHttps(input.url)) {
    meta.push({ property: "og:url", content: input.url });
  }
  if (isAbsoluteHttps(input.image)) {
    meta.push({ property: "og:image", content: input.image });
    meta.push({ name: "twitter:image", content: input.image });
  }
  if (input.publishedAt) {
    meta.push({ property: "article:published_time", content: input.publishedAt });
  }
  if (input.updatedAt) {
    meta.push({ property: "article:modified_time", content: input.updatedAt });
  }
  if (input.authorName) {
    meta.push({ property: "article:author", content: input.authorName });
  }
  if (input.robots) {
    meta.push({ name: "robots", content: input.robots });
  }

  const links: HeadLinkTag[] = isAbsoluteHttps(input.url)
    ? [{ rel: "canonical", href: input.url }]
    : [];

  const scripts: HeadScriptTag[] = (input.jsonLd ?? []).map((data) => ({
    type: "application/ld+json",
    children: JSON.stringify(data)
      .replace(/</g, "\\u003c")
      .replace(/\u2028/g, "\\u2028")
      .replace(/\u2029/g, "\\u2029"),
  }));

  return { meta, links, scripts };
}

export interface JsonLdSiteSettings {
  site_name?: string | null;
  site_url?: string | null;
  author_name?: string | null;
  author_title?: string | null;
  author_bio?: string | null;
  author_credentials?: string[] | null;
  author_social_links?: unknown;
  publisher_name?: string | null;
  publisher_url?: string | null;
}

const usable = (value?: string | null): value is string =>
  typeof value === "string" && value.trim().length > 0 && !value.includes("example.com");

export function articleJsonLd(opts: {
  headline: string;
  description: string;
  url: string;
  publishedAt?: string | null;
  updatedAt?: string | null;
  settings?: JsonLdSiteSettings | null;
}): object {
  const s = opts.settings;
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: clean(opts.headline),
    description: clean(opts.description),
    author: { "@type": "Person", name: s?.author_name || "Author" },
    publisher: {
      "@type": "Organization",
      name: s?.publisher_name || s?.site_name || "Publisher",
      ...(usable(s?.publisher_url) ? { url: s?.publisher_url } : {}),
    },
    ...(opts.publishedAt ? { datePublished: opts.publishedAt } : {}),
    ...(opts.updatedAt ? { dateModified: opts.updatedAt } : {}),
    mainEntityOfPage: opts.url,
  };
}

export function personJsonLd(settings?: JsonLdSiteSettings | null): object | null {
  if (!settings?.author_name) return null;
  const sameAs = Object.values(
    (settings.author_social_links as Record<string, unknown> | null) ?? {},
  ).filter((v): v is string => typeof v === "string" && v.length > 0);
  return {
    "@context": "https://schema.org",
    "@type": "Person",
    name: settings.author_name,
    ...(settings.author_title ? { jobTitle: settings.author_title } : {}),
    ...(settings.author_bio ? { description: settings.author_bio } : {}),
    ...(usable(settings.site_url) ? { url: settings.site_url } : {}),
    ...(sameAs.length ? { sameAs } : {}),
    ...(settings.author_credentials?.length ? { knowsAbout: settings.author_credentials } : {}),
  };
}

export function websiteJsonLd(settings?: JsonLdSiteSettings | null): object | null {
  if (!usable(settings?.site_url)) return null;
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: settings?.site_name || settings?.publisher_name || "",
    url: settings?.site_url,
  };
}

export function breadcrumbJsonLd(items: Array<{ name: string; url: string }>): object | null {
  if (!items.length) return null;
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.name,
      item: item.url,
    })),
  };
}

export function faqJsonLd(
  faqs?: Array<{ question?: unknown; answer?: unknown }> | null,
): object | null {
  const valid = (faqs ?? []).filter(
    (f): f is { question: string; answer: string } =>
      typeof f?.question === "string" && typeof f?.answer === "string",
  );
  if (!valid.length) return null;
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: valid.map((faq) => ({
      "@type": "Question",
      name: faq.question,
      acceptedAnswer: { "@type": "Answer", text: faq.answer },
    })),
  };
}

export function itemListJsonLd(names: string[]): object | null {
  if (!names.length) return null;
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    numberOfItems: names.length,
    itemListElement: names.map((name, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name,
    })),
  };
}

export function speakableJsonLd(): object {
  return {
    "@context": "https://schema.org",
    "@type": "WebPage",
    speakable: {
      "@type": "SpeakableSpecification",
      cssSelector: [".answer-block", ".faq-answer"],
    },
  };
}

/** Drops nulls so callers can compose optional blocks inline. */
export function compactJsonLd(blocks: Array<object | null | undefined>): object[] {
  return blocks.filter((b): b is object => !!b);
}

/** Flattens generated-page section items to names, mirroring render-page. */
export function generatedItemNames(content: unknown): string[] {
  const out: string[] = [];
  const c = content as Record<string, unknown> | null;
  const sections: unknown[] =
    (Array.isArray(c?.["sections"]) && (c["sections"] as unknown[])) ||
    (Array.isArray(c?.["categories"]) && (c["categories"] as unknown[])) ||
    [];
  const nameKeys = [
    "name",
    "title",
    "idea",
    "tool_name",
    "strategy",
    "step",
    "template_name",
    "heading",
  ];
  for (const section of sections) {
    const s = section as Record<string, unknown> | null;
    const kids: unknown[] =
      (Array.isArray(s?.["items"]) && (s!["items"] as unknown[])) ||
      (Array.isArray(s?.["tools"]) && (s!["tools"] as unknown[])) ||
      (Array.isArray(s?.["templates"]) && (s!["templates"] as unknown[])) ||
      (Array.isArray(s?.["checklist_items"]) && (s!["checklist_items"] as unknown[])) ||
      (Array.isArray(s?.["faqs"]) && (s!["faqs"] as unknown[])) ||
      [];
    for (const kid of kids) {
      if (!kid || typeof kid !== "object") continue;
      for (const key of nameKeys) {
        const value = (kid as Record<string, unknown>)[key];
        if (typeof value === "string" && value.trim()) {
          out.push(value);
          break;
        }
      }
    }
  }
  return out;
}
