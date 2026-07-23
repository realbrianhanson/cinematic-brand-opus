// Server-rendered HTML for crawlers. Public, no auth.
import { createClient } from "npm:@supabase/supabase-js@2";

const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

const HTML_HEADERS = {
  "Content-Type": "text/html; charset=utf-8",
  "Cache-Control": "public, max-age=3600",
  "Access-Control-Allow-Origin": "*",
};

// ---------- utilities ----------

const esc = (s: unknown): string => {
  if (s === null || s === undefined) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
};

// Render inline markdown links [text](url) as real <a> anchors.
// Everything else is HTML-escaped. External URLs get target=_blank + rel.
function escWithLinks(s: unknown): string {
  const str = s === null || s === undefined ? "" : String(s);
  const parts: string[] = [];
  const re = /\[([^\]]+)\]\((\/[^)\s]+|https?:\/\/[^)\s]+)\)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(str)) !== null) {
    parts.push(esc(str.slice(last, m.index)));
    const [_, text, href] = m;
    const external = /^https?:\/\//i.test(href);
    const attrs = external ? ` target="_blank" rel="noopener nofollow"` : "";
    parts.push(`<a href="${esc(href)}"${attrs}>${esc(text)}</a>`);
    last = m.index + m[0].length;
  }
  parts.push(esc(str.slice(last)));
  return parts.join("");
}

const jsonLd = (obj: unknown) =>
  `<script type="application/ld+json">${JSON.stringify(obj).replace(/</g, "\\u003c")}</script>`;

const stripHtml = (html: string) =>
  html
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const truncate = (s: string, n = 160) => (s.length <= n ? s : s.slice(0, n - 1).trimEnd() + "…");

// Deep-walk any JSON node and render its scalar fields with sensible labels.
// Ensures we never omit content regardless of schema variance.
function renderNode(node: unknown, depth = 3): string {
  if (node === null || node === undefined) return "";
  if (typeof node === "string") {
    return node.trim() ? `<p>${escWithLinks(node)}</p>` : "";
  }
  if (typeof node === "number" || typeof node === "boolean") {
    return `<p>${esc(String(node))}</p>`;
  }
  if (Array.isArray(node)) {
    return `<ul>${node.map((v) => `<li>${renderNode(v, depth + 1)}</li>`).join("")}</ul>`;
  }
  if (typeof node === "object") {
    const o = node as Record<string, unknown>;
    const heading = o.title || o.name || o.heading || o.question || o.task || o.mistake;
    const tag = `h${Math.min(6, Math.max(2, depth))}`;
    let out = "";
    if (heading) out += `<${tag}>${esc(String(heading))}</${tag}>`;
    const skip = new Set(["title", "name", "heading", "question", "task", "mistake"]);
    for (const [k, v] of Object.entries(o)) {
      if (skip.has(k)) continue;
      if (v === null || v === undefined || v === "") continue;
      const label = k.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
      if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
        out += `<p><strong>${esc(label)}:</strong> ${escWithLinks(v)}</p>`;
      } else if (Array.isArray(v)) {
        if (v.every((x) => typeof x === "string")) {
          out += `<p><strong>${esc(label)}:</strong></p><ul>${v.map((x) => `<li>${esc(String(x))}</li>`).join("")}</ul>`;
        } else {
          out += `<div><p><strong>${esc(label)}</strong></p>${renderNode(v, depth + 1)}</div>`;
        }
      } else {
        out += `<div><p><strong>${esc(label)}</strong></p>${renderNode(v, depth + 1)}</div>`;
      }
    }
    return out;
  }
  return "";
}

// Render a single list item with an <h3> for its name field and paragraphs
// for every other scalar field. Used for listicle sections (ideas, tools,
// strategies, checklist steps, templates, etc.) so crawlers see proper
// heading hierarchy instead of flat <p><strong>Idea:</strong> ...</p>.
const ITEM_NAME_KEYS = [
  "name",
  "title",
  "tool_name",
  "idea",
  "strategy",
  "step",
  "task",
  "question",
  "mistake",
  "heading",
  "template_name",
  "tactic",
];

function renderItem(item: unknown): string {
  if (item === null || item === undefined) return "";
  if (typeof item !== "object" || Array.isArray(item)) {
    return renderNode(item, 3);
  }
  const o = item as Record<string, unknown>;
  let nameKey: string | null = null;
  for (const k of ITEM_NAME_KEYS) {
    const v = o[k];
    if (typeof v === "string" && v.trim()) {
      nameKey = k;
      break;
    }
  }
  let out = "";
  if (nameKey) out += `<h3>${esc(String(o[nameKey]))}</h3>`;
  for (const [k, v] of Object.entries(o)) {
    if (k === nameKey) continue;
    if (v === null || v === undefined || v === "") continue;
    const label = k.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
      out += `<p><strong>${esc(label)}:</strong> ${escWithLinks(v)}</p>`;
    } else if (Array.isArray(v)) {
      if (v.every((x) => typeof x === "string")) {
        out += `<p><strong>${esc(label)}:</strong></p><ul>${v.map((x) => `<li>${esc(String(x))}</li>`).join("")}</ul>`;
      } else {
        out += `<p><strong>${esc(label)}:</strong></p>${renderNode(v, 4)}`;
      }
    } else {
      out += `<p><strong>${esc(label)}:</strong></p>${renderNode(v, 4)}`;
    }
  }
  return out;
}

// Compose a <title> as "Page Title | Site Name". If that exceeds ~65 chars,
// drop the site suffix rather than mid-word truncating. Never trust a stored
// meta title blindly — those can be pre-chopped at 60 chars.
function composeTitle(pageTitle: string, siteName: string): string {
  const t = (pageTitle || "").trim();
  const s = (siteName || "").trim();
  if (!t) return s;
  const full = s ? `${t} | ${s}` : t;
  return full.length <= 65 ? full : t;
}

// ---------- shell ----------

interface Settings {
  site_name?: string;
  site_url?: string;
  author_name?: string;
  author_title?: string;
  author_bio?: string;
  author_credentials?: string[] | null;
  author_social_links?: Record<string, string> | null;
  publisher_name?: string;
  publisher_url?: string;
  cta_url?: string | null;
  cta_headline?: string | null;
  cta_subtext?: string | null;
  cta_button_text?: string | null;
  cta_social_proof?: string | null;
}

async function getSettings(): Promise<Settings> {
  const { data } = await supabase
    .from("site_settings")
    .select(
      "site_name, site_url, author_name, author_title, author_bio, author_credentials, author_social_links, publisher_name, publisher_url, cta_url, cta_headline, cta_subtext, cta_button_text, cta_social_proof",
    )
    .limit(1)
    .maybeSingle();
  return (data ?? {}) as Settings;
}

// Plain-text CTA block emitted near the end of every rendered page so crawlers
// see the training as part of the site's offering.
function ctaHtml(s: Settings): string {
  if (!s.cta_url) return "";
  const headline = s.cta_headline || "Learn AI in 3 Days. Free.";
  const cta = s.cta_button_text || "Save My Free Seat";
  const proof = s.cta_social_proof
    ? `<p style="font-size:.8rem;color:#555;margin:.25rem 0 0">${esc(s.cta_social_proof)}</p>`
    : "";
  return `<section class="site-cta" style="margin:2.5rem 0 1rem;padding:1.25rem 1.5rem;border:1px solid #D4AF55;border-radius:6px;background:#fbf6e8">
<h2 style="margin:0 0 .5rem">${esc(headline)}</h2>
${s.cta_subtext ? `<p style="margin:0 0 .5rem">${esc(s.cta_subtext)}</p>` : ""}
<p style="margin:0"><a href="${esc(s.cta_url)}" rel="noopener" target="_blank"><strong>${esc(cta)} →</strong></a></p>
${proof}
</section>`;
}

function siteBase(s: Settings): string {
  const u = s.site_url?.replace(/\/+$/, "");
  return u && !u.includes("example.com") ? u : "https://brianhanson.com";
}

function personLd(s: Settings, base: string) {
  const sameAs = Object.values(s.author_social_links ?? {}).filter(Boolean) as string[];
  return {
    "@context": "https://schema.org",
    "@type": "Person",
    "@id": `${base}#author`,
    name: s.author_name || "Author",
    ...(s.author_title && { jobTitle: s.author_title }),
    ...(s.author_bio && { description: s.author_bio }),
    ...(sameAs.length && { sameAs }),
    ...(s.author_credentials?.length && { knowsAbout: s.author_credentials }),
    url: base,
  };
}

// Sources / citations block. Real outbound links, capped at 8.
function sourcesHtml(sources: any): string {
  if (!Array.isArray(sources) || sources.length === 0) return "";
  const items = sources
    .filter((s: any) => s && typeof s.url === "string" && /^https?:\/\//i.test(s.url))
    .slice(0, 8)
    .map((s: any) => {
      const label = s.title ? esc(String(s.title)) : esc(String(s.url));
      return `<li><a href="${esc(s.url)}" rel="noopener" target="_blank">${label}</a></li>`;
    })
    .join("");
  if (!items) return "";
  return `<section><h2>Sources</h2><ul>${items}</ul></section>`;
}

// Author E-E-A-T box. Photo (if any), name, title, bio, credentials, social links.
function authorBoxHtml(s: Settings): string {
  if (!s.author_name && !s.author_bio) return "";
  const social = Object.entries(s.author_social_links ?? {})
    .filter(([_, v]) => typeof v === "string" && v)
    .map(([k, v]) => `<a href="${esc(v as string)}" rel="noopener" target="_blank">${esc(k)}</a>`)
    .join(" · ");
  const creds =
    Array.isArray(s.author_credentials) && s.author_credentials.length
      ? `<p><strong>Credentials:</strong> ${s.author_credentials.map((c: string) => esc(c)).join(", ")}</p>`
      : "";
  return `<aside class="author-box" style="margin-top:2rem;padding:1rem;border:1px solid #eee;border-radius:6px">
<h2 style="margin-top:0">About the author</h2>
<p><strong>${esc(s.author_name || "")}</strong>${s.author_title ? `, ${esc(s.author_title)}` : ""}</p>
${s.author_bio ? `<p>${esc(s.author_bio)}</p>` : ""}
${creds}
${social ? `<p>${social}</p>` : ""}
</aside>`;
}

// One-line editorial note under the byline.
function editorialNote(verifiedAt?: string | Date | null): string {
  const d = verifiedAt ? new Date(verifiedAt) : new Date();
  const month = d.toLocaleString("en-US", { month: "long" });
  const year = d.getFullYear();
  return `<p class="editorial-note" style="color:#555;font-size:.85rem;margin:-.5rem 0 1.5rem">Researched with live web data, reviewed against ${esc(month)} ${year} sources.</p>`;
}

function websiteLd(s: Settings, base: string) {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${base}#website`,
    name: s.site_name || s.publisher_name || "Website",
    url: base,
  };
}

function breadcrumbLd(base: string, items: Array<{ name: string; url: string }>) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: it.name,
      item: it.url.startsWith("http") ? it.url : `${base}${it.url}`,
    })),
  };
}

function faqLd(faqs: Array<{ question: string; answer: string }>) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({
      "@type": "Question",
      name: f.question,
      acceptedAnswer: { "@type": "Answer", text: f.answer },
    })),
  };
}

interface ShellArgs {
  path: string;
  title: string;
  description: string;
  ogImage?: string;
  type?: "website" | "article";
  publishedAt?: string;
  updatedAt?: string;
  extraLd?: object[];
  breadcrumbs: Array<{ name: string; url: string }>;
  settings: Settings;
  bodyHtml: string;
  status?: number;
}

function renderShell(a: ShellArgs): Response {
  const base = siteBase(a.settings);
  const canonical = `${base}${a.path}`;
  // Fall back to the site-wide brand OG so social cards never render without an image.
  const ogImageAbs = a.ogImage
    ? /^https?:\/\//i.test(a.ogImage)
      ? a.ogImage
      : `${base}${a.ogImage.startsWith("/") ? "" : "/"}${a.ogImage}`
    : `${base}/og-default.png`;
  const ld: object[] = [
    websiteLd(a.settings, base),
    personLd(a.settings, base),
    breadcrumbLd(base, a.breadcrumbs),
    ...(a.extraLd ?? []),
  ];
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(a.title)}</title>
<meta name="description" content="${esc(a.description)}">
<link rel="canonical" href="${esc(canonical)}">
<meta property="og:title" content="${esc(a.title)}">
<meta property="og:description" content="${esc(a.description)}">
<meta property="og:url" content="${esc(canonical)}">
<meta property="og:type" content="${esc(a.type ?? "website")}">
<meta property="og:site_name" content="${esc(a.settings.site_name || a.settings.publisher_name || "")}">
<meta property="og:image" content="${esc(ogImageAbs)}">
${a.publishedAt ? `<meta property="article:published_time" content="${esc(a.publishedAt)}">` : ""}
${a.updatedAt ? `<meta property="article:modified_time" content="${esc(a.updatedAt)}">` : ""}
${a.settings.author_name ? `<meta property="article:author" content="${esc(a.settings.author_name)}">` : ""}
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(a.title)}">
<meta name="twitter:description" content="${esc(a.description)}">
<meta name="twitter:image" content="${esc(ogImageAbs)}">
${ld.map(jsonLd).join("\n")}
<style>body{font-family:system-ui,sans-serif;max-width:820px;margin:2rem auto;padding:0 1rem;line-height:1.6;color:#111}nav.crumbs{font-size:.85rem;color:#555;margin-bottom:1rem}nav.crumbs a{color:#555}h1{font-size:2rem;margin:.5rem 0}h2{margin-top:2rem}h3{margin-top:1.25rem}.byline{color:#555;font-size:.9rem;margin-bottom:1.5rem}ul{padding-left:1.25rem}a{color:#0645ad}</style>
</head>
<body>
<nav class="crumbs">${a.breadcrumbs
    .map((b, i) => (i === a.breadcrumbs.length - 1 ? esc(b.name) : `<a href="${esc(b.url)}">${esc(b.name)}</a> ›`))
    .join(" ")}</nav>
${a.bodyHtml}
${ctaHtml(a.settings)}
</body>
</html>`;
  return new Response(html, { status: a.status ?? 200, headers: HTML_HEADERS });
}

function notFound(settings: Settings, path: string): Response {
  return renderShell({
    path,
    title: "Not found",
    description: "The page you requested does not exist.",
    breadcrumbs: [
      { name: "Home", url: "/" },
      { name: "Not found", url: path },
    ],
    settings,
    bodyHtml: `<h1>404 — Not found</h1><p>No content at <code>${esc(path)}</code>.</p><p><a href="/">Return home</a></p>`,
    status: 404,
  });
}

// ---------- route handlers ----------

async function renderHome(settings: Settings, path: string): Promise<Response> {
  const title = settings.site_name
    ? `${settings.site_name} — ${settings.author_title || settings.publisher_name || ""}`.trim()
    : settings.publisher_name || "Home";
  const description = settings.author_bio || `Site of ${settings.author_name || settings.publisher_name || ""}`;
  const body = `
<h1>${esc(settings.site_name || settings.publisher_name || "Home")}</h1>
${settings.author_name ? `<p class="byline">By ${esc(settings.author_name)}${settings.author_title ? `, ${esc(settings.author_title)}` : ""}</p>` : ""}
${settings.author_bio ? `<p>${esc(settings.author_bio)}</p>` : ""}
<h2>Explore</h2>
<ul>
  <li><a href="/blog">Blog</a> — articles and posts</li>
  <li><a href="/resources">Resources</a> — guides, roundups, checklists</li>
  <li><a href="/sitemap">Sitemap</a> — every published page</li>
</ul>`;
  return renderShell({
    path,
    title,
    description,
    breadcrumbs: [{ name: "Home", url: "/" }],
    settings,
    bodyHtml: body,
  });
}

async function renderBlogIndex(settings: Settings, path: string): Promise<Response> {
  const { data: posts } = await supabase
    .from("posts")
    .select("slug, title, excerpt, featured_image, updated_at, created_at")
    .eq("status", "published")
    .order("created_at", { ascending: false });
  const items = posts ?? [];
  const body = `
<h1>Blog</h1>
<p>${items.length} published post${items.length === 1 ? "" : "s"}.</p>
${items
  .map(
    (p: any) => `<article style="margin:1.5rem 0;border-top:1px solid #eee;padding-top:1rem">
  <h2 style="margin:.25rem 0"><a href="/blog/${esc(p.slug)}">${esc(p.title)}</a></h2>
  ${p.excerpt ? `<p>${esc(p.excerpt)}</p>` : ""}
  <p><a href="/blog/${esc(p.slug)}">Read →</a></p>
</article>`,
  )
  .join("")}`;
  return renderShell({
    path,
    title: `Blog — ${settings.site_name || settings.publisher_name || ""}`.trim(),
    description: `All published articles${settings.author_name ? ` by ${settings.author_name}` : ""}.`,
    breadcrumbs: [
      { name: "Home", url: "/" },
      { name: "Blog", url: "/blog" },
    ],
    settings,
    bodyHtml: body,
  });
}

async function renderBlogPost(settings: Settings, path: string, slug: string): Promise<Response> {
  const { data: post } = await supabase
    .from("posts")
    .select(
      "id, title, slug, content, excerpt, featured_image, featured_image_alt, tldr, key_takeaways, faq_items, category_id, created_at, updated_at, reading_time, status",
    )
    .eq("slug", slug)
    .eq("status", "published")
    .maybeSingle();
  if (!post) return notFound(settings, path);

  const { data: seo } = await supabase
    .from("seo_metadata")
    .select("meta_title, meta_description, keywords, og_image")
    .eq("post_id", post.id)
    .maybeSingle();

  const base = siteBase(settings);
  const canonical = `${base}${path}`;
  const description = seo?.meta_description || post.excerpt || truncate(stripHtml(post.content || ""));
  const title = seo?.meta_title || `${post.title} — ${settings.publisher_name || ""}`.trim();
  const ogImage = seo?.og_image || post.featured_image || undefined;
  const faqs: Array<{ question: string; answer: string }> = Array.isArray(post.faq_items) ? post.faq_items : [];
  const takeaways: string[] = Array.isArray(post.key_takeaways)
    ? (post.key_takeaways as any[]).map((t) => (typeof t === "string" ? t : t?.text || "")).filter(Boolean)
    : [];

  // sibling posts
  const { data: related } = await supabase
    .from("posts")
    .select("slug, title")
    .eq("status", "published")
    .neq("id", post.id)
    .order("created_at", { ascending: false })
    .limit(6);

  const article = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: post.title,
    description,
    ...(ogImage && { image: ogImage }),
    author: { "@id": `${base}#author` },
    publisher: {
      "@type": "Organization",
      name: settings.publisher_name || settings.site_name || "Publisher",
      ...(settings.publisher_url && !settings.publisher_url.includes("example.com") && { url: settings.publisher_url }),
    },
    datePublished: post.created_at,
    dateModified: post.updated_at,
    mainEntityOfPage: canonical,
  };
  const extraLd: object[] = [article];
  if (faqs.length) extraLd.push(faqLd(faqs));

  const body = `
<article>
  <h1>${esc(post.title)}</h1>
  <p class="byline">${settings.author_name ? `By ${esc(settings.author_name)}` : ""}${post.created_at ? ` · Published ${esc(new Date(post.created_at).toISOString().slice(0, 10))}` : ""}${post.updated_at ? ` · Updated ${esc(new Date(post.updated_at).toISOString().slice(0, 10))}` : ""}${post.reading_time ? ` · ${esc(post.reading_time)} min read` : ""}</p>
  ${post.featured_image ? `<p><img src="${esc(post.featured_image)}" alt="${esc((post as any).featured_image_alt || post.title)}" style="max-width:100%;height:auto"></p>` : ""}
  ${post.tldr ? `<aside><h2>TL;DR</h2><p>${esc(post.tldr)}</p></aside>` : ""}
  ${takeaways.length ? `<section><h2>Key takeaways</h2><ul>${takeaways.map((t) => `<li>${esc(t)}</li>`).join("")}</ul></section>` : ""}
  <section>${post.content || ""}</section>
  ${
    faqs.length
      ? `<section><h2>Frequently asked questions</h2>${faqs
          .map((f) => `<h3>${esc(f.question)}</h3><p>${escWithLinks(f.answer)}</p>`)
          .join("")}</section>`
      : ""
  }
  ${
    (related?.length ?? 0) > 0
      ? `<section><h2>Related posts</h2><ul>${related!
          .map((r: any) => `<li><a href="/blog/${esc(r.slug)}">${esc(r.title)}</a></li>`)
          .join("")}</ul></section>`
      : ""
  }
</article>`;

  return renderShell({
    path,
    title,
    description,
    ogImage,
    type: "article",
    publishedAt: post.created_at ?? undefined,
    updatedAt: post.updated_at ?? undefined,
    extraLd,
    breadcrumbs: [
      { name: "Home", url: "/" },
      { name: "Blog", url: "/blog" },
      { name: post.title, url: path },
    ],
    settings,
    bodyHtml: body,
  });
}

async function renderResourcesIndex(settings: Settings, path: string): Promise<Response> {
  const [{ data: types }, { data: niches }] = await Promise.all([
    supabase.from("content_schemas").select("slug, name, description").eq("is_active", true).order("name"),
    supabase.from("niches").select("slug, name").eq("is_active", true).order("name"),
  ]);
  const body = `
<h1>Resources</h1>
<p>Browse published resources by format or topic.</p>
<h2>Formats</h2>
<ul>${(types ?? [])
    .map(
      (t: any) =>
        `<li><a href="/resources/${esc(t.slug)}">${esc(t.name)}</a>${t.description ? ` — ${esc(t.description)}` : ""}</li>`,
    )
    .join("")}</ul>
<h2>Topics</h2>
<ul>${(niches ?? []).map((n: any) => `<li>${esc(n.name)}</li>`).join("")}</ul>`;
  return renderShell({
    path,
    title: `Resources — ${settings.site_name || settings.publisher_name || ""}`.trim(),
    description: "Guides, roundups, checklists, templates, and more.",
    breadcrumbs: [
      { name: "Home", url: "/" },
      { name: "Resources", url: "/resources" },
    ],
    settings,
    bodyHtml: body,
  });
}

async function renderContentTypeList(settings: Settings, path: string, typeSlug: string): Promise<Response> {
  const { data: schema } = await supabase
    .from("content_schemas")
    .select("id, name, slug, description")
    .eq("slug", typeSlug)
    .eq("is_active", true)
    .maybeSingle();
  if (!schema) return notFound(settings, path);

  const { data: pages } = await supabase
    .from("generated_pages")
    .select("slug, title, seo_meta, updated_at")
    .eq("content_schema_id", schema.id)
    .eq("status", "published")
    .order("title");
  const items = pages ?? [];
  const body = `
<h1>${esc(schema.name)}</h1>
${schema.description ? `<p>${esc(schema.description)}</p>` : ""}
<p>${items.length} published page${items.length === 1 ? "" : "s"}.</p>
<ul>${items
    .map((p: any) => `<li><a href="/resources/${esc(schema.slug)}/${esc(p.slug)}">${esc(p.title)}</a></li>`)
    .join("")}</ul>`;
  return renderShell({
    path,
    title: `${schema.name} — ${settings.site_name || settings.publisher_name || ""}`.trim(),
    description: schema.description || `All ${schema.name}.`,
    breadcrumbs: [
      { name: "Home", url: "/" },
      { name: "Resources", url: "/resources" },
      { name: schema.name, url: `/resources/${schema.slug}` },
    ],
    settings,
    bodyHtml: body,
  });
}

async function renderGeneratedPage(
  settings: Settings,
  path: string,
  typeSlug: string,
  pageSlug: string,
): Promise<Response> {
  const { data: schema } = await supabase
    .from("content_schemas")
    .select("id, name, slug, renderer_component")
    .eq("slug", typeSlug)
    .maybeSingle();
  if (!schema) return notFound(settings, path);

  const { data: page } = await supabase
    .from("generated_pages")
    .select(
      "id, slug, title, content_json, seo_meta, status, niche_id, published_at, updated_at, created_at, last_refreshed, content_schema_id",
    )
    .eq("slug", pageSlug)
    .eq("content_schema_id", schema.id)
    .eq("status", "published")
    .maybeSingle();
  if (!page) return notFound(settings, path);

  const content = (page.content_json ?? {}) as Record<string, any>;
  const seo = (page.seo_meta ?? {}) as Record<string, any>;
  const base = siteBase(settings);
  const canonical = `${base}${path}`;

  const description =
    seo.meta_description ||
    seo.description ||
    (typeof content.intro === "string" ? truncate(content.intro) : `Read: ${page.title}`);
  const title = composeTitle(page.title, settings.site_name || settings.publisher_name || "");
  const ogImage = seo.og_image || seo.image || undefined;

  // niche + pillar + siblings.
  // Prefer stored internal_links (built at publish time) so anchor text + link set
  // stays consistent with the silo model. Falls back to a live niche query.
  let niche: any = null;
  let pillar: any = null;
  let siblings: {
    slug: string;
    title: string;
    content_schema_id?: string;
    content_schema_slug?: string;
    anchor_text?: string;
  }[] = [];
  if (page.niche_id) {
    const { data: n } = await supabase.from("niches").select("id, slug, name").eq("id", page.niche_id).maybeSingle();
    niche = n;

    // Try stored internal_links first
    const { data: storedLinks } = await supabase
      .from("internal_links")
      .select("target_page_id, target_page_type, link_type, anchor_text")
      .eq("source_page_id", page.id)
      .in("link_type", ["silo_up", "silo_sibling"]);

    const siblingTargetIds = (storedLinks ?? [])
      .filter((l: any) => l.link_type === "silo_sibling" && l.target_page_type === "generated")
      .map((l: any) => l.target_page_id);
    const pillarLink = (storedLinks ?? []).find(
      (l: any) => l.link_type === "silo_up" && l.target_page_type === "pillar",
    );

    if (siblingTargetIds.length > 0) {
      const { data: sibs } = await supabase
        .from("generated_pages")
        .select("id, slug, title, content_schema_id, content_schemas(slug)")
        .in("id", siblingTargetIds);
      const anchorById: Record<string, string> = {};
      for (const l of storedLinks ?? [])
        if (l.link_type === "silo_sibling") anchorById[l.target_page_id] = l.anchor_text;
      siblings = (sibs ?? []).map((s: any) => ({
        slug: s.slug,
        title: s.title,
        content_schema_id: s.content_schema_id,
        content_schema_slug: s.content_schemas?.slug,
        anchor_text: anchorById[s.id] || s.title,
      }));
    }
    if (pillarLink) {
      const { data: pil } = await supabase
        .from("pillar_pages")
        .select("slug, title")
        .eq("id", pillarLink.target_page_id)
        .maybeSingle();
      if (pil) pillar = pil;
    }

    // Fallback if nothing stored yet
    if (siblings.length === 0 || !pillar) {
      const [{ data: pil }, { data: sibs }] = await Promise.all([
        pillar
          ? Promise.resolve({ data: pillar })
          : supabase
              .from("pillar_pages")
              .select("slug, title, status")
              .eq("niche_id", page.niche_id)
              .eq("status", "published")
              .maybeSingle(),
        siblings.length > 0
          ? Promise.resolve({ data: null })
          : supabase
              .from("generated_pages")
              .select("slug, title, content_schema_id, content_schemas(slug)")
              .eq("niche_id", page.niche_id)
              .eq("status", "published")
              .neq("id", page.id)
              .limit(10),
      ]);
      if (!pillar && pil) pillar = pil;
      if (siblings.length === 0 && sibs) {
        siblings = (sibs as any[]).map((s: any) => ({
          slug: s.slug,
          title: s.title,
          content_schema_id: s.content_schema_id,
          content_schema_slug: s.content_schemas?.slug,
        }));
      }
    }
  }

  // Related blog posts (recent, no strict topical join available)
  const { data: recentPosts } = await supabase
    .from("posts")
    .select("slug, title")
    .eq("status", "published")
    .order("created_at", { ascending: false })
    .limit(4);

  // Build sections list generically.
  const sections: any[] =
    (Array.isArray(content.sections) && content.sections) ||
    (Array.isArray(content.categories) && content.categories) ||
    [];

  const faqs: Array<{ question: string; answer: string }> = Array.isArray(content.frequently_asked_questions)
    ? content.frequently_asked_questions
    : Array.isArray(content.faqs)
      ? content.faqs
      : [];

  // JSON-LD
  const article = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: page.title,
    description,
    ...(ogImage && { image: ogImage }),
    author: { "@id": `${base}#author` },
    publisher: {
      "@type": "Organization",
      name: settings.publisher_name || settings.site_name || "Publisher",
      ...(settings.publisher_url && !settings.publisher_url.includes("example.com") && { url: settings.publisher_url }),
    },
    datePublished: page.published_at || page.created_at,
    dateModified: page.updated_at,
    mainEntityOfPage: canonical,
  };

  // Flatten all item-like children from sections for ItemList
  const listItems: string[] = [];
  for (const s of sections) {
    const kids: any[] =
      (Array.isArray(s?.items) && s.items) ||
      (Array.isArray(s?.tools) && s.tools) ||
      (Array.isArray(s?.templates) && s.templates) ||
      (Array.isArray(s?.checklist_items) && s.checklist_items) ||
      (Array.isArray(s?.faqs) && s.faqs) ||
      [];
    for (const k of kids) {
      if (!k || typeof k !== "object") continue;
      const o = k as Record<string, unknown>;
      let name: string | null = null;
      for (const nk of ITEM_NAME_KEYS) {
        const v = o[nk];
        if (typeof v === "string" && v.trim()) {
          name = v;
          break;
        }
      }
      if (name) listItems.push(name);
    }
  }

  const extraLd: object[] = [article];
  if (listItems.length) {
    extraLd.push({
      "@context": "https://schema.org",
      "@type": "ItemList",
      numberOfItems: listItems.length,
      itemListElement: listItems.map((n, i) => ({
        "@type": "ListItem",
        position: i + 1,
        name: n,
      })),
    });
  }
  if (faqs.length) extraLd.push(faqLd(faqs));

  const pubDate = page.published_at || page.created_at;

  const lastVerified = (page as any).last_refreshed || pubDate;
  const heroImage = typeof content.hero_image === "string" ? content.hero_image : "";
  const heroAlt = typeof content.hero_image_alt === "string" ? content.hero_image_alt : page.title;
  const expertQuote = typeof content?.expert_callout?.quote === "string" ? content.expert_callout.quote : "";
  const body = `
<article>
  <h1>${esc(page.title)}</h1>
  <p class="byline">${settings.author_name ? `By ${esc(settings.author_name)}` : ""}${pubDate ? ` · Published ${esc(new Date(pubDate).toISOString().slice(0, 10))}` : ""}${page.updated_at ? ` · Updated ${esc(new Date(page.updated_at).toISOString().slice(0, 10))}` : ""}${lastVerified ? ` · Last verified ${esc(new Date(lastVerified).toISOString().slice(0, 10))}` : ""}</p>
  ${editorialNote(lastVerified)}
  ${content.intro ? `<p>${escWithLinks(String(content.intro))}</p>` : ""}
  ${heroImage ? `<figure><img src="${esc(heroImage)}" alt="${esc(heroAlt)}" loading="lazy" style="max-width:100%;height:auto;display:block"></figure>` : ""}
  ${expertQuote ? `<aside class="expert-callout" style="border-left:3px solid #D4AF55;background:#fbf6e8;padding:1rem 1.25rem;margin:1.5rem 0"><p style="font-size:.75rem;letter-spacing:.15em;text-transform:uppercase;color:#8a6a1a;margin:0 0 .5rem">From the trenches</p><p style="font-style:italic;margin:0">${esc(expertQuote)}</p>${settings.author_name ? `<p style="font-size:.8rem;color:#555;margin:.5rem 0 0">— ${esc(settings.author_name)}</p>` : ""}</aside>` : ""}
  ${sections
    .map((s: any) => {
      const kids: any[] =
        (Array.isArray(s?.items) && s.items) ||
        (Array.isArray(s?.tools) && s.tools) ||
        (Array.isArray(s?.templates) && s.templates) ||
        (Array.isArray(s?.checklist_items) && s.checklist_items) ||
        (Array.isArray(s?.faqs) && s.faqs) ||
        [];
      const header = s?.title || s?.heading || s?.name || "";
      let out = header ? `<h2>${esc(header)}</h2>` : "";
      if (s?.description) out += `<p>${escWithLinks(s.description)}</p>`;
      if (s?.content) out += `<p>${escWithLinks(s.content)}</p>`;
      if (Array.isArray(s?.key_points)) {
        out += `<ul>${s.key_points.map((k: string) => `<li>${escWithLinks(k)}</li>`).join("")}</ul>`;
      }
      for (const k of kids) out += renderItem(k);
      return out;
    })
    .join("")}
  ${
    Array.isArray(content.common_mistakes) && content.common_mistakes.length
      ? `<section><h2>Common mistakes</h2>${content.common_mistakes.map((m: any) => renderItem(m)).join("")}</section>`
      : ""
  }
  ${
    Array.isArray(content.pro_tips) && content.pro_tips.length
      ? `<section><h2>Pro tips</h2>${content.pro_tips.map((t: any) => renderItem(t)).join("")}</section>`
      : ""
  }
  ${sourcesHtml((content as any).sources)}
  ${
    faqs.length
      ? `<section><h2>Frequently asked questions</h2>${faqs
          .map((f) => `<h3>${esc(f.question)}</h3><p>${escWithLinks(f.answer)}</p>`)
          .join("")}</section>`
      : ""
  }
  ${authorBoxHtml(settings)}
</article>
${
  pillar
    ? `<section><h2>Pillar guide</h2><p><a href="/guides/${esc(pillar.slug)}">${esc(pillar.title)}</a></p></section>`
    : ""
}
${
  siblings.length
    ? `<section><h2>More in ${esc(niche?.name ?? "this topic")}</h2><ul>${siblings
        .map(
          (s) =>
            `<li><a href="/resources/${esc(s.content_schema_slug || schema.slug)}/${esc(s.slug)}">${esc(s.anchor_text || s.title)}</a></li>`,
        )
        .join("")}</ul></section>`
    : ""
}
${
  (recentPosts?.length ?? 0) > 0
    ? `<section><h2>From the blog</h2><ul>${recentPosts!
        .map((p: any) => `<li><a href="/blog/${esc(p.slug)}">${esc(p.title)}</a></li>`)
        .join("")}</ul></section>`
    : ""
}`;

  return renderShell({
    path,
    title,
    description,
    ogImage,
    type: "article",
    publishedAt: pubDate ?? undefined,
    updatedAt: page.updated_at ?? undefined,
    extraLd,
    breadcrumbs: [
      { name: "Home", url: "/" },
      { name: "Resources", url: "/resources" },
      { name: schema.name, url: `/resources/${schema.slug}` },
      { name: page.title, url: path },
    ],
    settings,
    bodyHtml: body,
  });
}

async function renderPillarPage(settings: Settings, path: string, slug: string): Promise<Response> {
  const { data: pillar } = await supabase
    .from("pillar_pages")
    .select("id, slug, title, content, seo_meta, status, published_at, created_at, updated_at, niche_id")
    .eq("slug", slug)
    .eq("status", "published")
    .maybeSingle();
  if (!pillar) return notFound(settings, path);

  const seo = (pillar.seo_meta ?? {}) as Record<string, any>;
  const base = siteBase(settings);
  const canonical = `${base}${path}`;
  const description = seo.meta_description || seo.description || truncate(stripHtml(pillar.content || ""));
  const title = seo.meta_title || `${pillar.title} — ${settings.publisher_name || ""}`.trim();
  const ogImage = seo.og_image || undefined;

  // Related generated pages under this niche
  const { data: related } = await supabase
    .from("generated_pages")
    .select("slug, title, content_schema_id")
    .eq("niche_id", pillar.niche_id)
    .eq("status", "published")
    .limit(20);
  let relatedList = "";
  if (related?.length) {
    const ids = Array.from(new Set(related.map((r: any) => r.content_schema_id))).filter(Boolean);
    const { data: schemas } = await supabase
      .from("content_schemas")
      .select("id, slug")
      .in("id", ids as string[]);
    const bySchema: Record<string, string> = {};
    (schemas ?? []).forEach((s: any) => (bySchema[s.id] = s.slug));
    relatedList = `<section><h2>Related resources</h2><ul>${related
      .filter((r: any) => bySchema[r.content_schema_id])
      .map(
        (r: any) =>
          `<li><a href="/resources/${esc(bySchema[r.content_schema_id])}/${esc(r.slug)}">${esc(r.title)}</a></li>`,
      )
      .join("")}</ul></section>`;
  }

  const article = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: pillar.title,
    description,
    ...(ogImage && { image: ogImage }),
    author: { "@id": `${base}#author` },
    publisher: {
      "@type": "Organization",
      name: settings.publisher_name || settings.site_name || "Publisher",
      ...(settings.publisher_url && !settings.publisher_url.includes("example.com") && { url: settings.publisher_url }),
    },
    datePublished: pillar.published_at || pillar.created_at,
    dateModified: pillar.updated_at,
    mainEntityOfPage: canonical,
  };

  const pillarFaqs: Array<{ question: string; answer: string }> = Array.isArray((seo as any).faqs)
    ? ((seo as any).faqs as any[]).filter((f) => f && typeof f.question === "string" && typeof f.answer === "string")
    : [];
  const extraLd: object[] = [article];
  if (pillarFaqs.length) extraLd.push(faqLd(pillarFaqs));

  const pubDate = pillar.published_at || pillar.created_at;
  const body = `
<article>
  <h1>${esc(pillar.title)}</h1>
  <p class="byline">${settings.author_name ? `By ${esc(settings.author_name)}` : ""}${pubDate ? ` · Published ${esc(new Date(pubDate).toISOString().slice(0, 10))}` : ""}${pillar.updated_at ? ` · Updated ${esc(new Date(pillar.updated_at).toISOString().slice(0, 10))}` : ""}</p>
  <section>${pillar.content || ""}</section>
</article>
${relatedList}`;

  return renderShell({
    path,
    title,
    description,
    ogImage,
    type: "article",
    publishedAt: pubDate ?? undefined,
    updatedAt: pillar.updated_at ?? undefined,
    extraLd,
    breadcrumbs: [
      { name: "Home", url: "/" },
      { name: "Guides", url: "/resources" },
      { name: pillar.title, url: path },
    ],
    settings,
    bodyHtml: body,
  });
}

async function renderSitemap(settings: Settings, path: string): Promise<Response> {
  const [{ data: posts }, { data: pages }, { data: pillars }, { data: schemas }] = await Promise.all([
    supabase.from("posts").select("slug, title").eq("status", "published").order("title"),
    supabase.from("generated_pages").select("slug, title, content_schema_id").eq("status", "published").order("title"),
    supabase.from("pillar_pages").select("slug, title").eq("status", "published").order("title"),
    supabase.from("content_schemas").select("id, slug, name").eq("is_active", true).order("name"),
  ]);
  const schemaById: Record<string, { slug: string; name: string }> = {};
  (schemas ?? []).forEach((s: any) => (schemaById[s.id] = { slug: s.slug, name: s.name }));

  const body = `
<h1>Sitemap</h1>
<h2>Main</h2>
<ul>
  <li><a href="/">Home</a></li>
  <li><a href="/blog">Blog</a></li>
  <li><a href="/resources">Resources</a></li>
</ul>
<h2>Blog posts</h2>
<ul>${(posts ?? []).map((p: any) => `<li><a href="/blog/${esc(p.slug)}">${esc(p.title)}</a></li>`).join("")}</ul>
<h2>Guides</h2>
<ul>${(pillars ?? []).map((p: any) => `<li><a href="/guides/${esc(p.slug)}">${esc(p.title)}</a></li>`).join("")}</ul>
<h2>Resources</h2>
<ul>${(pages ?? [])
    .filter((p: any) => schemaById[p.content_schema_id])
    .map(
      (p: any) =>
        `<li><a href="/resources/${esc(schemaById[p.content_schema_id].slug)}/${esc(p.slug)}">${esc(p.title)}</a></li>`,
    )
    .join("")}</ul>`;
  return renderShell({
    path,
    title: `Sitemap — ${settings.site_name || settings.publisher_name || ""}`.trim(),
    description: "Every published page on the site.",
    breadcrumbs: [
      { name: "Home", url: "/" },
      { name: "Sitemap", url: "/sitemap" },
    ],
    settings,
    bodyHtml: body,
  });
}

// ---------- router ----------

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "*",
      },
    });
  }

  const url = new URL(req.url);
  let path = url.searchParams.get("path") || "/";
  if (!path.startsWith("/")) path = "/" + path;
  // Strip query and hash, collapse trailing slash (except root)
  path = path.split("?")[0].split("#")[0];
  if (path.length > 1) path = path.replace(/\/+$/, "");

  const settings = await getSettings();

  try {
    const parts = path.split("/").filter(Boolean);

    if (parts.length === 0) return renderHome(settings, "/");
    if (parts[0] === "blog") {
      if (parts.length === 1) return renderBlogIndex(settings, path);
      if (parts.length === 2) return renderBlogPost(settings, path, parts[1]);
    }
    if (parts[0] === "resources") {
      if (parts.length === 1) return renderResourcesIndex(settings, path);
      if (parts.length === 2) return renderContentTypeList(settings, path, parts[1]);
      if (parts.length === 3) return renderGeneratedPage(settings, path, parts[1], parts[2]);
    }
    if (parts[0] === "guides" && parts.length === 2) {
      return renderPillarPage(settings, path, parts[1]);
    }
    if (parts[0] === "sitemap" && parts.length === 1) {
      return renderSitemap(settings, path);
    }
    return notFound(settings, path);
  } catch (err) {
    console.error("render-page error", err);
    return new Response(
      `<!doctype html><title>Error</title><h1>500</h1><p>${esc(String((err as Error).message))}</p>`,
      { status: 500, headers: HTML_HEADERS },
    );
  }
});
