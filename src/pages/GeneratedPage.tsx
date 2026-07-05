import { useEffect, useMemo, useRef, useState } from "react";
import PageHead from "@/components/PageHead";
import Footer from "@/components/Footer";
import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Linkedin, Twitter, Facebook, Link2, ThumbsUp, ThumbsDown, Clock, Calendar } from "lucide-react";
import Nav from "@/components/Nav";
import PublicCTA from "@/components/PublicCTA";
import Breadcrumbs from "@/components/Breadcrumbs";
import PillarBanner from "@/components/PillarBanner";
import RelatedResources from "@/components/RelatedResources";
import StructuredData from "@/components/StructuredData";
import SiloSidebar from "@/components/SiloSidebar";
import WidgetRenderer from "@/components/WidgetRenderer";

import IdeaListRenderer from "@/components/renderers/IdeaListRenderer";
import ChecklistRenderer from "@/components/renderers/ChecklistRenderer";
import GuideRenderer from "@/components/renderers/GuideRenderer";
import ToolRoundupRenderer from "@/components/renderers/ToolRoundupRenderer";
import TemplateRenderer from "@/components/renderers/TemplateRenderer";
import FAQRenderer from "@/components/renderers/FAQRenderer";

const renderers: Record<string, React.ComponentType<{ contentJson: any; nicheName: string; pageId: string }>> = {
  IdeaListRenderer, ChecklistRenderer, GuideRenderer, ToolRoundupRenderer, TemplateRenderer, FAQRenderer,
};

function readingTime(json: any): number {
  const strings: string[] = [];
  function extract(obj: any) {
    if (typeof obj === "string") strings.push(obj);
    else if (Array.isArray(obj)) obj.forEach(extract);
    else if (obj && typeof obj === "object") Object.values(obj).forEach(extract);
  }
  extract(json);
  const wordCount = strings.join(" ").split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(wordCount / 200));
}

const GeneratedPage = () => {
  const { contentType, pageSlug } = useParams<{ contentType: string; pageSlug: string }>();
  const viewCounted = useRef(false);
  const [copied, setCopied] = useState(false);
  const [feedback, setFeedback] = useState<"up" | "down" | null>(null);

  const { data: page, isLoading } = useQuery({
    queryKey: ["public-gen-page", contentType, pageSlug],
    queryFn: async () => {
      const { data: schema } = await supabase.from("content_schemas").select("id, name, slug, renderer_component").eq("slug", contentType!).maybeSingle();
      if (!schema) return null;
      const { data: pg } = await supabase
        .from("generated_pages").select("*, niches!generated_pages_niche_id_fkey(id, name, slug, context)")
        .eq("content_schema_id", schema.id).eq("slug", pageSlug!).maybeSingle();
      if (!pg) return null;
      const niche = (pg as any).niches || { id: null, name: "", slug: "", context: {} };
      return { ...pg, schema, niche };
    },
    enabled: !!contentType && !!pageSlug,
  });

  const { data: settings } = useQuery({
    queryKey: ["public-site-settings"],
    queryFn: async () => {
      const { data } = await supabase.from("site_settings").select("id, site_name, site_url, author_name, author_title, author_bio, author_credentials, author_social_links, cta_url, cta_headline, cta_subtext, cta_button_text, cta_social_proof, publisher_name, publisher_url, updated_at").limit(1).maybeSingle();
      return data;
    },
  });

  useEffect(() => {
    if (page?.id && !viewCounted.current) {
      viewCounted.current = true;
      supabase.from("page_engagement").insert({ page_id: page.id, event_type: "view", metadata: {} }).then(() => {});
    }
  }, [page?.id]);

  const seo = (page?.seo_meta as any) || {};
  const pageUrl = `${settings?.site_url || ""}/resources/${contentType}/${pageSlug}`;

  const content = page?.content_json as any;
  const Renderer = page?.schema?.renderer_component ? renderers[page.schema.renderer_component] : null;
  const faqs = content?.frequently_asked_questions;
  const rt = content ? readingTime(content) : 1;
  const shareUrl = typeof window !== "undefined" ? window.location.href : "";

  // Flatten section items → names, mirroring the server-side ItemList in render-page.
  const itemListNames = useMemo<string[]>(() => {
    const out: string[] = [];
    const sections: any[] =
      (Array.isArray(content?.sections) && content.sections) ||
      (Array.isArray(content?.categories) && content.categories) ||
      [];
    const nameKeys = ["name", "title", "idea", "tool_name", "strategy", "step", "template_name", "heading"];
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
        for (const nk of nameKeys) {
          const v = k[nk];
          if (typeof v === "string" && v.trim()) { out.push(v); break; }
        }
      }
    }
    return out;
  }, [content]);

  const logEngagement = async (eventType: string, metadata: any = {}) => {
    if (!page?.id) return;
    await supabase.from("page_engagement").insert({ page_id: page.id, event_type: eventType, metadata });
  };

  const handleCopyLink = () => { navigator.clipboard.writeText(shareUrl); setCopied(true); setTimeout(() => setCopied(false), 2000); };
  const handleFeedback = (type: "up" | "down") => { if (feedback) return; setFeedback(type); logEngagement("feedback", { type }); };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#07070E" }}>
        <p className="font-body" style={{ color: "rgba(255,255,255,0.3)" }}>Loading...</p>
      </div>
    );
  }

  if (!page) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4" style={{ background: "#07070E" }}>
        <p className="font-display italic text-2xl" style={{ color: "rgba(255,255,255,0.5)" }}>Page not found</p>
        <Link to="/resources" className="font-body underline" style={{ color: "#D4AF55", fontSize: 14 }}>← Back to Resources</Link>
      </div>
    );
  }

  // Extract section headings for the sticky TOC
  const tocItems: { id: string; label: string }[] = (() => {
    const sections: any[] =
      (Array.isArray(content?.sections) && content.sections) ||
      (Array.isArray(content?.categories) && content.categories) ||
      (Array.isArray(content?.phases) && content.phases) ||
      [];
    const items: { id: string; label: string }[] = [];
    sections.forEach((s, i) => {
      const label = s?.title || s?.name || s?.heading;
      if (typeof label === "string" && label.trim()) {
        const id = `section-${i}-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40)}`;
        items.push({ id, label });
      }
    });
    return items;
  })();
  const showToc = tocItems.length >= 4;

  return (
    <div className="min-h-screen" style={{ background: "#0b0b10", color: "#fff" }}>
      <PageHead
        title={seo.title || page.title}
        description={seo.description || content?.intro || ""}
        url={pageUrl}
        image={seo.og_image}
        publishedAt={page.published_at || page.created_at || ""}
        updatedAt={page.updated_at || ""}
        authorName={settings?.author_name}
      />
      <Nav />
      <div className="flex gap-8 mx-auto px-6 lg:px-14 pt-32 pb-24" style={{ maxWidth: 1240 }}>
        <SiloSidebar
          nicheId={page.niche.id}
          nicheName={page.niche.name}
          currentPageId={page.id}
          contentSchemaId={page.schema.id}
        />
      <article
        id="main-content"
        className="flex-1 min-w-0 mx-auto"
        style={{
          maxWidth: 800,
          background: "#14141b",
          border: "1px solid rgba(255,255,255,0.06)",
          padding: "40px clamp(20px, 4vw, 48px)",
        }}
      >
        <StructuredData
          pageType="generated"
          title={page.title}
          description={((page.seo_meta as any)?.description) || content?.intro || ""}
          url={`${settings?.site_url || ""}/resources/${contentType}/${pageSlug}`}
          publishedAt={page.published_at || page.created_at || ""}
          updatedAt={page.updated_at || ""}
          breadcrumbs={[
            { name: "Home", url: settings?.site_url || "/" },
            { name: "Resources", url: `${settings?.site_url || ""}/resources` },
            { name: page.schema.name, url: `${settings?.site_url || ""}/resources/${contentType}` },
            { name: page.title, url: `${settings?.site_url || ""}/resources/${contentType}/${pageSlug}` },
          ]}
          faqs={faqs}
          itemListNames={itemListNames}
          siteSettings={settings}
        />
        <Breadcrumbs items={[
          { label: "Home", href: "/" },
          { label: "Resources", href: "/resources" },
          { label: page.schema.name, href: `/resources/${contentType}` },
          { label: page.niche.name },
        ]} />

        <PillarBanner nicheId={page.niche.id} />

        {page.status !== "published" && (
          <div className="mb-6 px-4 py-2 font-body text-sm" style={{ background: "rgba(212,175,85,0.12)", border: "1px solid rgba(212,175,85,0.3)", color: "#D4AF55" }}>
            ⚠ This page is in <strong>{page.status}</strong> mode and is only visible to admins.
          </div>
        )}

        <h1 className="font-display italic mb-6" style={{ fontSize: "clamp(2rem, 5vw, 3rem)", lineHeight: 1.15 }}>{page.title}</h1>

        <div className="flex items-center gap-4 flex-wrap mb-2" style={{ fontSize: 13, color: "rgba(255,255,255,0.75)" }}>
          {settings?.author_name && <span className="font-body">By {settings.author_name}</span>}
          <span className="font-body flex items-center gap-1"><Clock size={12} /> {rt} min read</span>
          {page.last_refreshed && (
            <span className="font-body flex items-center gap-1">
              <Calendar size={12} /> Last verified {new Date(page.last_refreshed).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
            </span>
          )}
        </div>
        <p className="font-body mb-6" style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", fontStyle: "italic" }}>
          {(() => {
            const d = new Date(page.last_refreshed || page.created_at || Date.now());
            return `Researched with live web data, reviewed against ${d.toLocaleString("en-US", { month: "long" })} ${d.getFullYear()} sources.`;
          })()}
        </p>


        <div className="flex items-center gap-3 mb-10">
          {[
            { icon: Linkedin, href: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl)}` },
            { icon: Twitter, href: `https://twitter.com/intent/tweet?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(page.title)}` },
            { icon: Facebook, href: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}` },
          ].map(({ icon: Icon, href }, i) => (
            <a key={i} href={href} target="_blank" rel="noopener noreferrer" className="p-2 transition-colors hover:text-[#D4AF55]" style={{ color: "rgba(255,255,255,0.3)", border: "1px solid rgba(255,255,255,0.08)" }}>
              <Icon size={14} />
            </a>
          ))}
          <button onClick={handleCopyLink} className="p-2 transition-colors hover:text-[#D4AF55] font-body flex items-center gap-1" style={{ color: "rgba(255,255,255,0.3)", border: "1px solid rgba(255,255,255,0.08)", fontSize: 11, cursor: "pointer", background: "none" }}>
            <Link2 size={14} /> {copied ? "Copied!" : "Copy"}
          </button>
        </div>

        {content?.intro && (
          <div className="answer-block mb-8 p-6" style={{ borderLeft: "3px solid #D4AF55", background: "rgba(212,175,85,0.06)" }}>
            <p className="font-body" style={{ fontSize: 18, color: "rgba(255,255,255,0.92)", lineHeight: 1.75 }}>{content.intro}</p>
          </div>
        )}

        {content?.hero_image && typeof content.hero_image === "string" && (
          <figure className="mb-10" style={{ margin: "0 0 40px" }}>
            <img
              src={content.hero_image}
              alt={typeof content.hero_image_alt === "string" ? content.hero_image_alt : page.title}
              loading="lazy"
              style={{ width: "100%", height: "auto", display: "block", border: "1px solid rgba(255,255,255,0.06)" }}
            />
          </figure>
        )}

        {content?.expert_callout?.quote && (
          <aside
            className="mb-10 p-6"
            style={{ borderLeft: "3px solid #D4AF55", background: "rgba(212,175,85,0.05)" }}
          >
            <p className="font-body uppercase" style={{ fontSize: 10, letterSpacing: "0.18em", color: "#D4AF55", marginBottom: 10 }}>
              From the trenches
            </p>
            <p className="font-body" style={{ fontSize: 16, color: "rgba(255,255,255,0.9)", lineHeight: 1.7, fontStyle: "italic" }}>
              {content.expert_callout.quote}
            </p>
            {settings?.author_name && (
              <p className="font-body mt-3" style={{ fontSize: 12, color: "rgba(255,255,255,0.55)" }}>
                — {settings.author_name}
              </p>
            )}
          </aside>
        )}

        {Renderer && <Renderer contentJson={content} nicheName={page.niche.name} pageId={page.id} />}

        <PublicCTA variant="inline" nicheSlug={page.niche.slug} contentTypeSlug={contentType} nicheName={page.niche.name} pageId={page.id} pageType="generated" />

        <SourcesSection sources={content?.sources} />

        {faqs && Array.isArray(faqs) && faqs.length > 0 && (
          <div className="mt-16">
            <h2 className="font-display italic mb-8" style={{ fontSize: 24 }}>Frequently Asked Questions</h2>
            <FAQAccordion faqs={faqs} pageId={page.id} />
          </div>
        )}

        <AuthorBox settings={settings} lastVerified={page.last_refreshed || page.created_at} />

        <div className="mt-16 p-8 text-center" style={{ border: "1px solid rgba(255,255,255,0.06)" }}>
          <p className="font-body mb-4" style={{ fontSize: 15, color: "rgba(255,255,255,0.5)" }}>Was this helpful?</p>
          <div className="flex items-center justify-center gap-4">
            <button onClick={() => handleFeedback("up")} disabled={!!feedback} className="p-3 transition-all" style={{ border: "1px solid", borderColor: feedback === "up" ? "#D4AF55" : "rgba(255,255,255,0.1)", color: feedback === "up" ? "#D4AF55" : "rgba(255,255,255,0.4)", background: feedback === "up" ? "rgba(212,175,85,0.08)" : "transparent", cursor: feedback ? "default" : "pointer" }}>
              <ThumbsUp size={18} />
            </button>
            <button onClick={() => handleFeedback("down")} disabled={!!feedback} className="p-3 transition-all" style={{ border: "1px solid", borderColor: feedback === "down" ? "#D4AF55" : "rgba(255,255,255,0.1)", color: feedback === "down" ? "#D4AF55" : "rgba(255,255,255,0.4)", background: feedback === "down" ? "rgba(212,175,85,0.08)" : "transparent", cursor: feedback ? "default" : "pointer" }}>
              <ThumbsDown size={18} />
            </button>
          </div>
          {feedback && <p className="font-body mt-3" style={{ fontSize: 12, color: "#D4AF55" }}>Thanks for your feedback!</p>}
        </div>

        <WidgetRenderer zone="page" />

        <RelatedResources
          currentPageId={page.id}
          nicheId={page.niche.id}
          nicheName={page.niche.name}
          nicheContext={page.niche.context}
          contentSchemaId={page.schema.id}
          contentTypeName={page.schema.name}
        />

        <PublicCTA variant="end" nicheSlug={page.niche.slug} contentTypeSlug={contentType} nicheName={page.niche.name} pageId={page.id} pageType="generated" />
      </article>

      {showToc && <StickyTOC items={tocItems} />}
      </div>

      <Footer />
      <PublicCTA variant="sticky" nicheSlug={page.niche.slug} contentTypeSlug={contentType} nicheName={page.niche.name} pageId={page.id} pageType="generated" />
    </div>
  );
};

const StickyTOC = ({ items }: { items: { id: string; label: string }[] }) => {
  const scrollToLabel = (label: string) => {
    if (typeof document === "undefined") return;
    // Find first h2/h3 whose text matches label
    const headings = Array.from(document.querySelectorAll<HTMLElement>("article h2, article h3"));
    const target = headings.find(
      (h) => h.textContent?.trim().toLowerCase() === label.toLowerCase()
    );
    if (target) {
      const y = target.getBoundingClientRect().top + window.scrollY - 100;
      window.scrollTo({ top: y, behavior: "smooth" });
    }
  };
  return (
    <aside
      className="hidden xl:block"
      style={{
        position: "sticky",
        top: 100,
        width: 200,
        flexShrink: 0,
        alignSelf: "flex-start",
      }}
    >
      <span
        className="font-body uppercase block"
        style={{ fontSize: 10, letterSpacing: "0.18em", color: "#D4AF55", marginBottom: 14 }}
      >
        On this page
      </span>
      <ul style={{ display: "flex", flexDirection: "column", gap: 8, borderLeft: "1px solid rgba(255,255,255,0.08)", paddingLeft: 12 }}>
        {items.map((it) => (
          <li key={it.id}>
            <button
              onClick={() => scrollToLabel(it.label)}
              className="font-body text-left transition-colors"
              style={{
                fontSize: 12,
                lineHeight: 1.45,
                color: "rgba(255,255,255,0.75)",
                background: "none",
                border: "none",
                padding: 0,
                cursor: "pointer",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = "#D4AF55")}
              onMouseLeave={(e) => (e.currentTarget.style.color = "rgba(255,255,255,0.75)")}
            >
              {it.label}
            </button>
          </li>
        ))}
      </ul>
    </aside>
  );
};

const FAQAccordion = ({ faqs, pageId }: { faqs: any[]; pageId: string }) => {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <div className="flex flex-col">
      {faqs.map((faq, i) => {
        const isOpen = open === i;
        return (
          <div key={i} style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
            <button
              onClick={() => { const newOpen = isOpen ? null : i; setOpen(newOpen); if (newOpen !== null) { supabase.from("page_engagement").insert({ page_id: pageId, event_type: "faq_click", metadata: { index: i } }).then(() => {}, () => {}); } }}
              className="w-full text-left py-5 font-body flex items-center justify-between"
              aria-expanded={isOpen}
              style={{ background: "none", border: "none", cursor: "pointer", color: isOpen ? "#D4AF55" : "rgba(255,255,255,0.7)", fontSize: 15, fontWeight: 500 }}
            >
              {faq.question}
              <span style={{ fontSize: 18, marginLeft: 12 }}>{isOpen ? "−" : "+"}</span>
            </button>
            {/*
              Always render the answer in the DOM so crawlers see the text that
              FAQPage JSON-LD claims. Collapse visually when closed.
            */}
            <div
              hidden={!isOpen}
              style={
                isOpen
                  ? undefined
                  : {
                      // hidden attribute already sets display:none; belt-and-braces
                      // in case a global style overrides it.
                      display: "none",
                    }
              }
            >
              <p className="faq-answer font-body pb-5" style={{ fontSize: 14, color: "rgba(255,255,255,0.45)", lineHeight: 1.7 }}>{faq.answer}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
};

const SourcesSection = ({ sources }: { sources: any }) => {
  if (!Array.isArray(sources) || sources.length === 0) return null;
  const items = sources
    .filter((s) => s && typeof s.url === "string" && /^https?:\/\//i.test(s.url))
    .slice(0, 8);
  if (!items.length) return null;
  return (
    <div className="mt-16">
      <h2 className="font-display italic mb-6" style={{ fontSize: 22 }}>Sources</h2>
      <ul className="font-body" style={{ fontSize: 13, color: "rgba(255,255,255,0.55)", lineHeight: 1.8, listStyle: "disc", paddingLeft: "1.25rem" }}>
        {items.map((s, i) => (
          <li key={i}>
            <a href={s.url} target="_blank" rel="noopener" style={{ color: "#D4AF55", wordBreak: "break-word" }}>
              {s.title || s.url}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
};

const AuthorBox = ({ settings, lastVerified }: { settings: any; lastVerified?: string | null }) => {
  if (!settings?.author_name && !settings?.author_bio) return null;
  const social = Object.entries(settings.author_social_links ?? {}).filter(
    ([, v]) => typeof v === "string" && v,
  ) as [string, string][];
  const creds: string[] = Array.isArray(settings.author_credentials) ? settings.author_credentials : [];
  return (
    <aside className="mt-16 p-6" style={{ border: "1px solid rgba(255,255,255,0.08)", background: "rgba(212,175,85,0.02)" }}>
      <h2 className="font-display italic mb-4" style={{ fontSize: 20 }}>About the author</h2>
      <p className="font-body mb-2" style={{ fontSize: 14, color: "rgba(255,255,255,0.85)" }}>
        <strong>{settings.author_name}</strong>
        {settings.author_title ? `, ${settings.author_title}` : ""}
      </p>
      {settings.author_bio && (
        <p className="font-body mb-3" style={{ fontSize: 14, color: "rgba(255,255,255,0.6)", lineHeight: 1.7 }}>
          {settings.author_bio}
        </p>
      )}
      {creds.length > 0 && (
        <p className="font-body mb-3" style={{ fontSize: 12, color: "rgba(255,255,255,0.45)" }}>
          <strong style={{ color: "rgba(255,255,255,0.65)" }}>Credentials:</strong> {creds.join(", ")}
        </p>
      )}
      {social.length > 0 && (
        <p className="font-body" style={{ fontSize: 12 }}>
          {social.map(([k, v], i) => (
            <span key={k}>
              {i > 0 && <span style={{ color: "rgba(255,255,255,0.25)" }}> · </span>}
              <a href={v} target="_blank" rel="noopener" style={{ color: "#D4AF55" }}>
                {k}
              </a>
            </span>
          ))}
        </p>
      )}
      {lastVerified && (
        <p className="font-body mt-4" style={{ fontSize: 11, color: "rgba(255,255,255,0.35)" }}>
          Last verified{" "}
          {new Date(lastVerified).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
        </p>
      )}
    </aside>
  );
};

export default GeneratedPage;
