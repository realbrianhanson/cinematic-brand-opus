import OfferSections from "@/components/offers/OfferSections";
import type { OfferPage } from "@/lib/offerBuilder";
import "@/styles/offer-template-gallery.css";

/** The same section renderer used on the public page, with actions disabled. */
export default function OfferPageDraftPreview({
  page,
  thumbnail = false,
}: {
  page: OfferPage;
  thumbnail?: boolean;
}) {
  return (
    <div
      className={`public-theme-preview offer-layout-preview ${thumbnail ? "offer-layout-thumbnail" : "offer-layout-full"}`}
      aria-hidden={thumbnail || undefined}
      inert={thumbnail || undefined}
    >
      <div className="public-site @container space-y-8 p-5 sm:p-8 [overflow-wrap:anywhere]">
        <header className="space-y-4">
          {page.eyebrow && (
            <p className="text-xs uppercase tracking-widest text-[var(--brand-accent)]">
              {page.eyebrow}
            </p>
          )}
          <h3 className="font-display text-3xl leading-tight text-white">
            {page.headline || "Your page headline"}
          </h3>
          {page.subheadline && (
            <p className="whitespace-pre-line text-white/75">
              {page.subheadline}
            </p>
          )}
          <button
            type="button"
            disabled
            className="rounded bg-[var(--brand-accent)] px-5 py-3 font-semibold text-[var(--brand-backdrop)]"
          >
            {page.ctaText || "Your next step"}
          </button>
          {page.ctaMicrocopy && (
            <p className="text-sm text-white/65">{page.ctaMicrocopy}</p>
          )}
        </header>
        <OfferSections
          sections={page.sections}
          actionLabel={page.ctaText || "Continue"}
          preview
        />
      </div>
    </div>
  );
}
