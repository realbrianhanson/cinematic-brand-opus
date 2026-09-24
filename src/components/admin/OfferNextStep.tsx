import { ArrowRight } from "lucide-react";
import { Link } from "@/lib/router-compat";
import type { Form } from "./offerEditorState";

type Choice = {
  id: string;
  title: string;
  status: string;
  next_offer_id: string | null;
};

/** Builder step 3: an optional follow-up after fulfillment. */
export default function OfferNextStep({
  active,
  form,
  external,
  savedId,
  choices,
  choicesPending,
  choicesError,
  previewError,
  nextChoice,
  qualifyingParents,
  onChange,
  onRetryChoices,
  onRetryPreview,
}: {
  active: boolean;
  form: Form;
  external: boolean;
  savedId: string;
  choices: Choice[] | undefined;
  choicesPending: boolean;
  choicesError: boolean;
  previewError: boolean;
  nextChoice: Choice | undefined;
  qualifyingParents: Choice[];
  onChange: (changes: Partial<Form>) => void;
  onRetryChoices: () => void;
  onRetryPreview: () => void;
}) {
  const update = <K extends keyof Form>(key: K, value: Form[K]) =>
    onChange({ [key]: value } as Partial<Form>);
  return (
    <div hidden={!active} className="space-y-6">
      {previewError && !external && form.nextOffer && (
        <p className="admin-notice">
          The selected follow-up preview could not be loaded.{" "}
          <button
            type="button"
            className="admin-btn-ghost"
            onClick={onRetryPreview}
          >
            Retry follow-up preview
          </button>
        </p>
      )}
      <section className="admin-card p-5 space-y-4">
        <p className="admin-eyebrow">03 · Next step</p>
        <h2 className="text-xl font-semibold">
          One useful result leads to the next
        </h2>
        <p className="admin-help">
          Offer the extra speed, implementation help or capability your buyer
          needs next.
        </p>
        <ol className="space-y-2 text-sm">
          <li className="rounded-lg bg-violet-500/10 p-3">
            1. {form.title || "Your offer"}
          </li>
          <li className="rounded-lg border border-current/10 p-3">
            2. Confirmation and access to the original purchase
          </li>
          <li className="rounded-lg border border-current/10 p-3">
            3.{" "}
            {nextChoice
              ? `${nextChoice.title} (${nextChoice.status})`
              : "Optional follow-up offer"}
          </li>
        </ol>
        <p className="admin-help">
          Accept opens the follow-up checkout. Decline keeps the original
          download available.
        </p>
      </section>
      {external ? (
        <p className="admin-notice">
          The destination website handles the next step for external offers.
        </p>
      ) : (
        <>
          <section className="admin-card p-5 md:p-6 space-y-5">
            <h2 className="text-lg font-semibold">
              Offer a relevant next step
            </h2>
            <p className="admin-help">
              After successful fulfillment, show an optional follow-up. Visitors
              can decline and keep their original download. A paid follow-up
              always requires a separate checkout.
            </p>
            {choicesError && (
              <div role="alert" className="admin-notice admin-notice-error">
                Follow-up offers could not be loaded.{" "}
                <button
                  type="button"
                  className="admin-btn-ghost"
                  onClick={onRetryChoices}
                >
                  Try again
                </button>
              </div>
            )}
            <label className="block text-sm font-medium">
              Follow-up offer
              <select
                className="admin-input mt-2 w-full"
                value={form.nextOffer}
                disabled={choicesPending || choicesError}
                onChange={(event) => update("nextOffer", event.target.value)}
              >
                <option value="">No follow-up</option>
                {choices
                  ?.filter(
                    (offer) =>
                      offer.id !== savedId &&
                      (offer.status !== "archived" ||
                        offer.id === form.nextOffer),
                  )
                  .map((offer) => (
                    <option key={offer.id} value={offer.id}>
                      {offer.title} ({offer.status})
                    </option>
                  ))}
              </select>
            </label>
            {form.nextOffer && (
              <>
                <label className="block text-sm font-medium">
                  Time available after fulfillment, in minutes
                  <input
                    type="number"
                    min={0}
                    max={10080}
                    step={1}
                    className="admin-input mt-2 w-full"
                    value={form.window}
                    onChange={(event) => update("window", event.target.value)}
                  />
                  <span className="admin-help block mt-2">
                    0 means no timer. Otherwise use 30–10,080 minutes (up to
                    seven days). The deadline starts after the original order is
                    fulfilled and does not reset on a refresh.
                  </span>
                </label>
                <p className="admin-help">
                  The follow-up must be published to appear. Existing orders
                  keep the follow-up and time window in place when they were
                  created.
                </p>
              </>
            )}
            <label className="flex items-start gap-3 text-sm">
              <input
                type="checkbox"
                className="mt-1"
                checked={form.funnelOnly}
                onChange={(event) =>
                  onChange({
                    funnelOnly: event.target.checked,
                    ...(event.target.checked
                      ? { showInShop: false, shopFeatured: false }
                      : {}),
                  })
                }
              />
              <span>
                <strong>Make this offer available only as a follow-up</strong>
                <span className="admin-help block mt-1">
                  Its page may be viewed, but a qualifying original claim is
                  required. Link to this offer from another published offer
                  before sharing your flow.
                </span>
              </span>
            </label>
            {form.funnelOnly && (
              <p className="admin-help">
                {qualifyingParents.length
                  ? `Linked from: ${qualifyingParents.map((offer) => offer.title).join(", ")}.`
                  : "No published parent offer is linked yet. Save this offer, then edit its parent and choose it as the follow-up."}
              </p>
            )}
          </section>
          {nextChoice && (
            <Link
              to={`/admin/offers/${nextChoice.id}/edit`}
              className="admin-btn-secondary"
            >
              Edit the selected follow-up <ArrowRight size={15} />
            </Link>
          )}
        </>
      )}
    </div>
  );
}
