import { useEffect, useMemo, useRef, useState } from "react";
import PageHead from "@/components/PageHead";
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
  const { contentType, nicheSlug } = useParams<{ contentType: string; nicheSlug: string }>();
  const viewCounted = useRef(false);
  const [copied, setCopied] = useState(false);
  const [feedback, setFeedback] = useState<"up" | "down" | null>(null);

  const { data: page } = useQuery({
    queryKey: ["public-gen-page", contentType, nicheSlug],
    queryFn: async () => {
      const { data: schema } = await supabase.from("content_schemas").select("id, name, slug, renderer_component").eq("slug", contentType!).maybeSingle();
      if (!schema) return null;
      const { data: niche } = await supabase.from("niches").select("id, name, slug, context").eq("slug", nicheSlug!).maybeSingle();
      if (!niche) return null;
      const { data: pg } = await supabase
        .from("generated_pages").select("*")
        .eq("content_schema_id", schema.id).eq("niche_id", niche.id).eq("status", "published").maybeSingle();
      if (!pg) return null;
      return { ...pg, schema, niche };
    },
    enabled: !!contentType && !!nicheSlug,
  });

  const { data: settings } = useQuery({
    queryKey: ["public-site-settings"],
    queryFn: async () => {
      const { data } = await supabase.from("site_settings").select("*").limit(1).maybeSingle();
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
  const pageUrl = `${settings?.site_url || ""}/resources/${contentType}/${nicheSlug}`;

  const content = page?.content_json as any;
  const Renderer = page?.schema?.renderer_component ? renderers[page.schema.renderer_component] : null;
  const faqs = content?.frequently_asked_questions;
  const rt = content ? readingTime(content) : 1;
  const shareUrl = typeof window !== "undefined" ? window.location.href : "";

  const logEngagement = async (eventType: string, metadata: any = {}) => {
    if (!page?.id) return;
    await supabase.from("page_engagement").insert({ page_id: page.id, event_type: eventType, metadata });
  };

  const handleCopyLink = () => { navigator.clipboard.writeText(shareUrl); setCopied(true); setTimeout(() => setCopied(false), 2000); };
  const handleFeedback = (type: "up" | "down") => { if (feedback) return; setFeedback(type); logEngagement("feedback", { type }); };

  if (!page) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#07070E" }}>
        <p className="font-body" style={{ color: "rgba(255,255,255,0.3)" }}>Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: "#07070E", color: "#fff" }}>
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
      <div className="flex gap-8 mx-auto px-6 lg:px-14 pt-32 pb-24" style={{ maxWidth: 1140 }}>
        <SiloSidebar
          nicheId={page.niche.id}
          nicheName={page.niche.name}
          currentPageId={page.id}
          contentSchemaId={page.schema.id}
        />
      <article id="main-content" className="flex-1 min-w-0" style={{ maxWidth: 900 }}>
        <StructuredData
          pageType="generated"
          title={page.title}
          description={((page.seo_meta as any)?.description) || content?.intro || ""}
          url={`${settings?.site_url || ""}/resources/${contentType}/${nicheSlug}`}
          publishedAt={page.published_at || page.created_at || ""}
          updatedAt={page.updated_at || ""}
          breadcrumbs={[
            { name: "Home", url: settings?.site_url || "/" },
            { name: "Resources", url: `${settings?.site_url || ""}/resources` },
            { name: page.schema.name, url: `${settings?.site_url || ""}/resources/${contentType}` },
            { name: page.niche.name, url: `${settings?.site_url || ""}/resources/${contentType}/${nicheSlug}` },
          ]}
          faqs={faqs}
          siteSettings={settings}
        />
        <Breadcrumbs items={[
          { label: "Home", href: "/" },
          { label: "Resources", href: "/resources" },
          { label: page.schema.name, href: `/resources/${contentType}` },
          { label: page.niche.name },
        ]} />

        <PillarBanner nicheId={page.niche.id} />

        <h1 className="font-display italic mb-6" style={{ fontSize: "clamp(2rem, 5vw, 3rem)", lineHeight: 1.15 }}>{page.title}</h1>

        <div className="flex items-center gap-4 flex-wrap mb-6" style={{ fontSize: 11, color: "rgba(255,255,255,0.3)" }}>
          {settings?.author_name && <span className="font-body">By {settings.author_name}</span>}
          <span className="font-body flex items-center gap-1"><Clock size={11} /> {rt} min read</span>
          {page.last_refreshed && (
            <span className="font-body flex items-center gap-1">
              <Calendar size={11} /> Updated {new Date(page.last_refreshed).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
            </span>
          )}
        </div>

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
          <div className="answer-block mb-12 p-6" style={{ borderLeft: "3px solid #D4AF55", background: "rgba(212,175,85,0.04)" }}>
            <p className="font-body" style={{ fontSize: 17, color: "rgba(255,255,255,0.7)", lineHeight: 1.8 }}>{content.intro}</p>
          </div>
        )}

        {Renderer && <Renderer contentJson={content} nicheName={page.niche.name} pageId={page.id} />}

        <PublicCTA variant="inline" nicheSlug={nicheSlug} contentTypeSlug={contentType} nicheName={page.niche.name} pageId={page.id} pageType="generated" />

        {faqs && Array.isArray(faqs) && faqs.length > 0 && (
          <div className="mt-16">
            <h2 className="font-display italic mb-8" style={{ fontSize: 24 }}>Frequently Asked Questions</h2>
            <FAQAccordion faqs={faqs} pageId={page.id} />
          </div>
        )}

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

        <PublicCTA variant="end" nicheSlug={nicheSlug} contentTypeSlug={contentType} nicheName={page.niche.name} pageId={page.id} pageType="generated" />
      </article>
      </div>

      <PublicCTA variant="sticky" nicheSlug={nicheSlug} contentTypeSlug={contentType} nicheName={page.niche.name} pageId={page.id} pageType="generated" />
    </div>
  );
};

const FAQAccordion = ({ faqs, pageId }: { faqs: any[]; pageId: string }) => {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <div className="flex flex-col">
      {faqs.map((faq, i) => (
        <div key={i} style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          <button
            onClick={() => { setOpen(open === i ? null : i); supabase.from("page_engagement").insert({ page_id: pageId, event_type: "faq_click", metadata: { index: i } }).then(() => {}); }}
            className="w-full text-left py-5 font-body flex items-center justify-between"
            style={{ background: "none", border: "none", cursor: "pointer", color: open === i ? "#D4AF55" : "rgba(255,255,255,0.7)", fontSize: 15, fontWeight: 500 }}
          >
            {faq.question}
            <span style={{ fontSize: 18, marginLeft: 12 }}>{open === i ? "−" : "+"}</span>
          </button>
          {open === i && (
            <p className="faq-answer font-body pb-5" style={{ fontSize: 14, color: "rgba(255,255,255,0.45)", lineHeight: 1.7 }}>{faq.answer}</p>
          )}
        </div>
      ))}
    </div>
  );
};

export default GeneratedPage;
