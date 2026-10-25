import { useEffect, useId, useRef, useState } from "react";
import { LayoutTemplate } from "lucide-react";
import {
  sectionLabels,
  type OfferPage,
  type OfferRecipeContext,
} from "@/lib/offerBuilder";
import {
  offerTemplates,
  offerTemplateExample,
  proposeOfferTemplate,
  type OfferTemplateId,
} from "@/lib/offerTemplates";
import OfferPageDraftPreview from "./OfferPageDraftPreview";

export default function OfferTemplatePicker({
  value,
  context,
  stage,
  onApply,
  disabled = false,
}: {
  value: OfferPage;
  context: OfferRecipeContext;
  stage: "landing" | "upsell";
  onApply: (page: OfferPage, notice: string) => void;
  disabled?: boolean;
}) {
  const id = useId();
  const previewHeading = useRef<HTMLHeadingElement>(null);
  const [example, setExample] = useState<OfferTemplateId | null>(null);
  const [review, setReview] = useState<{
    id: OfferTemplateId;
    snapshot: string;
    proposal: ReturnType<typeof proposeOfferTemplate>;
  } | null>(null);
  const snapshot = JSON.stringify({ value, context, stage });
  const stale = Boolean(review && review.snapshot !== snapshot);
  const selected = offerTemplates.find(
    (item) => item.id === (review?.id || example),
  );
  useEffect(() => {
    if (!example && !review) return;
    previewHeading.current?.focus({ preventScroll: true });
    previewHeading.current?.scrollIntoView?.({ block: "start" });
  }, [example, review]);
  const propose = (templateId: OfferTemplateId) => {
    if (disabled) return;
    setExample(null);
    setReview({
      id: templateId,
      snapshot,
      proposal: proposeOfferTemplate(value, templateId, context),
    });
  };
  return (
    <section
      aria-labelledby={`${id}-title`}
      className="admin-card space-y-5 p-5 md:p-6"
    >
      <div>
        <p className="admin-eyebrow flex items-center gap-2">
          <LayoutTemplate size={16} aria-hidden="true" /> Choose the shape of
          your page
        </p>
        <h2 id={`${id}-title`} className="text-xl font-semibold">
          Start with a visual layout
        </h2>
        <p className="admin-help mt-2">
          Choose an arrangement for this{" "}
          {stage === "landing" ? "landing page" : "follow-up presentation"}.
          Your site colors and type stay consistent. These examples show sample
          copy; your layout uses your own offer facts.
        </p>
      </div>
      <div className="grid gap-4">
        {offerTemplates.map((template) => (
          <article
            key={template.id}
            className="min-w-0 space-y-3 rounded-xl border border-current/15 p-3"
          >
            <OfferPageDraftPreview
              page={offerTemplateExample(template.id)}
              thumbnail
            />
            <p className="admin-eyebrow">{template.label}</p>
            <h3 className="font-semibold">{template.title}</h3>
            <p className="admin-help">{template.description}</p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="admin-btn-secondary"
                aria-label={`Preview ${template.title}`}
                onClick={() => {
                  setReview(null);
                  setExample(template.id);
                }}
              >
                Preview
              </button>
              <button
                type="button"
                className="admin-btn-primary"
                aria-label={`Use layout ${template.title}`}
                disabled={disabled}
                onClick={() => propose(template.id)}
              >
                Use layout
              </button>
            </div>
          </article>
        ))}
      </div>
      {selected && (
        <div className="space-y-4 border-t border-current/10 pt-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 ref={previewHeading} tabIndex={-1} className="font-semibold">
              {review ? "Review your layout" : "Example preview"} ·{" "}
              {selected.title}
            </h3>
            <button
              type="button"
              className="admin-btn-secondary"
              onClick={() => {
                setReview(null);
                setExample(null);
              }}
            >
              Close layout preview
            </button>
          </div>
          <p className="admin-help">
            {review
              ? "Your copy, testimonials and media are kept. Existing sections move into this layout's order; extra sections stay before the final action. Empty fields use facts from your brief. Review the changes below before applying."
              : "Sample copy only. This example is not added to your offer. The public section renderer shows benefit cards, numbered steps and expandable questions as they will appear on your page."}
          </p>
          {stale && (
            <p role="status" className="admin-help">
              Your page or brief changed. Refresh this layout before applying
              it.
            </p>
          )}
          <OfferPageDraftPreview
            page={review?.proposal.page || offerTemplateExample(selected.id)}
          />
          {review && (
            <>
              <details className="rounded-lg border border-current/10 p-3">
                <summary className="cursor-pointer text-sm font-medium">
                  Review section order
                </summary>
                <ol className="mt-3 list-inside list-decimal space-y-2 text-sm">
                  {review.proposal.page.sections.map((section) => (
                    <li key={section.id}>
                      {section.heading || sectionLabels[section.type]}
                      {!section.body.trim() &&
                        !section.imageUrl.trim() &&
                        section.type !== "cta" &&
                        " · add content"}
                    </li>
                  ))}
                </ol>
              </details>
              {review.proposal.omittedSections > 0 && (
                <p className="admin-help">
                  The 30-section limit prevented{" "}
                  {review.proposal.omittedSections} new sections. Existing
                  sections were kept.
                </p>
              )}
              <p className="admin-help">
                Changes only this page's working copy. Save the draft to keep
                it. Preview actions are disabled.
              </p>
            </>
          )}
          {review ? (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="admin-btn-primary"
                disabled={disabled || stale}
                onClick={() => {
                  if (disabled || stale) return;
                  onApply(
                    review.proposal.page,
                    `${selected.title} applied to your ${stage === "landing" ? "landing page" : "follow-up presentation"}. Existing copy, proof and media were kept. Review and save your draft.`,
                  );
                  setReview(null);
                }}
              >
                Apply layout to this page
              </button>
              {stale && (
                <button
                  type="button"
                  className="admin-btn-secondary"
                  disabled={disabled}
                  onClick={() => propose(selected.id)}
                >
                  Refresh layout preview
                </button>
              )}
            </div>
          ) : (
            <button
              type="button"
              className="admin-btn-primary"
              disabled={disabled}
              onClick={() => propose(selected.id)}
            >
              Use this layout with my offer
            </button>
          )}
        </div>
      )}
    </section>
  );
}
