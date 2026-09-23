import { useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { articleReading } from "@/lib/articleReading";

export interface EditorPreviewProps {
  title: string;
  content: string;
  excerpt: string;
  tldr?: string;
  featuredImage?: string;
  featuredImageAlt?: string;
  keyTakeaways?: string[];
  faqItems?: { question: string; answer: string }[];
  /** Saved slug, for the on-site preview link. Omit for unsaved articles. */
  savedSlug?: string;
  published?: boolean;
}

/**
 * Embeds get the site's 16:9 full-width sizing. The sanitizer strips inline
 * styles, so without this a YouTube player falls back to a 300x150 box.
 */
const EMBED_CLASSES =
  "[&_iframe]:block [&_iframe]:w-full [&_iframe]:max-w-full [&_iframe]:h-auto [&_iframe]:aspect-video [&_iframe]:border-0 [&_iframe]:my-4";

/**
 * Renders the working copy with the public article's pipeline: the same
 * sanitizer and heading handling (articleReading) and the same `.blog-content`
 * dark reading surface as src/pages/BlogPost.tsx.
 */
export function ArticlePreviewBody({
  title,
  content,
  excerpt,
  tldr,
  featuredImage,
  featuredImageAlt,
  keyTakeaways = [],
  faqItems = [],
  mobile = false,
}: EditorPreviewProps & { mobile?: boolean }) {
  const reading = articleReading(content, title);
  const takeaways = keyTakeaways.filter((t) => t.trim());
  const faqs = faqItems.filter((f) => f.question.trim() && f.answer.trim());
  return (
    <div
      data-testid="article-preview"
      className="mx-auto w-full rounded-lg"
      style={{
        background: "#0b0b10",
        color: "#fff",
        maxWidth: mobile ? 390 : 820,
        padding: mobile ? 16 : 32,
      }}
    >
      <h1
        className="font-display italic mb-6"
        style={{ fontSize: "clamp(2rem, 5vw, 3.5rem)", lineHeight: 1.15 }}
      >
        {title || "Untitled article"}
      </h1>
      {excerpt && (
        <p
          className="font-body mb-6"
          style={{ color: "rgba(255,255,255,0.7)" }}
        >
          {excerpt}
        </p>
      )}
      <div
        style={{
          background: "#14141b",
          border: "1px solid rgba(255,255,255,0.06)",
          padding: "clamp(16px, 4vw, 40px)",
        }}
      >
        {tldr && (
          <div
            className="answer-block mb-10 p-6"
            style={{
              borderLeft: "3px solid var(--brand-accent)",
              background: "rgba(var(--brand-accent-rgb),0.06)",
            }}
          >
            <span
              className="font-body uppercase block mb-2"
              style={{
                fontSize: 11,
                letterSpacing: "0.15em",
                color: "var(--brand-accent)",
              }}
            >
              TL;DR
            </span>
            <p
              className="font-body"
              style={{
                fontSize: 17,
                color: "rgba(255,255,255,0.92)",
                lineHeight: 1.7,
              }}
            >
              {tldr}
            </p>
          </div>
        )}
        {featuredImage && (
          <img
            src={featuredImage}
            alt={featuredImageAlt || title}
            className="w-full mb-10"
            style={{ maxHeight: 450, objectFit: "cover" }}
          />
        )}
        <div
          className={`blog-content font-body ${EMBED_CLASSES}`}
          style={{
            fontSize: mobile ? 16 : 17,
            lineHeight: mobile ? 1.8 : 1.85,
            color: "rgba(255,255,255,0.9)",
          }}
          dangerouslySetInnerHTML={{ __html: reading.html }}
        />
      </div>
      {takeaways.length > 0 && (
        <div
          className="mt-14 p-8"
          style={{
            border: "1px solid rgba(var(--brand-accent-rgb),0.15)",
            background: "rgba(var(--brand-accent-rgb),0.03)",
          }}
        >
          <h3
            className="font-display italic mb-5"
            style={{ fontSize: 22, color: "var(--brand-accent)" }}
          >
            Key Takeaways
          </h3>
          <ul className="flex flex-col gap-3">
            {takeaways.map((item, i) => (
              <li
                key={i}
                className="font-body flex items-start gap-3"
                style={{
                  fontSize: 14,
                  color: "rgba(255,255,255,0.55)",
                  lineHeight: 1.6,
                }}
              >
                <span style={{ color: "var(--brand-accent)", marginTop: 2 }}>
                  →
                </span>
                {item}
              </li>
            ))}
          </ul>
        </div>
      )}
      {faqs.length > 0 && (
        <div className="mt-14">
          <h3
            className="font-display italic mb-6"
            style={{ fontSize: 22, color: "#fff" }}
          >
            FAQ
          </h3>
          <div className="flex flex-col gap-6">
            {faqs.map((faq, i) => (
              <div
                key={i}
                className="pb-6"
                style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}
              >
                <h4
                  className="font-body font-semibold mb-2"
                  style={{ fontSize: 15, color: "rgba(255,255,255,0.8)" }}
                >
                  {faq.question}
                </h4>
                <p
                  className="faq-answer font-body"
                  style={{ fontSize: 14, color: "rgba(255,255,255,0.45)" }}
                >
                  {faq.answer}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function EditorPreview(props: EditorPreviewProps) {
  const [open, setOpen] = useState(false);
  const [mobile, setMobile] = useState(false);
  const { savedSlug, published } = props;
  return (
    <>
      <button className="admin-btn-ghost" onClick={() => setOpen(true)}>
        Preview
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-5xl max-h-[90dvh] overflow-auto">
          <DialogTitle>Article preview</DialogTitle>
          <div className="flex flex-wrap items-center gap-2">
            <button
              className="admin-btn-ghost"
              aria-pressed={!mobile}
              onClick={() => setMobile(false)}
            >
              Desktop
            </button>
            <button
              className="admin-btn-ghost"
              aria-pressed={mobile}
              onClick={() => setMobile(true)}
            >
              Mobile
            </button>
            {savedSlug && (
              <a
                className="admin-btn-ghost"
                href={`/blog/${encodeURIComponent(savedSlug)}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                {published ? "View live article" : "Preview on site"}
              </a>
            )}
          </div>
          <ArticlePreviewBody {...props} mobile={mobile} />
          <p className="text-xs">
            Shows your unsaved working copy with the site's article styles.
            {savedSlug
              ? " The on-site link shows the last saved version."
              : ""}{" "}
            Nothing changes on the site until you save.
          </p>
        </DialogContent>
      </Dialog>
    </>
  );
}
