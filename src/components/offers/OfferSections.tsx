import OfferBody from "./OfferBody";
import { Check, ChevronDown } from "lucide-react";
import {
  hasOfferSectionContent,
  offerFaqLayout,
  offerListLayout,
} from "@/lib/offerSectionLayout";
import OfferBodyImage from "@/components/OfferBodyImage";
import { offerVideoEmbed, type OfferSection } from "@/lib/offerBuilder";

export default function OfferSections({
  sections,
  fallback = "",
  onAction,
  actionLabel = "Continue",
  preview = false,
}: {
  sections: OfferSection[];
  fallback?: string;
  onAction?: () => void;
  actionLabel?: string;
  preview?: boolean;
}) {
  if (!sections.length) return <OfferBody body={fallback} />;
  return (
    <div className="space-y-10">
      {!sections.some(hasOfferSectionContent) && <OfferBody body={fallback} />}
      {sections
        .filter(
          (section) =>
            hasOfferSectionContent(section) || section.type === "cta",
        )
        .map((section) => {
          const heading = section.heading && (
            <h2 className="font-display text-3xl leading-tight text-white">
              {section.heading}
            </h2>
          );
          if (section.type === "image")
            return section.imageUrl ? (
              <section key={section.id} className="space-y-5">
                {heading}
                <OfferBodyImage
                  src={section.imageUrl}
                  alt={
                    section.body || section.heading || "Product demonstration"
                  }
                  caption={section.caption || undefined}
                />
              </section>
            ) : null;
          if (section.type === "video") {
            const embed = offerVideoEmbed(section.imageUrl);
            return section.imageUrl ? (
              <section key={section.id} className="space-y-5">
                {heading}
                {embed && !preview ? (
                  <iframe
                    title={section.heading || "Product walkthrough"}
                    src={embed}
                    className="aspect-video w-full rounded-xl border border-white/15"
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    allow="fullscreen; picture-in-picture"
                    sandbox="allow-scripts allow-same-origin allow-presentation"
                    allowFullScreen
                  />
                ) : (
                  <div className="rounded-xl border border-white/15 bg-white/5 p-8 text-center">
                    <p className="text-white/80">
                      {preview
                        ? "Video preview — opens on the published page"
                        : "Watch the walkthrough"}
                    </p>
                    {!preview && (
                      <a
                        href={section.imageUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-3 inline-block text-[var(--brand-accent)] underline"
                      >
                        Open video
                      </a>
                    )}
                  </div>
                )}
                {section.caption && (
                  <p className="text-sm leading-relaxed text-white/65">
                    {section.caption}
                  </p>
                )}
                {section.body && <OfferBody body={section.body} />}
              </section>
            ) : null;
          }
          if (["benefits", "deliverables", "method"].includes(section.type)) {
            const layout = offerListLayout(section.body);
            if (layout) {
              const List = section.type === "method" ? "ol" : "ul";
              return (
                <section key={section.id} className="space-y-5">
                  {heading}
                  {layout.introduction && (
                    <OfferBody body={layout.introduction} />
                  )}
                  <List
                    className={`grid gap-3 ${section.type === "method" ? "" : "@xl:grid-cols-2"}`}
                  >
                    {layout.items.map((item, index) => (
                      <li
                        key={index}
                        className="flex min-w-0 items-start gap-3 rounded-xl border border-white/15 bg-white/[0.035] p-5 text-white/85 leading-relaxed"
                      >
                        {section.type === "method" ? (
                          <span
                            aria-hidden="true"
                            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--brand-accent)] text-sm font-bold text-[var(--brand-backdrop)]"
                          >
                            {index + 1}
                          </span>
                        ) : (
                          <Check
                            aria-hidden="true"
                            size={20}
                            className="mt-1 shrink-0 text-[var(--brand-accent)]"
                          />
                        )}
                        <span>{item}</span>
                      </li>
                    ))}
                  </List>
                </section>
              );
            }
          }
          if (section.type === "faq") {
            const questions = offerFaqLayout(section.body);
            if (questions)
              return (
                <section key={section.id} className="space-y-5">
                  {heading}
                  <div className="divide-y divide-white/15 rounded-xl border border-white/15 px-5">
                    {questions.map((item, index) => (
                      <details
                        key={index}
                        className="group py-5"
                        open={index === 0}
                      >
                        <summary className="flex cursor-pointer list-none items-start justify-between gap-4 font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 [&::-webkit-details-marker]:hidden">
                          {item.question}
                          <ChevronDown
                            aria-hidden="true"
                            size={18}
                            className="mt-1 shrink-0 transition-transform group-open:rotate-180"
                          />
                        </summary>
                        <div className="pt-4">
                          <OfferBody body={item.answer} />
                        </div>
                      </details>
                    ))}
                  </div>
                </section>
              );
          }
          if (section.type === "proof")
            return (
              <section key={section.id} className="space-y-5">
                {heading}
                <figure className="border-l-2 border-[var(--brand-accent)] bg-white/[0.035] p-6">
                  <blockquote className="whitespace-pre-line text-lg leading-relaxed text-white/90">
                    {section.body}
                  </blockquote>
                  {section.caption && (
                    <figcaption className="mt-4 text-sm text-[var(--brand-accent)]">
                      {section.caption}
                    </figcaption>
                  )}
                </figure>
              </section>
            );
          return (
            <section key={section.id} className="space-y-5">
              {heading}
              {section.body && <OfferBody body={section.body} />}
              {section.caption && (
                <p className="text-sm text-[var(--brand-accent)]">
                  {section.caption}
                </p>
              )}
              {section.type === "cta" && (
                <button
                  type="button"
                  onClick={onAction}
                  disabled={preview || !onAction}
                  className="w-full @sm:w-auto rounded bg-[var(--brand-accent)] px-6 py-4 font-semibold text-[var(--brand-backdrop)] disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4"
                >
                  {actionLabel}
                </button>
              )}
            </section>
          );
        })}
    </div>
  );
}
