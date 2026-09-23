import OfferBody from "./OfferBody";
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
      {sections.map((section) => {
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
                alt={section.body || section.heading || "Product demonstration"}
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
            {section.type === "cta" && (
              <button
                type="button"
                onClick={onAction}
                disabled={preview || !onAction}
                className="rounded bg-[var(--brand-accent)] px-6 py-4 font-semibold text-[var(--brand-backdrop)] disabled:opacity-60"
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
