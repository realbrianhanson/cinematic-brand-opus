import { useId, useState } from "react";
import { FilePenLine } from "lucide-react";
import { type OfferBuilder, type OfferRecipeContext } from "@/lib/offerBuilder";
import { proposeOfferDraft, type OfferDraftStage } from "@/lib/offerDrafts";
import OfferPageDraftPreview from "./OfferPageDraftPreview";

const stageLabels = {
  landing: "Landing page",
  upsell: "Follow-up presentation",
};

export default function OfferDraftStarter({
  value,
  context,
  onApply,
  onEditBrief,
  initialStage = "landing",
  disabled = false,
}: {
  value: OfferBuilder;
  context: OfferRecipeContext;
  onApply: (builder: OfferBuilder, notice: string) => void;
  onEditBrief: () => void;
  initialStage?: OfferDraftStage;
  disabled?: boolean;
}) {
  const id = useId();
  const [selection, setSelection] = useState<{
    forStage: OfferDraftStage;
    stages: OfferDraftStage[];
  }>({ forStage: initialStage, stages: [initialStage] });
  const stages =
    selection.forStage === initialStage ? selection.stages : [initialStage];
  const [review, setReview] = useState<{
    snapshot: string;
    stages: OfferDraftStage[];
    proposal: ReturnType<typeof proposeOfferDraft>;
  } | null>(null);
  const external = context.offer.checkout_mode === "external";
  const selected = stages.filter((stage) => !external || stage === "landing");
  const snapshot = JSON.stringify({ value, context, stages: selected });
  const stale = Boolean(review && review.snapshot !== snapshot);
  const ready = Boolean(
    context.offer.title.trim() || context.strategy.outcome.trim(),
  );
  const apply = () => {
    if (!review || stale || disabled || !review.proposal.changes.length) return;
    onApply(
      review.proposal.builder,
      "First draft added to the selected pages in your working copy. Your existing copy, proof and media were kept. Review the page, complete any empty sections, then save your draft.",
    );
    setReview(null);
  };
  return (
    <section
      aria-labelledby={`${id}-title`}
      className="admin-card space-y-5 p-5 md:p-6"
    >
      <div>
        <p className="admin-eyebrow flex items-center gap-2">
          <FilePenLine size={16} aria-hidden="true" /> Start with your offer
        </p>
        <h2 id={`${id}-title`} className="text-xl font-semibold">
          Build my first draft
        </h2>
        <p className="admin-help mt-2">
          Turn the facts in your brief into editable page copy and sections.
          Review every addition before applying it.
        </p>
      </div>
      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        {(
          [
            ["Your offer", context.offer.title],
            ["Useful outcome", context.strategy.outcome],
            ["How it works", context.strategy.mechanism],
            ["What is included", context.strategy.deliverables],
          ] as const
        ).map(([label, text]) => (
          <div
            key={label}
            className="min-w-0 rounded-lg border border-current/10 p-3"
          >
            <dt className="font-medium">{label}</dt>
            <dd className="mt-1 line-clamp-3 whitespace-pre-line break-words opacity-70">
              {text.trim() || "Add this to your brief"}
            </dd>
          </div>
        ))}
      </dl>
      <button
        type="button"
        className="admin-btn-secondary"
        onClick={onEditBrief}
        disabled={disabled}
      >
        Edit my brief
      </button>
      <fieldset className="space-y-2" disabled={disabled}>
        <legend className="mb-2 text-sm font-medium">Pages to draft</legend>
        {(["landing", "upsell"] as const)
          .filter((stage) => !external || stage === "landing")
          .map((stage) => (
            <label key={stage} className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={selected.includes(stage)}
                onChange={(event) => {
                  setSelection({
                    forStage: initialStage,
                    stages: event.target.checked
                      ? [...stages, stage]
                      : stages.filter((item) => item !== stage),
                  });
                }}
                className="mt-1"
              />
              <span>
                {stageLabels[stage]}
                {stage === "upsell" && (
                  <span className="admin-help block">
                    For this same product when another offer presents it as an
                    optional next step.
                  </span>
                )}
              </span>
            </label>
          ))}
      </fieldset>
      <p className="admin-help">
        Fills empty fields and section copy. Keeps your existing edits,
        testimonials, media and other pages. Private evidence, objection notes
        and ad messages stay private. No AI credits are used.
      </p>
      {!ready && (
        <p className="admin-help">
          Add an offer name or useful outcome before building your draft.
        </p>
      )}
      <button
        type="button"
        className="admin-btn-primary"
        disabled={disabled || !ready || !selected.length}
        onClick={() =>
          setReview({
            snapshot,
            stages: selected,
            proposal: proposeOfferDraft(value, context, selected),
          })
        }
      >
        {review ? "Refresh draft preview" : "Preview my first draft"}
      </button>
      {review && (
        <div className="space-y-4 border-t border-current/10 pt-5">
          <h3 className="font-semibold">Review your first draft</h3>
          {stale && (
            <p role="status" className="admin-help">
              Your brief, page or selection changed. Refresh the preview before
              applying it.
            </p>
          )}
          <p className="admin-help">
            {review.proposal.changes.length
              ? `${review.proposal.changes.length} additions or updates to empty fields. Nothing is saved or published yet.`
              : "Your selected pages already contain these fields and sections. No changes are needed."}
          </p>
          {review.proposal.omittedSections > 0 && (
            <p className="admin-help">
              {review.proposal.omittedSections} sections could not be added
              because a page has reached its 30-section limit. All existing
              sections are kept.
            </p>
          )}
          <details className="rounded-lg border border-current/10 p-3">
            <summary className="cursor-pointer text-sm font-medium">
              See exactly what will be added
            </summary>
            <ul className="mt-3 space-y-3 text-sm">
              {review.proposal.changes.map((change, index) => (
                <li key={index}>
                  <strong>
                    {stageLabels[change.stage]} · {change.label}
                  </strong>
                  <p className="mt-1 whitespace-pre-line break-words opacity-70">
                    {change.after}
                  </p>
                </li>
              ))}
            </ul>
          </details>
          {review.stages.map((stage) => (
            <div key={stage} className="space-y-2">
              <h4 className="text-sm font-medium">
                {stageLabels[stage]} preview
              </h4>
              <OfferPageDraftPreview
                page={review.proposal.builder.presentation[stage]}
              />
            </div>
          ))}
          <p className="admin-help">
            Preview actions are disabled. Add approved proof and verified FAQ
            answers yourself; empty sections do not appear in the preview.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="admin-btn-primary"
              disabled={disabled || stale || !review.proposal.changes.length}
              onClick={apply}
            >
              Apply draft to selected pages
            </button>
            <button
              type="button"
              className="admin-btn-secondary"
              onClick={() => setReview(null)}
            >
              Close draft preview
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
